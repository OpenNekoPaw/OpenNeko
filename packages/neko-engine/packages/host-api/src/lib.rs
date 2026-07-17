//! Neko Native API - Controller Layer
//!
//! This crate provides the Controller layer for the Neko Engine MVC architecture:
//! - `EngineApi` - Main facade for all engine operations
//! - `ActionRouter` - Routes ActionRequest to appropriate controllers
//! - `ResourceRegistry` - Manages resources with deterministic IDs and self-healing
//! - `StreamRegistry` - Manages per-stream broadcast channels
//! - Controllers - Handle specific action groups (video, audio, timeline, etc.)
//!
//! # Architecture
//!
//! ```text
//! View Layer (host-napi, host-cli, host-http)
//!     │
//!     ▼ ActionRequest / ActionResponse
//! ┌─────────────────────────────────────────┐
//! │           Controller Layer               │
//! │  EngineApi → ActionRouter → Controllers  │
//! │  ResourceRegistry │ StreamRegistry       │
//! └─────────────────────────────────────────┘
//!     │
//!     ▼ Service trait calls
//! Domain services (engine-kernel)
//! ```

#![deny(clippy::all)]

pub mod controllers;
pub mod file_access;
pub mod preview;
pub mod registry;

mod engine;
mod error;
mod router;
mod session;

pub use engine::EngineApi;
pub use error::{ApiError, ApiResult};
pub use file_access::{FileAccessRecord, FileAccessRegistry};
pub use registry::{ResourceRegistry, StreamRegistry};
pub use router::ActionRouter;
pub use session::{Session, SessionConfig, SessionManager};

// Re-export common types for convenience
pub use neko_engine_types::{ActionRequest, ActionResponse, ResourceId, StreamId};

// Re-export engine-kernel types needed by CLI and other view adapters
pub use neko_engine_kernel::contracts::audio::{MixdownConfig, MixdownElement, MixdownTrack};
pub use neko_engine_kernel::contracts::export::{
    ExportHwEncoder, ExportJobConfig, ExportPreset, ExportSettings, ExportVideoCodec,
};
pub use neko_engine_kernel::contracts::jvi::JviLoader;

pub use neko_engine_kernel::contracts::preview::PreviewPipelineConfig;
pub use neko_engine_kernel::contracts::services::{PipelineSink, StreamSink};
