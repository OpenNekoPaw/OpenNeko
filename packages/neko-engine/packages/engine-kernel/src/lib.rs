//! Neko Native Core - high-performance media processing with GPU acceleration.
//!
//! # Public Surface
//! - Stable host entry points: `facade`, `contracts`, `error`, `telemetry`.
//! - Implementation modules are crate-private; host code should use `facade`
//!   for construction and `contracts` for DTOs, traits, and helper APIs.
//!
//! # Usage
//! ```rust
//! use neko_engine_kernel::prelude::*;
//! use neko_engine_kernel::facade::EngineKernelFacade;
//! ```

#![deny(clippy::all)]
#![allow(unexpected_cfgs)]

pub mod contracts;
pub(crate) mod domain;
pub(crate) mod encoder;
pub mod error;
pub(crate) mod export;
pub mod facade;
pub(crate) mod monitor;
pub(crate) mod preview;
pub(crate) mod services;
pub mod telemetry;

#[cfg(test)]
mod architecture_tests;

/// Prelude — commonly used types for convenience
pub mod prelude {
    pub use crate::contracts::domain::{FrameData, StreamConfig, Timeline};
    pub use crate::contracts::gpu::GpuContext;
    pub use crate::contracts::services::{
        IAudioService, IExportService, IImageService, INodeService, IStreamPlayback, ITaskService,
        ITimelineService, IVideoService,
    };
    pub use crate::error::{Error, Result};
    pub use crate::facade::{EngineKernelFacade, KernelServices, ServiceFactory};
}
