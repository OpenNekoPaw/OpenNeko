use super::*;
use crate::services::TaskService;
use neko_engine_types::Resolution;

fn create_test_service() -> TimelineService {
    let task_service = Arc::new(TaskService::new());
    TimelineService::new(None, task_service)
}

fn create_test_timeline() -> Timeline {
    Timeline::new(Resolution::full_hd(), 30.0)
}

#[tokio::test]
async fn test_timeline_service_composite_no_gpu() {
    let service = create_test_service();
    let timeline = create_test_timeline();
    let result = service.composite(&timeline, 0).await;
    assert!(result.is_err());
    assert!(result
        .unwrap_err()
        .to_string()
        .contains("GPU context required"));
}

#[tokio::test]
async fn test_timeline_service_start_stream_no_gpu() {
    let service = create_test_service();
    let timeline = create_test_timeline();
    let config = StreamConfig::default();
    let result = service.start_stream(&timeline, "session1", config).await;
    assert!(result.is_err());
    assert!(result
        .unwrap_err()
        .to_string()
        .contains("GPU context required"));
}

#[tokio::test]
async fn test_timeline_service_stop_stream_not_found() {
    let service = create_test_service();
    let stream_id = StreamId::new("test");
    let result = service.stop_stream(&stream_id).await;
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("Stream not found"));
}

#[tokio::test]
async fn test_timeline_service_pause_not_found() {
    let service = create_test_service();
    let stream_id = StreamId::new("test");
    let result = service.pause(&stream_id).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_timeline_service_resume_not_found() {
    let service = create_test_service();
    let stream_id = StreamId::new("test");
    let result = service.resume(&stream_id).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_timeline_service_set_speed_not_found() {
    let service = create_test_service();
    let stream_id = StreamId::new("test");
    let result = service.set_speed(&stream_id, 2.0).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_timeline_service_seek_not_found() {
    let service = create_test_service();
    let stream_id = StreamId::new("test");
    let result = service.seek(&stream_id, 1.0).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_timeline_service_set_loop_not_found() {
    let service = create_test_service();
    let stream_id = StreamId::new("test");
    let region = LoopRegion::new(0.0, 5.0);
    let result = service.set_loop(&stream_id, Some(region)).await;
    assert!(result.is_err());
}

#[test]
fn test_timeline_service_trait_object() {
    fn _assert_impl<T: ITimelineService>() {}
    _assert_impl::<TimelineService>();
}

#[tokio::test]
async fn test_timeline_service_probe_file_not_found() {
    let service = create_test_service();
    let result = service.probe(Path::new("/nonexistent/file.nkv")).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_timeline_service_probe_valid_jvi() {
    use std::io::Write;
    use tempfile::NamedTempFile;

    let json = r#"{
        "version": "1.0",
        "name": "Test Project",
        "resolution": { "width": 1920, "height": 1080 },
        "fps": 30,
        "tracks": [
            {
                "id": "track-1",
                "name": "Main Track",
                "type": "media",
                "elements": [
                    {
                        "type": "media",
                        "id": "elem-1",
                        "name": "clip1.mp4",
                        "src": "clip1.mp4",
                        "duration": 5.0,
                        "startTime": 0.0
                    }
                ],
                "muted": false
            },
            {
                "id": "track-2",
                "name": "Audio Track",
                "type": "audio",
                "elements": [],
                "muted": false
            }
        ]
    }"#;

    let mut temp_file = NamedTempFile::new().unwrap();
    temp_file.write_all(json.as_bytes()).unwrap();

    let service = create_test_service();
    let result = service.probe(temp_file.path()).await;
    assert!(result.is_ok());

    let info = result.unwrap();
    assert_eq!(info.name, "Test Project");
    assert_eq!(info.version, "1.0");
    assert_eq!(info.width, 1920);
    assert_eq!(info.height, 1080);
    assert_eq!(info.fps, 30.0);
    assert_eq!(info.track_count, 2);
    assert_eq!(info.element_count, 1);
    assert_eq!(info.media_references.len(), 1);
    assert_eq!(info.media_references[0].element_id, "elem-1");
    assert_eq!(info.media_references[0].media_type, "video");
    assert!(!info.media_references[0].exists);
}
