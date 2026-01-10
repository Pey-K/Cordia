use std::time::Duration;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum SignalingError {
    #[error("Connection failed: {0}")]
    ConnectionFailed(String),
    #[error("Timeout")]
    Timeout,
    #[error("Invalid URL: {0}")]
    InvalidUrl(String),
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum SignalingStatus {
    Connected,
    Disconnected,
    Checking,
}

/// Check if signaling server is available at the given URL
pub async fn check_signaling_health(url: &str) -> Result<bool, SignalingError> {
    let timeout = Duration::from_secs(5);

    // Parse the URL to validate it
    if !url.starts_with("ws://") && !url.starts_with("wss://") {
        return Err(SignalingError::InvalidUrl(
            "URL must start with ws:// or wss://".to_string()
        ));
    }

    // Convert ws:// to http:// and wss:// to https:// for health check
    let http_url = if url.starts_with("wss://") {
        url.replace("wss://", "https://")
    } else {
        url.replace("ws://", "http://")
    };

    // Add /health endpoint
    let health_url = format!("{}/health", http_url.trim_end_matches('/'));

    // Try HTTP health check first (works through proxies/tunnels)
    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| SignalingError::ConnectionFailed(e.to_string()))?;

    match client.get(&health_url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                Ok(true)
            } else {
                Err(SignalingError::ConnectionFailed(
                    format!("HTTP {} from health endpoint", response.status())
                ))
            }
        }
        Err(e) => {
            Err(SignalingError::ConnectionFailed(e.to_string()))
        }
    }
}

/// Get the default signaling server URL
pub fn get_default_signaling_url() -> String {
    "ws://127.0.0.1:9001".to_string()
}
