//! Controllers for handling action groups
//!
//! Each controller handles a specific group of actions:
//! - VideoController: videos:* actions
//! - AudioController: audios:* actions
//! - ImageController: images:* actions
//! - TimelineController: timelines:* actions (including export)
//! - TaskController: tasks:* actions
//! - NodeController: nodes:* actions
//! - StreamController: streams:* actions (lifecycle management)
//! - EffectsController: effects:* actions (custom shader effects)
//! - ColorCorrectionController: color-correction:* actions (LUT management)

mod audio;
mod color_correction;
mod effects;
mod files;
mod image;
mod node;
mod previews;
mod stream;
mod task;
mod timeline;
pub(crate) mod utils;
mod video;

pub use audio::AudioController;
pub use color_correction::ColorCorrectionController;
pub use effects::EffectsController;
pub use files::FilesController;
pub use image::ImageController;
pub use node::NodeController;
pub use previews::PreviewsController;
pub use stream::StreamController;
pub use task::TaskController;
pub use timeline::TimelineController;
pub use video::VideoController;

use crate::error::ApiResult;
use neko_engine_types::ActionResponse;
use serde_json::Value;

/// Controller trait for handling actions
#[allow(async_fn_in_trait)]
pub trait Controller: Send + Sync {
    /// Handle an action
    async fn handle(
        &self,
        action: &str,
        resource_id: Option<&str>,
        options: Value,
        body: Option<Value>,
    ) -> ApiResult<ActionResponse>;

    /// Get the group name this controller handles
    fn group(&self) -> &'static str;

    /// List supported actions
    fn actions(&self) -> &'static [&'static str];
}
