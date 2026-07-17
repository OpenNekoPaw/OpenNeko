use super::*;
use crate::export::types::{ExportAudioCodec, ExportHwEncoder, ExportPreset, ExportVideoCodec};
use neko_engine_types::Resolution;

fn create_test_settings() -> ExportSettings {
    ExportSettings {
        width: 1920,
        height: 1080,
        fps: 30.0,
        video_codec: ExportVideoCodec::H264,
        video_bitrate: None,
        audio_codec: ExportAudioCodec::Aac,
        audio_bitrate: None,
        hw_encoder: ExportHwEncoder::None,
        time_range: None,
        preset: ExportPreset::Medium,
        use_zero_copy_gpu: false,
    }
}

async fn create_test_context() -> Option<Arc<GpuContext>> {
    GpuContext::new().await.ok().map(Arc::new)
}

#[tokio::test]
async fn pipeline_creation_preserves_media_timeline_dimensions() {
    let Some(ctx) = create_test_context().await else {
        return;
    };
    let mut timeline = Timeline::new(Resolution::full_hd(), 30.0);
    timeline.duration = 10.0;

    let pipeline = GpuExportPipeline::new(timeline, create_test_settings(), ctx)
        .expect("create media export pipeline");

    assert_eq!(pipeline.total_frames(), 300);
    assert_eq!(pipeline.output_dimensions(), (1920, 1080));
}

#[tokio::test]
async fn empty_timeline_composites_without_non_media_renderers() {
    let Some(ctx) = create_test_context().await else {
        return;
    };
    let mut timeline = Timeline::new(Resolution::full_hd(), 30.0);
    timeline.duration = 1.0;
    let mut pipeline =
        GpuExportPipeline::new(timeline, create_test_settings(), ctx).expect("create pipeline");
    pipeline.initialize().expect("initialize pipeline");

    let result = pipeline
        .process_frame(0.0, [0.0, 0.0, 0.0, 1.0])
        .expect("composite empty frame");

    assert_eq!(result.layer_count, 0);
    assert_eq!((result.width, result.height), (1920, 1080));
}

#[tokio::test]
async fn effect_dispatcher_keeps_media_effect_registry() {
    let Some(ctx) = create_test_context().await else {
        return;
    };
    let dispatcher = EffectDispatcher::new(ctx).expect("create effect dispatcher");
    for effect_id in [
        "gaussian-blur",
        "sharpen",
        "vignette",
        "color-correction",
        "chroma-key",
        "pixelate",
    ] {
        assert!(
            dispatcher.has_effect(effect_id),
            "missing effect {effect_id}"
        );
    }
}
