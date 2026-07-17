//! Preview backend contracts and default adapters.

// TODO(P2): connect provider and encode backends to preview HTTP/WebSocket
// routes after the registry-backed preview path is promoted.
#![allow(dead_code)]

use std::sync::Arc;

use crate::domain::Timeline;
use crate::error::Result;
use crate::export::GpuPipelineTiming;
use neko_engine_gpu::GpuContext;
use neko_engine_types::VideoGpuFrame;

use super::pipeline::{PreviewFrame, PreviewPipeline, PreviewPipelineConfig};
use super::provider::{PreviewArtifact, PreviewProviderRegistry, PreviewRequest};

/// Routes preview provider requests without exposing concrete registry internals.
pub trait PreviewProviderBackend: Send + Sync {
    /// Generate a preview artifact for one request.
    fn generate(&self, request: &PreviewRequest) -> Result<PreviewArtifact>;

    /// Registered provider ids, primarily for diagnostics/tests.
    fn provider_ids(&self) -> Vec<&'static str>;
}

/// Default provider backend using `PreviewProviderRegistry`.
pub struct DefaultPreviewProviderBackend {
    registry: PreviewProviderRegistry,
}

impl Default for DefaultPreviewProviderBackend {
    fn default() -> Self {
        Self {
            registry: PreviewProviderRegistry::with_defaults(),
        }
    }
}

impl DefaultPreviewProviderBackend {
    /// Create a provider backend from a custom registry.
    pub fn new(registry: PreviewProviderRegistry) -> Self {
        Self { registry }
    }
}

impl PreviewProviderBackend for DefaultPreviewProviderBackend {
    fn generate(&self, request: &PreviewRequest) -> Result<PreviewArtifact> {
        self.registry.generate(request)
    }

    fn provider_ids(&self) -> Vec<&'static str> {
        self.registry.provider_ids()
    }
}

/// Render backend used by streaming preview orchestration.
pub trait PreviewRenderBackend {
    /// Initialize GPU resources without opening the rollback encoder.
    fn initialize_gpu_only(&mut self) -> Result<()>;

    /// Hot-update timeline data.
    fn update_timeline(&mut self, timeline: Timeline);

    /// Hot-update GPU output config.
    fn update_gpu_config(&mut self, config: PreviewPipelineConfig);

    /// Render one GPU-resident frame.
    fn render_gpu_frame_timed(
        &mut self,
        time: f64,
        background_color: [f32; 4],
    ) -> Result<(VideoGpuFrame, GpuPipelineTiming)>;

    /// Reset frame sequencing.
    fn reset_frame_counter(&mut self);

    /// Whether hardware encoding is active for encoded-preview mode.
    fn is_hw_active(&self) -> bool;

    /// Close backend resources.
    fn close(&mut self);
}

impl PreviewRenderBackend for PreviewPipeline {
    fn initialize_gpu_only(&mut self) -> Result<()> {
        PreviewPipeline::initialize_gpu_only(self)
    }

    fn update_timeline(&mut self, timeline: Timeline) {
        PreviewPipeline::update_timeline(self, timeline);
    }

    fn update_gpu_config(&mut self, config: PreviewPipelineConfig) {
        PreviewPipeline::update_gpu_config(self, config);
    }

    fn render_gpu_frame_timed(
        &mut self,
        time: f64,
        background_color: [f32; 4],
    ) -> Result<(VideoGpuFrame, GpuPipelineTiming)> {
        PreviewPipeline::render_gpu_frame_timed(self, time, background_color)
    }

    fn reset_frame_counter(&mut self) {
        PreviewPipeline::reset_frame_counter(self);
    }

    fn is_hw_active(&self) -> bool {
        PreviewPipeline::is_hw_active(self)
    }

    fn close(&mut self) {
        PreviewPipeline::close(self);
    }
}

/// Factory for preview render backends.
pub trait PreviewRenderBackendFactory: Send + Sync {
    /// Create a render backend for one timeline preview stream.
    fn create(
        &self,
        timeline: Timeline,
        config: PreviewPipelineConfig,
    ) -> Result<Box<dyn PreviewRenderBackend>>;
}

/// Production preview render backend factory.
pub struct DefaultPreviewRenderBackendFactory {
    gpu_ctx: Arc<GpuContext>,
}

impl DefaultPreviewRenderBackendFactory {
    /// Create a production render backend factory.
    pub fn new(gpu_ctx: Arc<GpuContext>) -> Self {
        Self { gpu_ctx }
    }
}

impl PreviewRenderBackendFactory for DefaultPreviewRenderBackendFactory {
    fn create(
        &self,
        timeline: Timeline,
        config: PreviewPipelineConfig,
    ) -> Result<Box<dyn PreviewRenderBackend>> {
        Ok(Box::new(PreviewPipeline::new(
            timeline,
            Arc::clone(&self.gpu_ctx),
            config,
        )?))
    }
}

/// Encoded preview backend retained for direct `PreviewPipeline` consumers.
pub trait PreviewEncodeBackend {
    /// Render and encode one frame.
    fn render_frame(&mut self, time: f64, background_color: [f32; 4]) -> Result<Vec<PreviewFrame>>;

    /// Flush encoded preview packets.
    fn flush(&mut self) -> Result<Vec<PreviewFrame>>;
}

impl PreviewEncodeBackend for PreviewPipeline {
    fn render_frame(&mut self, time: f64, background_color: [f32; 4]) -> Result<Vec<PreviewFrame>> {
        PreviewPipeline::render_frame(self, time, background_color)
    }

    fn flush(&mut self) -> Result<Vec<PreviewFrame>> {
        PreviewPipeline::flush(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::Timeline;
    use crate::preview::provider::{PreviewArtifactKind, PreviewProviderKind};
    use neko_engine_types::{GpuFrameLease, GpuOutputHandle, Resolution};
    use std::path::PathBuf;
    use std::sync::Mutex;

    struct FakeProviderBackend {
        artifact: PreviewArtifact,
    }

    impl PreviewProviderBackend for FakeProviderBackend {
        fn generate(&self, _request: &PreviewRequest) -> Result<PreviewArtifact> {
            Ok(self.artifact.clone())
        }

        fn provider_ids(&self) -> Vec<&'static str> {
            vec!["fake"]
        }
    }

    #[test]
    fn provider_backend_can_route_without_default_registry() {
        let backend = FakeProviderBackend {
            artifact: PreviewArtifact {
                provider_id: "fake".to_string(),
                kind: PreviewArtifactKind::Unsupported,
                source: "missing.xyz".to_string(),
                projection: None,
                output_path: None,
                mime_type: None,
                dimensions: None,
                file_size_bytes: None,
                metadata: None,
                error: Some("not available".to_string()),
            },
        };

        let artifact = backend
            .generate(&PreviewRequest {
                source: PathBuf::from("missing.xyz"),
                kind: PreviewProviderKind::Image,
                expected_projection: None,
                explicit_open: false,
                variant: None,
            })
            .expect("fake provider");

        assert_eq!(backend.provider_ids(), vec!["fake"]);
        assert_eq!(artifact.kind, PreviewArtifactKind::Unsupported);
        assert!(artifact.error.is_some());
    }

    struct FakeRenderFactory {
        events: Arc<Mutex<Vec<&'static str>>>,
    }

    impl PreviewRenderBackendFactory for FakeRenderFactory {
        fn create(
            &self,
            _timeline: Timeline,
            _config: PreviewPipelineConfig,
        ) -> Result<Box<dyn PreviewRenderBackend>> {
            self.events.lock().unwrap().push("create");
            Ok(Box::new(FakeRenderBackend {
                events: Arc::clone(&self.events),
                frame_index: 0,
            }))
        }
    }

    struct FakeRenderBackend {
        events: Arc<Mutex<Vec<&'static str>>>,
        frame_index: u64,
    }

    impl PreviewRenderBackend for FakeRenderBackend {
        fn initialize_gpu_only(&mut self) -> Result<()> {
            self.events.lock().unwrap().push("init");
            Ok(())
        }

        fn update_timeline(&mut self, _timeline: Timeline) {
            self.events.lock().unwrap().push("timeline");
        }

        fn update_gpu_config(&mut self, _config: PreviewPipelineConfig) {
            self.events.lock().unwrap().push("config");
        }

        fn render_gpu_frame_timed(
            &mut self,
            _time: f64,
            _background_color: [f32; 4],
        ) -> Result<(VideoGpuFrame, GpuPipelineTiming)> {
            self.events.lock().unwrap().push("render");
            let frame = VideoGpuFrame {
                lease: GpuFrameLease::new(GpuOutputHandle::Unsupported {
                    platform: "test",
                    reason: "fake preview frame".to_string(),
                }),
                pts: 0,
                duration: 1,
                frame_index: self.frame_index,
                width: 2,
                height: 2,
                force_keyframe: false,
                diagnostics: None,
            };
            self.frame_index += 1;
            Ok((frame, GpuPipelineTiming::default()))
        }

        fn reset_frame_counter(&mut self) {
            self.frame_index = 0;
            self.events.lock().unwrap().push("reset");
        }

        fn is_hw_active(&self) -> bool {
            false
        }

        fn close(&mut self) {
            self.events.lock().unwrap().push("close");
        }
    }

    #[test]
    fn render_backend_factory_can_inject_fake_renderer() {
        let events = Arc::new(Mutex::new(Vec::new()));
        let factory = FakeRenderFactory {
            events: Arc::clone(&events),
        };
        let timeline = Timeline::new(Resolution::full_hd(), 30.0);
        let mut backend = factory
            .create(timeline, PreviewPipelineConfig::default())
            .expect("fake render backend");

        backend.initialize_gpu_only().expect("init");
        let (frame, _) = backend
            .render_gpu_frame_timed(0.0, [0.0, 0.0, 0.0, 1.0])
            .expect("render");
        backend.reset_frame_counter();

        assert_eq!(frame.width, 2);
        assert_eq!(frame.height, 2);
        assert_eq!(
            *events.lock().unwrap(),
            vec!["create", "init", "render", "reset"]
        );
    }
}
