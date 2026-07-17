//! Static file serving with HTTP Range support for preview surfaces.
//!
//! JSON preview commands are owned by `host-api::preview` and ActionRouter.
//! These handlers keep HTTP binary transport direct and provide temporary
//! HTTP JSON compatibility aliases backed by the same preview registry.

use axum::{
    body::Body,
    extract::{Extension, Path},
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use neko_engine_types::RegisterFileRequest;
use neko_host_api::file_access::FileAccessRegistry;
use neko_host_api::preview::{
    mime_for_path, PreviewFileRegistry, PreviewVariant, PreviewVariantRequest,
    RegisterPreviewAssetRequest, RegisterRequest, RegisterResponse,
    UpdatePreviewAssetMetadataRequest,
};
use neko_host_api::ApiError;
use std::{path::PathBuf, sync::Arc};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;

/// POST /v1/preview/register
pub async fn handle_register(
    Extension(registry): Extension<Arc<PreviewFileRegistry>>,
    Json(body): Json<RegisterRequest>,
) -> impl IntoResponse {
    let result =
        tokio::task::spawn_blocking(move || registry.register(PathBuf::from(body.file_path))).await;
    match result {
        Ok(Ok(token)) => Json(RegisterResponse { token }).into_response(),
        Ok(Err(error)) => api_error_response(error),
        Err(error) => {
            tracing::error!("Preview register task failed: {}", error);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

/// DELETE /v1/preview/unregister/:token
pub async fn handle_unregister(
    Extension(registry): Extension<Arc<PreviewFileRegistry>>,
    Path(token): Path<String>,
) -> impl IntoResponse {
    match registry.unregister_token(&token) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => api_error_response(error),
    }
}

/// POST /v1/files/register
pub async fn handle_file_register(
    Extension(registry): Extension<Arc<PreviewFileRegistry>>,
    Json(body): Json<RegisterFileRequest>,
) -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(move || {
        let path = body.local_path().ok_or_else(|| {
            ApiError::InvalidRequest(
                "path, filePath, or source required for files register".to_string(),
            )
        })?;
        registry
            .file_access()
            .register(PathBuf::from(path), body.purpose())
    })
    .await;
    match result {
        Ok(Ok(registered)) => Json(registered).into_response(),
        Ok(Err(error)) => api_error_response(error),
        Err(error) => {
            tracing::error!("File register task failed: {}", error);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

/// DELETE /v1/files/:token
pub async fn handle_file_unregister(
    Extension(registry): Extension<Arc<PreviewFileRegistry>>,
    Path(token): Path<String>,
) -> impl IntoResponse {
    match registry.file_access().unregister_token(&token) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => api_error_response(error),
    }
}

/// POST /v1/preview/assets
pub async fn handle_register_asset(
    Extension(registry): Extension<Arc<PreviewFileRegistry>>,
    Json(body): Json<RegisterPreviewAssetRequest>,
) -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(move || registry.register_asset(body)).await;
    match result {
        Ok(Ok(manifest)) => Json(manifest).into_response(),
        Ok(Err(error)) => api_error_response(error),
        Err(error) => {
            tracing::error!("Preview asset register task failed: {}", error);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

/// POST /v1/preview/assets/:asset_id/variants
pub async fn handle_request_variant(
    Extension(registry): Extension<Arc<PreviewFileRegistry>>,
    Path(asset_id): Path<String>,
    Json(body): Json<PreviewVariantRequest>,
) -> impl IntoResponse {
    let result =
        tokio::task::spawn_blocking(move || registry.request_variant(&asset_id, body)).await;
    match result {
        Ok(Ok(variant)) => preview_variant_response(variant),
        Ok(Err(ApiError::NotFound(_))) => {
            (StatusCode::NOT_FOUND, "asset not found").into_response()
        }
        Ok(Err(error)) => api_error_response(error),
        Err(error) => {
            tracing::error!("Preview variant task failed: {}", error);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

/// PUT /v1/preview/assets/:asset_id/metadata
pub async fn handle_update_asset_metadata(
    Extension(registry): Extension<Arc<PreviewFileRegistry>>,
    Path(asset_id): Path<String>,
    Json(body): Json<UpdatePreviewAssetMetadataRequest>,
) -> impl IntoResponse {
    let result =
        tokio::task::spawn_blocking(move || registry.update_asset_metadata(&asset_id, body)).await;
    match result {
        Ok(Ok(manifest)) => Json(manifest).into_response(),
        Ok(Err(error)) => api_error_response(error),
        Err(error) => {
            tracing::error!("Preview metadata update task failed: {}", error);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

/// DELETE /v1/preview/assets/:asset_id_or_token
pub async fn handle_unregister_asset(
    Extension(registry): Extension<Arc<PreviewFileRegistry>>,
    Path(asset_id_or_token): Path<String>,
) -> impl IntoResponse {
    let result =
        tokio::task::spawn_blocking(move || registry.unregister_asset(&asset_id_or_token)).await;
    match result {
        Ok(Ok(())) => StatusCode::NO_CONTENT.into_response(),
        Ok(Err(error)) => api_error_response(error),
        Err(error) => {
            tracing::error!("Preview asset unregister task failed: {}", error);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

/// GET /v1/preview/file/:token
pub async fn handle_file(
    Extension(registry): Extension<Arc<PreviewFileRegistry>>,
    Path(token): Path<String>,
    headers: HeaderMap,
) -> impl IntoResponse {
    serve_file_token(registry.file_access().clone(), token, headers).await
}

/// GET /v1/files/:token
pub async fn handle_general_file(
    Extension(registry): Extension<Arc<PreviewFileRegistry>>,
    Path(token): Path<String>,
    headers: HeaderMap,
) -> impl IntoResponse {
    serve_file_token(registry.file_access().clone(), token, headers).await
}

async fn serve_file_token(
    registry: Arc<FileAccessRegistry>,
    token: String,
    headers: HeaderMap,
) -> axum::response::Response {
    let Some(path) = (match registry.lookup_token(&token) {
        Ok(path) => path,
        Err(error) => return api_error_response(error),
    }) else {
        return (StatusCode::NOT_FOUND, "token not found").into_response();
    };

    serve_file_path(path, headers).await
}

async fn serve_file_path(path: PathBuf, headers: HeaderMap) -> axum::response::Response {
    let metadata = match tokio::fs::metadata(&path).await {
        Ok(m) => m,
        Err(_) => return (StatusCode::NOT_FOUND, "file not found").into_response(),
    };
    let file_size = metadata.len();
    let mime = mime_for_path(&path);

    if let Some(range_hdr) = headers.get(header::RANGE) {
        let range_str = match range_hdr.to_str() {
            Ok(s) => s,
            Err(_) => return StatusCode::BAD_REQUEST.into_response(),
        };

        let Some((start, end)) = parse_byte_range(range_str, file_size) else {
            return (
                StatusCode::RANGE_NOT_SATISFIABLE,
                [(header::CONTENT_RANGE, format!("bytes */{file_size}"))],
                Body::empty(),
            )
                .into_response();
        };

        let length = end - start + 1;
        let mut file: tokio::fs::File = match tokio::fs::File::open(&path).await {
            Ok(f) => f,
            Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        };

        if file.seek(std::io::SeekFrom::Start(start)).await.is_err() {
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }

        let reader = file.take(length);
        let body = Body::from_stream(ReaderStream::new(reader));

        (
            StatusCode::PARTIAL_CONTENT,
            [
                (header::CONTENT_TYPE, mime),
                (header::ACCEPT_RANGES, "bytes".to_string()),
                (
                    header::CONTENT_RANGE,
                    format!("bytes {start}-{end}/{file_size}"),
                ),
                (header::CONTENT_LENGTH, length.to_string()),
                (header::CACHE_CONTROL, "public, max-age=3600".to_string()),
            ],
            body,
        )
            .into_response()
    } else {
        let file = match tokio::fs::File::open(&path).await {
            Ok(f) => f,
            Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        };

        let body = Body::from_stream(ReaderStream::new(file));

        (
            StatusCode::OK,
            [
                (header::CONTENT_TYPE, mime),
                (header::ACCEPT_RANGES, "bytes".to_string()),
                (header::CONTENT_LENGTH, file_size.to_string()),
                (header::CACHE_CONTROL, "public, max-age=3600".to_string()),
            ],
            body,
        )
            .into_response()
    }
}

fn preview_variant_response(variant: PreviewVariant) -> axum::response::Response {
    if let Some(error) = variant.error.as_ref().filter(|error| error.is_gpu_busy()) {
        let retry_after_secs = error
            .retry_after_ms
            .map(|ms| ms.div_ceil(1000).max(1).to_string())
            .unwrap_or_else(|| "1".to_string());
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            [(header::RETRY_AFTER, retry_after_secs)],
            Json(variant),
        )
            .into_response();
    }

    Json(variant).into_response()
}

fn api_error_response(error: ApiError) -> axum::response::Response {
    match error {
        ApiError::NotFound(message) => (StatusCode::NOT_FOUND, message).into_response(),
        ApiError::InvalidRequest(message) => (StatusCode::BAD_REQUEST, message).into_response(),
        ApiError::UnknownAction { .. } => StatusCode::BAD_REQUEST.into_response(),
        ApiError::ServiceError(message) => {
            (StatusCode::INTERNAL_SERVER_ERROR, message).into_response()
        }
        ApiError::StreamError(message) => {
            (StatusCode::INTERNAL_SERVER_ERROR, message).into_response()
        }
        ApiError::SerializationError(message) => (StatusCode::BAD_REQUEST, message).into_response(),
        ApiError::Internal(message) => (StatusCode::INTERNAL_SERVER_ERROR, message).into_response(),
    }
}

/// Parse `bytes=start-end` or `bytes=start-` into inclusive (start, end).
fn parse_byte_range(range: &str, file_size: u64) -> Option<(u64, u64)> {
    let suffix = range.strip_prefix("bytes=")?;
    let (start_str, end_str) = suffix.split_once('-')?;
    let start: u64 = start_str.parse().ok()?;
    let end: u64 = if end_str.is_empty() {
        file_size.saturating_sub(1)
    } else {
        end_str
            .parse::<u64>()
            .ok()?
            .min(file_size.saturating_sub(1))
    };
    if start > end {
        return None;
    }
    Some((start, end))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use image::{ImageBuffer, Rgb};
    use neko_engine_types::ActionRequest;
    use neko_host_api::preview::PreviewErrorState;
    use neko_host_api::EngineApi;
    use tempfile::tempdir;

    #[test]
    fn parse_byte_range_accepts_open_ended_range() {
        assert_eq!(parse_byte_range("bytes=10-", 100), Some((10, 99)));
    }

    #[test]
    fn parse_byte_range_rejects_invalid_bounds() {
        assert_eq!(parse_byte_range("bytes=20-10", 100), None);
        assert_eq!(parse_byte_range("bytes=a-b", 100), None);
    }

    #[tokio::test]
    async fn file_route_serves_range_from_shared_registry() {
        let dir = tempdir().expect("tempdir");
        let file_path = dir.path().join("preview.mp4");
        std::fs::write(&file_path, b"abcdef").expect("write preview");
        let registry = Arc::new(PreviewFileRegistry::with_allowed_roots(vec![dir
            .path()
            .to_path_buf()]));
        let token = registry.register(file_path).expect("register file");
        let mut headers = HeaderMap::new();
        headers.insert(header::RANGE, "bytes=1-3".parse().expect("range header"));

        let response = handle_file(Extension(registry), Path(token), headers)
            .await
            .into_response();

        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(
            response
                .headers()
                .get(header::CONTENT_RANGE)
                .and_then(|value| value.to_str().ok()),
            Some("bytes 1-3/6")
        );
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("read range body");
        assert_eq!(&body[..], b"bcd");
    }

    #[tokio::test]
    async fn general_file_route_matches_preview_alias_for_range_reads() {
        let dir = tempdir().expect("tempdir");
        let file_path = dir.path().join("preview.mp4");
        std::fs::write(&file_path, b"abcdef").expect("write preview");
        let preview_registry = Arc::new(PreviewFileRegistry::with_allowed_roots(vec![dir
            .path()
            .to_path_buf()]));
        let token = preview_registry.register(file_path).expect("register file");
        let mut preview_headers = HeaderMap::new();
        preview_headers.insert(header::RANGE, "bytes=2-5".parse().expect("range header"));
        let mut general_headers = HeaderMap::new();
        general_headers.insert(header::RANGE, "bytes=2-5".parse().expect("range header"));

        let preview_response = handle_file(
            Extension(preview_registry.clone()),
            Path(token.clone()),
            preview_headers,
        )
        .await
        .into_response();
        let general_response =
            handle_general_file(Extension(preview_registry), Path(token), general_headers)
                .await
                .into_response();

        assert_eq!(preview_response.status(), general_response.status());
        assert_eq!(
            preview_response.headers().get(header::CONTENT_RANGE),
            general_response.headers().get(header::CONTENT_RANGE)
        );
        assert_eq!(
            preview_response.headers().get(header::CONTENT_LENGTH),
            general_response.headers().get(header::CONTENT_LENGTH)
        );
        let preview_body = to_bytes(preview_response.into_body(), usize::MAX)
            .await
            .expect("read preview body");
        let general_body = to_bytes(general_response.into_body(), usize::MAX)
            .await
            .expect("read general body");
        assert_eq!(preview_body, general_body);
        assert_eq!(&general_body[..], b"cdef");
    }

    #[tokio::test]
    async fn preview_register_asset_http_alias_matches_action_router_semantics() {
        let dir = tempdir().expect("tempdir");
        let image_path = dir.path().join("studio_360.jpg");
        let image: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_pixel(4, 2, Rgb([20, 40, 60]));
        image.save(&image_path).expect("save image");
        let engine = Arc::new(EngineApi::without_gpu().expect("engine"));
        engine
            .set_preview_allowed_roots(vec![dir.path().to_path_buf()])
            .expect("preview roots");
        let registry = engine.preview_registry().clone();

        let http_response = handle_register_asset(
            Extension(registry.clone()),
            Json(RegisterPreviewAssetRequest {
                source: image_path.to_string_lossy().to_string(),
                kind: Some(neko_host_api::preview::PreviewAssetKind::Image),
                expected_projection: None,
                explicit_open: None,
            }),
        )
        .await
        .into_response();
        assert_eq!(http_response.status(), StatusCode::OK);
        let http_body = to_bytes(http_response.into_body(), usize::MAX)
            .await
            .expect("read http manifest");
        let http_manifest: serde_json::Value =
            serde_json::from_slice(&http_body).expect("parse http manifest");

        let dispatch_response = engine
            .dispatch(
                ActionRequest::new("previews", "register-asset").with_options(serde_json::json!({
                    "source": image_path.to_string_lossy(),
                    "kind": "image"
                })),
            )
            .await;
        assert!(dispatch_response.is_ok());
        let dispatch_manifest = dispatch_response.data.expect("dispatch manifest");

        assert_eq!(http_manifest["kind"], dispatch_manifest["kind"]);
        assert_eq!(http_manifest["status"], dispatch_manifest["status"]);
        assert_eq!(
            http_manifest["projection"]["type"],
            dispatch_manifest["projection"]["type"]
        );
        assert_eq!(
            http_manifest["projection"]["confidence"],
            dispatch_manifest["projection"]["confidence"]
        );
        assert_eq!(
            http_manifest["media"]["dimensions"],
            dispatch_manifest["media"]["dimensions"]
        );
        assert!(registry
            .lookup_token(http_manifest["token"].as_str().expect("http token"))
            .expect("lookup http token")
            .is_some());
        assert!(registry
            .lookup_token(dispatch_manifest["token"].as_str().expect("dispatch token"))
            .expect("lookup dispatch token")
            .is_some());
    }

    #[test]
    fn gpu_busy_preview_variant_maps_to_retryable_503() {
        let variant = PreviewVariant {
            id: "asset:proxy".to_string(),
            asset_id: "asset".to_string(),
            role: neko_host_api::preview::PreviewVariantRole::Proxy,
            url: None,
            token: None,
            mime_type: None,
            dimensions: None,
            file_size_bytes: None,
            tile_template: None,
            stream: None,
            view_state: None,
            error: Some(PreviewErrorState::gpu_busy(
                std::time::Duration::from_millis(1500),
            )),
        };

        let response = preview_variant_response(variant);
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(
            response
                .headers()
                .get(header::RETRY_AFTER)
                .and_then(|value| value.to_str().ok()),
            Some("2")
        );
    }
}
