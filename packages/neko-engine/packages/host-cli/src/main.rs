//! OpenNeko Video Export Server
//!
//! Standalone WebSocket server for compat mode video export.
//! Supports two modes:
//! 1. Server mode: Listen for WebSocket export requests
//! 2. CLI mode: Direct .nkv file export

mod args;
mod nka_loader;
mod runner;

use clap::Parser;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use args::{Args, Command};
use runner::Runner;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Suppress macOS system warnings (Context leak, msgtracer)
    // These come from VideoToolbox/Metal frameworks and are harmless
    #[cfg(target_os = "macos")]
    unsafe {
        libc::setenv(c"OS_ACTIVITY_MODE".as_ptr(), c"disable".as_ptr(), 1);
    }

    // Parse command line arguments
    let args = Args::parse();

    // Determine log level based on command
    let log_level = match &args.command {
        Command::Serve { verbose, .. } if *verbose => "debug",
        Command::Serve { .. } => "info",
        _ => "warn", // Reduce log noise for all action commands
    };

    // Initialize logging with optional Tracy integration
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| log_level.into());
    let fmt_layer = tracing_subscriber::fmt::layer().with_target(true);

    #[cfg(feature = "tracy")]
    {
        use tracing_tracy::TracyLayer;
        tracing_subscriber::registry()
            .with(filter)
            .with(fmt_layer)
            .with(TracyLayer::default())
            .init();
        tracing::info!(tracy = true, "Telemetry initialized with Tracy profiler");
    }

    #[cfg(not(feature = "tracy"))]
    {
        tracing_subscriber::registry()
            .with(filter)
            .with(fmt_layer)
            .init();
    }

    tracing::info!(
        "OpenNeko Video Export Server v{}",
        env!("CARGO_PKG_VERSION")
    );

    // Run the appropriate command
    let mut runner = Runner::new();
    runner.run(args.command).await
}
