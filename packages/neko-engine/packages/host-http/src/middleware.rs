//! CORS and other middleware

use axum::Router;
use tower_http::cors::{Any, CorsLayer};

/// Apply middleware layers to the router.
///
/// # Chrome Private Network Access (PNA)
///
/// VSCode webviews have origin `vscode-webview://UUID` (a non-local origin).
/// Chrome's PNA policy requires that a server at `127.0.0.1` responds to the
/// OPTIONS preflight with `Access-Control-Allow-Private-Network: true` before
/// it will allow the webview to make any requests — including Range requests
/// to `/v1/preview/file/:token`. `CorsLayer::allow_private_network(true)` adds
/// this header automatically.
pub fn apply_middleware(app: Router) -> Router {
    app.layer(
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any)
            .allow_private_network(true),
    )
}
