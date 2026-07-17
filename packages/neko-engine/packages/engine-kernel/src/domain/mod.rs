//! Domain Layer - Unified domain models with behavior
//!
//! This module contains domain models that have behavior methods beyond simple serialization.
//! Pure DTOs without behavior are in the `neko-types` crate.
//!
//! # Design Principles
//! - Domain models contain business logic and behavior methods
//! - Use types from `neko-types` for shared enums and DTOs
//! - Models are consumed by the Service layer

pub mod frame;
pub mod jvi_loader;
pub mod loudness;
pub mod operations;
pub mod options;
pub mod resource;
pub mod silence;
pub mod stream;
pub mod task_handle;
pub mod timeline;
pub mod timeline_info;
pub mod transform;

// Re-export domain types
pub use frame::*;
pub use jvi_loader::*;
pub use loudness::*;
pub use options::*;
pub use resource::*;
pub use silence::*;
pub use stream::*;
pub use task_handle::*;
pub use timeline::*;
pub use timeline_info::*;
pub use transform::*;
