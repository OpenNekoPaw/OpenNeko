//! Routes media-engine actions to their owning controllers.

use std::sync::Arc;

use crate::controllers::{
    AudioController, ColorCorrectionController, Controller, EffectsController, FilesController,
    ImageController, NodeController, PreviewsController, StreamController, TaskController,
    TimelineController, VideoController,
};
use crate::error::{ApiError, ApiResult};
use crate::preview::PreviewFileRegistry;
use crate::registry::{ResourceRegistry, StreamRegistry};
use neko_engine_kernel::facade::KernelServices;
use neko_engine_types::registry::{self, groups};
use neko_engine_types::{ActionRequest, ActionResponse};

/// Canonical router for the pruned media engine surface.
pub struct ActionRouter {
    node_controller: NodeController,
    task_controller: TaskController,
    video_controller: VideoController,
    audio_controller: AudioController,
    image_controller: ImageController,
    timeline_controller: TimelineController,
    stream_controller: StreamController,
    effects_controller: EffectsController,
    color_correction_controller: ColorCorrectionController,
    files_controller: FilesController,
    previews_controller: PreviewsController,
}

impl ActionRouter {
    /// Build the router from the kernel service graph and host registries.
    pub fn new(
        kernel_services: KernelServices,
        resource_registry: Arc<ResourceRegistry>,
        stream_registry: Arc<StreamRegistry>,
        preview_registry: Arc<PreviewFileRegistry>,
    ) -> Self {
        let file_access_registry = preview_registry.file_access().clone();
        Self {
            node_controller: NodeController::new(kernel_services.node_service),
            task_controller: TaskController::new(kernel_services.task_service),
            video_controller: VideoController::new(
                kernel_services.video_service,
                resource_registry.clone(),
                stream_registry.clone(),
            )
            .with_file_access_registry(file_access_registry.clone()),
            audio_controller: AudioController::new(
                kernel_services.audio_service,
                resource_registry.clone(),
                stream_registry.clone(),
            )
            .with_file_access_registry(file_access_registry.clone()),
            image_controller: ImageController::new(
                kernel_services.image_service,
                resource_registry,
            ),
            timeline_controller: TimelineController::new(
                kernel_services.timeline_service.clone(),
                kernel_services.export_service,
                stream_registry.clone(),
            ),
            stream_controller: StreamController::new(
                stream_registry,
                kernel_services.timeline_service,
            ),
            effects_controller: EffectsController::new(
                kernel_services.effects_service,
                kernel_services.effect_registry,
            ),
            color_correction_controller: ColorCorrectionController::new(),
            files_controller: FilesController::new(file_access_registry),
            previews_controller: PreviewsController::new(preview_registry),
        }
    }

    /// Route a request to the owning media controller.
    pub async fn route(&self, request: ActionRequest) -> ApiResult<ActionResponse> {
        let resource_id = (!request.id.is_empty()).then_some(request.id.as_str());
        match request.group.as_str() {
            groups::NODES => {
                self.node_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::TASKS => {
                self.task_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::VIDEOS => {
                self.video_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::AUDIOS => {
                self.audio_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::IMAGES => {
                self.image_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::TIMELINES => {
                self.timeline_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::STREAMS => {
                self.stream_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::EFFECTS => {
                self.effects_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::COLOR_CORRECTION => {
                self.color_correction_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::FILES => {
                self.files_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::PREVIEWS => {
                self.previews_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            _ => Err(ApiError::UnknownAction {
                group: request.group,
                action: request.action,
            }),
        }
    }

    /// Return the exact supported group set.
    pub fn groups(&self) -> Vec<&str> {
        registry::groups::ALL.to_vec()
    }

    /// Return supported actions for a registered group.
    pub fn actions(&self, group: &str) -> Option<&'static [&'static str]> {
        match group {
            groups::NODES => Some(self.node_controller.actions()),
            groups::TASKS => Some(self.task_controller.actions()),
            groups::VIDEOS => Some(self.video_controller.actions()),
            groups::AUDIOS => Some(self.audio_controller.actions()),
            groups::IMAGES => Some(self.image_controller.actions()),
            groups::TIMELINES => Some(self.timeline_controller.actions()),
            groups::STREAMS => Some(self.stream_controller.actions()),
            groups::EFFECTS => Some(self.effects_controller.actions()),
            groups::COLOR_CORRECTION => Some(self.color_correction_controller.actions()),
            groups::FILES => Some(self.files_controller.actions()),
            groups::PREVIEWS => Some(self.previews_controller.actions()),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_router() -> ActionRouter {
        let kernel_services =
            neko_engine_kernel::facade::ServiceFactory::new().create_with_gpu(None);
        ActionRouter::new(
            kernel_services,
            Arc::new(ResourceRegistry::new()),
            Arc::new(StreamRegistry::new()),
            Arc::new(PreviewFileRegistry::new()),
        )
    }

    #[tokio::test]
    async fn routes_media_health() {
        let response = create_test_router()
            .route(ActionRequest::new(groups::NODES, "health"))
            .await
            .expect("route health");
        assert!(response.is_ok());
    }

    #[tokio::test]
    async fn rejects_removed_group() {
        let result = create_test_router()
            .route(ActionRequest::new("scenes", "snapshot"))
            .await;
        assert!(matches!(result, Err(ApiError::UnknownAction { .. })));
    }

    #[test]
    fn registry_exposes_only_routable_groups() {
        let router = create_test_router();
        assert_eq!(router.groups(), registry::groups::ALL);
        assert!(router
            .groups()
            .iter()
            .all(|group| router.actions(group).is_some()));
    }
}
