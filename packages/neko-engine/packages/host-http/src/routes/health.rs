//! Health check endpoint

use axum::Json;
use serde_json::{json, Value};

/// GET /health — Simple health check
pub async fn health_handler() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "service": "neko-engine"
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_health_handler() {
        let Json(response) = health_handler().await;
        assert_eq!(response["status"], "ok");
        assert_eq!(response["service"], "neko-engine");
    }
}
