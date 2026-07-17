//! NodeController - handles nodes:* actions

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use neko_engine_kernel::contracts::codec::detect_hw_encoders;
use neko_engine_kernel::contracts::codec::HwEncoderTypeExt;
use neko_engine_kernel::contracts::services::INodeService;
use neko_engine_types::registry;
use neko_engine_types::ActionResponse;
use neko_engine_types::{HwEncoderType, VideoCodec};
use serde_json::Value;
use std::sync::Arc;

/// Controller for node-related actions
pub struct NodeController {
    node_service: Arc<dyn INodeService>,
}

impl NodeController {
    /// Create a new NodeController
    pub fn new(node_service: Arc<dyn INodeService>) -> Self {
        Self { node_service }
    }
}

impl Controller for NodeController {
    async fn handle(
        &self,
        action: &str,
        _resource_id: Option<&str>,
        _options: Value,
        _body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        match action {
            "health" => {
                let health = self.node_service.health().await?;
                Ok(ActionResponse::ok("", serde_json::to_value(health)?))
            }
            "metric" => {
                let metrics = self.node_service.metrics().await?;
                Ok(ActionResponse::ok("", serde_json::to_value(metrics)?))
            }
            "gpu" => {
                let gpu_info = self.node_service.gpu_info().await?;
                Ok(ActionResponse::ok("", serde_json::to_value(gpu_info)?))
            }
            "hw_capabilities" => {
                let available = detect_hw_encoders();
                let best = available.into_iter().next().unwrap_or(HwEncoderType::None);

                let codecs = serde_json::json!({
                    "h264":   best.encoder_name(VideoCodec::H264),
                    "h265":   best.encoder_name(VideoCodec::H265),
                    "av1":    best.encoder_name(VideoCodec::Av1),
                    "vp9":    best.encoder_name(VideoCodec::Vp9),
                    "prores": best.encoder_name(VideoCodec::ProRes),
                });
                Ok(ActionResponse::ok("", codecs))
            }
            _ => Err(ApiError::UnknownAction {
                group: "nodes".to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::NODES
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::NODES
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_engine_kernel::facade::ServiceFactory;

    fn create_test_controller() -> NodeController {
        let services = ServiceFactory::new().create_with_gpu(None);
        NodeController::new(services.node_service)
    }

    #[tokio::test]
    async fn test_node_controller_health() {
        let controller = create_test_controller();

        let response = controller
            .handle("health", None, Value::Null, None)
            .await
            .unwrap();

        assert!(response.is_ok());
    }

    #[tokio::test]
    async fn test_node_controller_metric() {
        let controller = create_test_controller();

        let response = controller
            .handle("metric", None, Value::Null, None)
            .await
            .unwrap();

        assert!(response.is_ok());
    }

    #[tokio::test]
    async fn test_node_controller_unknown_action() {
        let controller = create_test_controller();

        let result = controller.handle("unknown", None, Value::Null, None).await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_node_controller_hw_capabilities() {
        let controller = create_test_controller();

        let response = controller
            .handle("hw_capabilities", None, Value::Null, None)
            .await
            .unwrap();

        assert!(response.is_ok());
        // Response data must contain all 5 codec keys
        let data = response.data.unwrap();
        let data = data.as_object().unwrap();
        assert!(data.contains_key("h264"));
        assert!(data.contains_key("h265"));
        assert!(data.contains_key("av1"));
        assert!(data.contains_key("vp9"));
        assert!(data.contains_key("prores"));
        // VP9 is always null (no hardware encoder exists)
        assert!(data["vp9"].is_null());
    }
}
