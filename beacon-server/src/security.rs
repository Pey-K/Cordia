//! Security configuration and middleware for the beacon.
//!
//! All settings are env-driven and future-forward: CORS, headers, body limit,
//! connection limits, and (optional) rate limiting. Designed to work behind
//! Cloudflare Zero Trust (CF-Connecting-IP / X-Forwarded-For) and to be
//! extended later (e.g. auth, stricter limits) without replacing this layer.

use axum::{
    extract::Request,
    http::{HeaderValue, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use governor::Quota;
use std::collections::HashMap;
use std::env;
use std::num::NonZeroU32;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::{AllowOrigin, CorsLayer};

/// Client IP as extracted from CF-Connecting-IP, X-Forwarded-For, or "unknown".
/// Injected into request extensions by client_ip_middleware for use in handlers.
#[derive(Clone, Debug)]
pub struct ClientIp(pub String);

/// Security-related configuration from environment.
/// All limits are optional (0 = disabled). Future: add auth, stricter CORS, etc.
#[derive(Clone, Debug)]
pub struct SecurityConfig {
    /// Comma-separated allowed CORS origins; unset or "*" = permissive.
    pub cors_origins: Option<String>,
    /// Max JSON/body size in bytes for REST; 0 = use default (1 MiB).
    pub max_body_bytes: usize,
    /// Max total WebSocket connections; 0 = unlimited.
    pub max_ws_connections: u32,
    /// Max WebSocket connections per client IP; 0 = unlimited.
    pub max_ws_per_ip: u32,
    /// REST requests per minute per IP; 0 = no limit.
    pub rate_limit_rest_per_min: u32,
    /// WebSocket messages per minute per IP; 0 = no limit.
    pub rate_limit_ws_per_min: u32,
}

impl SecurityConfig {
    pub fn from_env() -> Self {
        let max_body_bytes = env::var("BEACON_MAX_BODY_BYTES")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(1_000_000); // 1 MiB default

        let max_ws_connections = env::var("BEACON_MAX_WS_CONNECTIONS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);

        let max_ws_per_ip = env::var("BEACON_MAX_WS_PER_IP")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);

        let cors_origins = env::var("BEACON_CORS_ORIGINS").ok();

        let rate_limit_rest_per_min = env::var("BEACON_RATE_LIMIT_REST_PER_MIN")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(60);

        let rate_limit_ws_per_min = env::var("BEACON_RATE_LIMIT_WS_PER_MIN")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(250);

        Self {
            cors_origins,
            max_body_bytes,
            max_ws_connections,
            max_ws_per_ip,
            rate_limit_rest_per_min,
            rate_limit_ws_per_min,
        }
    }
}

/// Build CORS layer from config. Unset or "*" => permissive; otherwise comma-separated origins.
pub fn build_cors_layer(config: &SecurityConfig) -> CorsLayer {
    let origins = config
        .cors_origins
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty() && *s != "*");

    match origins {
        None => CorsLayer::permissive(),
        Some(list) => {
            let list: Vec<HeaderValue> = list
                .split(',')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .filter_map(|s| HeaderValue::try_from(s.to_string()).ok())
                .collect();
            if list.is_empty() {
                CorsLayer::permissive()
            } else {
                CorsLayer::new().allow_origin(AllowOrigin::list(list))
            }
        }
    }
}

/// Middleware that extracts client IP from CF-Connecting-IP, X-Forwarded-For, or "unknown"
/// and inserts it into request extensions. Run this before handlers that need ClientIp.
pub async fn client_ip_middleware(request: Request, next: Next) -> Response {
    let ip = request
        .headers()
        .get("cf-connecting-ip")
        .or_else(|| request.headers().get("x-forwarded-for"))
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let mut request = request;
    request.extensions_mut().insert(ClientIp(ip));
    next.run(request).await
}

/// Opaque per-IP rate limiter (REST and WS use the same type).
pub struct KeyedRateLimiter(governor::RateLimiter<
    String,
    governor::state::keyed::DashMapStateStore<String>,
    governor::clock::QuantaClock,
    governor::middleware::NoOpMiddleware<governor::clock::QuantaInstant>,
>);

impl KeyedRateLimiter {
    /// Build limiter: N units per minute per IP. Returns None if n == 0 (disabled).
    pub fn per_minute(n: u32) -> Option<Arc<Self>> {
        let nz = NonZeroU32::new(n)?;
        let quota = Quota::per_minute(nz);
        let limiter = governor::RateLimiter::keyed(quota);
        Some(Arc::new(KeyedRateLimiter(limiter)))
    }

    /// Returns true if the key is under the rate limit (one unit consumed). False if over limit.
    pub fn check_key(&self, key: &str) -> bool {
        self.0.check_key(&key.to_string()).is_ok()
    }
}

/// Build REST rate limiter: N requests per minute per IP. None if n == 0 (disabled).
pub fn build_rest_rate_limiter(requests_per_minute: u32) -> Option<Arc<KeyedRateLimiter>> {
    KeyedRateLimiter::per_minute(requests_per_minute)
}

/// Build WebSocket message rate limiter: N messages per minute per IP. None if n == 0 (disabled).
pub fn build_ws_rate_limiter(messages_per_minute: u32) -> Option<Arc<KeyedRateLimiter>> {
    KeyedRateLimiter::per_minute(messages_per_minute)
}

/// Middleware: reject REST request with 429 if client IP is over rate limit.
/// Run after client_ip_middleware so ClientIp is in extensions.
pub async fn rest_rate_limit_middleware(
    request: Request,
    next: Next,
    limiter: Arc<KeyedRateLimiter>,
) -> Response {
    let ip = request
        .extensions()
        .get::<ClientIp>()
        .map(|c| c.0.as_str())
        .unwrap_or("unknown");
    if !limiter.check_key(ip) {
        return (StatusCode::TOO_MANY_REQUESTS, "Rate limit exceeded").into_response();
    }
    next.run(request).await
}

/// Optional REST rate limit: when limiter is None, passes through; when Some, enforces limit.
pub async fn rest_rate_limit_middleware_optional(
    request: Request,
    next: Next,
    limiter: Option<Arc<KeyedRateLimiter>>,
) -> Response {
    if let Some(l) = limiter {
        rest_rate_limit_middleware(request, next, l).await
    } else {
        next.run(request).await
    }
}

/// Tracks WebSocket connection counts for global and per-IP limits.
pub struct ConnectionTracker {
    pub total: u32,
    pub per_ip: HashMap<String, u32>,
    pub max_total: u32,
    pub max_per_ip: u32,
}

impl ConnectionTracker {
    pub fn new(max_total: u32, max_per_ip: u32) -> Self {
        Self {
            total: 0,
            per_ip: HashMap::new(),
            max_total,
            max_per_ip,
        }
    }

    /// Returns true if a new connection from this IP would be under limits (no increment).
    pub fn can_accept(&self, ip: &str) -> bool {
        if self.max_total > 0 && self.total >= self.max_total {
            return false;
        }
        if self.max_per_ip > 0 {
            let per = self.per_ip.get(ip).copied().unwrap_or(0);
            if per >= self.max_per_ip {
                return false;
            }
        }
        true
    }

    /// Returns Ok(()) if under limits and connection was registered; Err(()) if over limit.
    pub fn try_register(&mut self, ip: &str) -> Result<(), ()> {
        if self.max_total > 0 && self.total >= self.max_total {
            return Err(());
        }
        let per = self.per_ip.entry(ip.to_string()).or_insert(0);
        if self.max_per_ip > 0 && *per >= self.max_per_ip {
            return Err(());
        }
        self.total += 1;
        *per += 1;
        Ok(())
    }

    pub fn unregister(&mut self, ip: &str) {
        if let Some(n) = self.per_ip.get_mut(ip) {
            *n = n.saturating_sub(1);
            if *n == 0 {
                self.per_ip.remove(ip);
            }
        }
        self.total = self.total.saturating_sub(1);
    }
}

/// Shared connection tracker for use in AppState and ws_handler.
pub type SharedConnectionTracker = Arc<RwLock<ConnectionTracker>>;
