//! Neko Native HTTP - RESTful API and WebSocket streaming server
//!
//! This crate provides an HTTP server that exposes the EngineApi over REST and WebSocket:
//!
//! - `POST /v1/dispatch` — Generic ActionRequest dispatch
//! - `POST /v1/:group` — Group-level dispatch (action in body)
//! - `POST /v1/:group/:id/:action` — RESTful resource-level dispatch
//! - `GET /v1/streams/:stream_id` — WebSocket media frame streaming
//! - `GET /health` — Health check
//!
//! # Usage
//!
//! ```rust,no_run
//! use neko_host_api::EngineApi;
//! use neko_host_http::start_server;
//! use std::sync::Arc;
//!
//! #[tokio::main]
//! async fn main() {
//!     let engine = Arc::new(EngineApi::new().await.unwrap());
//!     start_server(engine, 3000).await.unwrap();
//! }
//! ```

#![deny(clippy::all)]

mod middleware;
pub mod routes;

use neko_host_api::EngineApi;
use std::{path::PathBuf, sync::Arc};
use tokio::sync::watch;

const LOOPBACK_BIND_ADDR: [u8; 4] = [127, 0, 0, 1];

/// Start the HTTP server on the given port
///
/// This blocks until the server is shut down.
pub async fn start_server(engine: Arc<EngineApi>, port: u16) -> std::io::Result<()> {
    let app = routes::build_router(engine);
    let app = middleware::apply_middleware(app);

    let addr = loopback_addr(port);
    let listener = tokio::net::TcpListener::bind(addr).await?;

    tracing::info!("Neko HTTP server started on http://{}", addr);

    axum::serve(listener, app).await
}

/// Start the HTTP server with an explicit shutdown signal.
///
/// The returned sender uses `true` as the terminal shutdown request. Dropping
/// the sender without sending `true` is treated as an accidental owner drop and
/// does not stop the server.
///
/// Returns the actual bound address (useful when port=0 for auto-assign).
pub async fn start_server_with_shutdown(
    engine: Arc<EngineApi>,
    port: u16,
) -> std::io::Result<(std::net::SocketAddr, watch::Sender<bool>)> {
    start_server_with_shutdown_and_preview_roots(engine, port, Vec::new()).await
}

/// Start the HTTP server with an explicit shutdown signal and preview file allow-list roots.
pub async fn start_server_with_shutdown_and_preview_roots(
    engine: Arc<EngineApi>,
    port: u16,
    preview_allowed_roots: Vec<PathBuf>,
) -> std::io::Result<(std::net::SocketAddr, watch::Sender<bool>)> {
    let app = routes::build_router_with_preview_roots(engine, preview_allowed_roots);
    let app = middleware::apply_middleware(app);

    let addr = loopback_addr(port);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    let local_addr = listener.local_addr()?;

    let (shutdown_tx, shutdown_rx) = watch::channel(false);

    tracing::info!("Neko HTTP server started on http://{}", local_addr);

    tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(wait_for_explicit_shutdown(shutdown_rx))
            .await
            .ok();
    });

    Ok((local_addr, shutdown_tx))
}

async fn wait_for_explicit_shutdown(mut shutdown_rx: watch::Receiver<bool>) {
    loop {
        match shutdown_rx.changed().await {
            Ok(()) if *shutdown_rx.borrow() => {
                tracing::info!("HTTP server shutting down");
                break;
            }
            Ok(()) => continue,
            Err(_) => {
                tracing::warn!(
                    "HTTP server shutdown sender dropped without explicit stop; keeping server alive"
                );
                std::future::pending::<()>().await;
            }
        }
    }
}

fn loopback_addr(port: u16) -> std::net::SocketAddr {
    std::net::SocketAddr::from((LOOPBACK_BIND_ADDR, port))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::{timeout, Duration};

    #[test]
    fn server_bind_addr_is_loopback_only() {
        let addr = super::loopback_addr(8765);
        assert_eq!(addr.ip(), std::net::IpAddr::from([127, 0, 0, 1]));
        assert_eq!(addr.port(), 8765);
    }

    #[tokio::test]
    async fn shutdown_waiter_only_finishes_on_explicit_true_signal() {
        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        let waiter = wait_for_explicit_shutdown(shutdown_rx);
        tokio::pin!(waiter);

        shutdown_tx.send(false).expect("send non-terminal update");
        assert!(
            timeout(Duration::from_millis(20), &mut waiter)
                .await
                .is_err(),
            "false updates must not stop the HTTP server"
        );

        shutdown_tx.send(true).expect("send terminal update");
        timeout(Duration::from_millis(100), &mut waiter)
            .await
            .expect("explicit true signal should stop the HTTP server");
    }

    #[tokio::test]
    async fn shutdown_waiter_ignores_sender_drop_without_explicit_stop() {
        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        let waiter = wait_for_explicit_shutdown(shutdown_rx);
        tokio::pin!(waiter);

        drop(shutdown_tx);
        assert!(
            timeout(Duration::from_millis(20), &mut waiter)
                .await
                .is_err(),
            "dropping the sender must not be treated as an explicit shutdown"
        );
    }
}
