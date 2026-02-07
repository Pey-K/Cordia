use std::time::Duration;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum BeaconError {
    #[error("Connection failed: {0}")]
    ConnectionFailed(String),
    #[error("Timeout")]
    Timeout,
    #[error("Invalid URL: {0}")]
    InvalidUrl(String),
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum BeaconStatus {
    Connected,
    Disconnected,
    Checking,
}

/// Check if beacon is available at the given URL
pub async fn check_beacon_health(url: &str) -> Result<bool, BeaconError> {
    let timeout = Duration::from_secs(5);
    let url = url.trim();

    // Parse the URL to validate it
    if !url.starts_with("ws://") && !url.starts_with("wss://") {
        return Err(BeaconError::InvalidUrl(
            "URL must start with ws:// or wss://".to_string()
        ));
    }

    // Try HTTP health check (works for both local and tunneled connections)
    // Convert ws:// to http:// and wss:// to https://
    let http_url = if url.starts_with("wss://") {
        url.replace("wss://", "https://")
    } else {
        url.replace("ws://", "http://")
    };

    let health_url = format!("{}/health", http_url.trim_end_matches('/'));

    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| BeaconError::ConnectionFailed(e.to_string()))?;

    match client.get(&health_url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                Ok(true)
            } else {
                Err(BeaconError::ConnectionFailed(
                    format!("HTTP {} from health endpoint", response.status())
                ))
            }
        }
        Err(e) => {
            Err(BeaconError::ConnectionFailed(e.to_string()))
        }
    }
}

/// Get the default beacon URL
pub fn get_default_beacon_url() -> String {
    // Default public beacon for end users (Discord-like out-of-box behavior)
    "wss://beacon.pkcollection.net".to_string()
}
