//! Route definitions and router builder

pub mod dispatch;
pub mod health;
pub mod preview_file;
pub mod streaming;

use axum::routing::{delete, get, post, put};
use axum::Router;
use neko_host_api::EngineApi;
use std::{path::PathBuf, sync::Arc};

/// Build the complete HTTP router with all routes.
pub fn build_router(engine: Arc<EngineApi>) -> Router {
    build_router_with_preview_roots(engine, Vec::new())
}

/// Build the complete HTTP router with explicit preview file allow-list roots.
pub fn build_router_with_preview_roots(
    engine: Arc<EngineApi>,
    preview_allowed_roots: Vec<PathBuf>,
) -> Router {
    if let Err(error) = engine.set_preview_allowed_roots(preview_allowed_roots) {
        tracing::error!("Failed to configure preview allowed roots: {}", error);
    }
    let preview_registry = engine.preview_registry().clone();

    Router::new()
        // Health check
        .route("/health", get(health::health_handler))
        // Generic dispatch
        .route("/v1/dispatch", post(dispatch::handle_dispatch))
        // Group-level dispatch (action in body)
        .route("/v1/:group", post(dispatch::handle_group_dispatch))
        // Resource-level RESTful dispatch
        .route(
            "/v1/:group/:id/:action",
            post(dispatch::handle_resource_dispatch),
        )
        // WebSocket media streaming
        .route(
            "/v1/streams/:stream_id",
            get(streaming::handle_stream_websocket),
        )
        // Dedicated PCM audio WebSocket path. It uses the same registry frame
        // transport as video, but keeps audio out of the 3D H.264 stream.
        .route(
            "/v1/audio/:stream_id",
            get(streaming::handle_stream_websocket),
        )
        // Compatibility registration alias backed by the same media file store.
        .route("/v1/preview/register", post(preview_file::handle_register))
        // Generic engine-owned file access routes. These share the same token
        // store as the preview compatibility endpoints.
        .route(
            "/v1/files/register",
            post(preview_file::handle_file_register),
        )
        .route(
            "/v1/files/:token",
            get(preview_file::handle_general_file).delete(preview_file::handle_file_unregister),
        )
        // Engine-first preview manifests for image/video preview surfaces.
        .route(
            "/v1/preview/assets",
            post(preview_file::handle_register_asset),
        )
        .route(
            "/v1/preview/assets/:asset_id/variants",
            post(preview_file::handle_request_variant),
        )
        .route(
            "/v1/preview/assets/:asset_id/metadata",
            put(preview_file::handle_update_asset_metadata),
        )
        .route(
            "/v1/preview/assets/:asset_id_or_token",
            delete(preview_file::handle_unregister_asset),
        )
        .route(
            "/v1/preview/unregister/:token",
            delete(preview_file::handle_unregister),
        )
        .route("/v1/preview/file/:token", get(preview_file::handle_file))
        .layer(axum::Extension(preview_registry))
        .with_state(engine)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_build_router() {
        let engine = Arc::new(EngineApi::without_gpu().unwrap());
        let _router = build_router(engine);
        // Router builds without panic
    }
}
