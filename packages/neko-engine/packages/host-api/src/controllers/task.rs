//! TaskController - handles tasks:* actions

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use neko_engine_kernel::contracts::services::ITaskService;
use neko_engine_types::registry;
use neko_engine_types::ActionResponse;
use serde_json::Value;
use std::sync::Arc;

/// Controller for task-related actions
pub struct TaskController {
    task_service: Arc<dyn ITaskService>,
}

impl TaskController {
    /// Create a new TaskController
    pub fn new(task_service: Arc<dyn ITaskService>) -> Self {
        Self { task_service }
    }
}

impl Controller for TaskController {
    async fn handle(
        &self,
        action: &str,
        resource_id: Option<&str>,
        _options: Value,
        _body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        match action {
            "probe" => {
                let task_id = resource_id.ok_or_else(|| {
                    ApiError::InvalidRequest("task_id required for tasks:probe".to_string())
                })?;

                let progress = self.task_service.probe(task_id)?;
                Ok(ActionResponse::ok("", serde_json::to_value(progress)?))
            }
            "pause" => {
                let task_id = resource_id.ok_or_else(|| {
                    ApiError::InvalidRequest("task_id required for tasks:pause".to_string())
                })?;

                self.task_service.pause(task_id)?;
                Ok(ActionResponse::ok("", Value::Null))
            }
            "resume" => {
                let task_id = resource_id.ok_or_else(|| {
                    ApiError::InvalidRequest("task_id required for tasks:resume".to_string())
                })?;

                self.task_service.resume(task_id)?;
                Ok(ActionResponse::ok("", Value::Null))
            }
            "cancel" => {
                let task_id = resource_id.ok_or_else(|| {
                    ApiError::InvalidRequest("task_id required for tasks:cancel".to_string())
                })?;

                self.task_service.cancel(task_id)?;
                Ok(ActionResponse::ok("", Value::Null))
            }
            "list" => {
                let tasks = self.task_service.list();
                Ok(ActionResponse::ok("", serde_json::to_value(tasks)?))
            }
            _ => Err(ApiError::UnknownAction {
                group: "tasks".to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::TASKS
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::TASKS
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_engine_kernel::facade::ServiceFactory;

    fn create_test_controller() -> TaskController {
        let services = ServiceFactory::new().create_with_gpu(None);
        TaskController::new(services.task_service)
    }

    #[tokio::test]
    async fn test_task_controller_list() {
        let controller = create_test_controller();

        let response = controller
            .handle("list", None, Value::Null, None)
            .await
            .unwrap();

        assert!(response.is_ok());
    }

    #[tokio::test]
    async fn test_task_controller_probe_missing_id() {
        let controller = create_test_controller();

        let result = controller.handle("probe", None, Value::Null, None).await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_task_controller_unknown_action() {
        let controller = create_test_controller();

        let result = controller.handle("unknown", None, Value::Null, None).await;

        assert!(result.is_err());
    }
}
