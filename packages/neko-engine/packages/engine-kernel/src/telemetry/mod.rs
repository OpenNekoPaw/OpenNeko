//! Telemetry module - tracing + Tracy integration for performance profiling
//!
//! This module provides unified telemetry infrastructure for the video export pipeline,
//! including span definitions and performance metrics.
//!
//! # Usage
//!
//! The telemetry module provides:
//! - `spans`: Span name constants for consistent tracing
//! - `metrics`: Performance metrics collection
//!
//! Initialization of the tracing subscriber (including Tracy integration) should be
//! done in the application entry point (e.g., CLI main.rs), not in this library.
//!
//! # Example
//!
//! ```ignore
//! use neko_engine_kernel::telemetry::spans::span;
//!
//! fn process_frame() {
//!     let _span = tracing::info_span!(span::FRAME).entered();
//!     // ... frame processing
//! }
//! ```

pub mod metrics;
pub mod spans;
