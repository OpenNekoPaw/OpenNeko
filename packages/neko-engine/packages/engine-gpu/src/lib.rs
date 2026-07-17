//! GPU infrastructure for neko-engine.
//!
//! This crate owns reusable GPU context, resource, HAL, compositor, effect,
//! budget, and export support infrastructure. Domain-specific renderers live
//! in companion crates that bridge runtime data to this GPU layer.

#![deny(clippy::all)]
#![allow(unexpected_cfgs)]

mod blur_processor;
mod budget;
mod buffer_pool;
mod compositor;
mod context;
pub mod custom_shader_processor;
mod effect_dispatcher;
mod effect_trait;
mod encoder_bridge;
pub mod error;
pub mod export_support;
mod gpu_layer;
pub mod lut3d;
mod mask_rasterizer;
mod nv12_import;
mod nv12_renderer;
mod platform_bridge;
mod readback_target;
mod rgba_to_nv12;
mod rgba_to_nv12_texture;
pub mod shaders;
mod shape_rasterizer;
mod style_processor;
mod text_renderer;
mod texture_compositor;
mod texture_transition_processor;
mod transition_processor;

#[cfg(target_os = "linux")]
mod linux_export;
#[cfg(target_os = "linux")]
mod linux_import;
#[cfg(target_os = "macos")]
mod macos_export;
#[cfg(target_os = "macos")]
mod macos_import;
#[cfg(target_os = "windows")]
mod windows_export;
#[cfg(target_os = "windows")]
mod windows_import;

pub use blur_processor::{BlurParams, BlurType, GpuBlurProcessor, SharpenParams};
pub use budget::{
    GpuBudgetConfig, GpuBudgetController, GpuBudgetPipelineGuard, GpuBudgetSnapshot, GpuPermit,
    PipelinePriority,
};
pub use compositor::{
    CompositeLayer, CompositeResult, GpuCompositor, LayerPixelFormat, Transform2D,
};
pub use context::{GpuContext, GpuInfo};
pub use custom_shader_processor::{
    CustomShaderProcessor, DynamicUniforms, ParamDef, PresetShaderMeta,
};
pub use effect_dispatcher::EffectDispatcher;
pub use effect_trait::{
    GpuEffect, GpuEffectContext, GpuEffectParams, GpuTransitionContext, GpuTransitionEffect,
};
pub use encoder_bridge::{GpuBufferHandle, GpuBufferHandles, GpuEncoderFrame};
pub use error::{GpuError, GpuResult};
pub use export_support::{GpuPipelineTiming, LayerTexturePool, Nv12FrameResult};
pub use gpu_layer::{GpuLayer, GpuLayerBuilder};
pub use lut3d::{Lut3DData, LutRegistry};
pub use mask_rasterizer::{GpuElementMask, GpuMaskBezierPoint, GpuMaskShape, MaskRasterizer};
pub use nv12_import::{
    ColorSpace, ImportedNv12Texture, Nv12FrameData, Nv12TextureImporter, Nv12Uniforms,
    NV12_TO_RGB_SHADER,
};
pub use nv12_renderer::{Nv12RenderCache, Nv12Renderer};
pub use platform_bridge::{
    DefaultPlatformGpuMediaBridge, PlatformGpuBridgeCapability, PlatformGpuBridgeDirection,
    PlatformGpuBridgeFormat, PlatformGpuBridgeHandleKind, PlatformGpuBridgeRequest,
    PlatformGpuBridgeSynchronization, PlatformGpuMediaBridge,
};
pub use readback_target::GpuReadbackTarget;
pub use rgba_to_nv12::{
    Nv12OutputBuffers, RgbaToNv12Converter, RgbaToNv12Uniforms, RGBA_TO_NV12_SHADER,
};
pub use shape_rasterizer::{
    GpuShapeElementData, GpuShapeFillData, GpuShapeGradientData, GpuShapeGradientStop,
    GpuShapeShadowData, GpuShapeStrokeData, RasterizedShape, ShapeRasterizer,
};
pub use style_processor::{
    ChromaKeyParams, ChromaticAberrationParams, ColorCorrectionTexParams, FilmGrainParams,
    GlowParams, GpuStyleProcessor, LumaKeyParams, VignetteParams,
};
pub use text_renderer::{TextRenderer, TextShadowStyle, TextStyle};
pub use texture_compositor::{TextureCompositeResult, TextureCompositor};
pub use texture_transition_processor::TextureTransitionProcessor;
#[allow(deprecated)]
pub use transition_processor::{GpuTransitionProcessor, TransitionParams, TransitionType};

pub use neko_engine_types::BlendMode;
pub use neko_engine_types::{DecodedGpuTextureHandle, Nv12GpuTextureSource};

#[cfg(target_os = "linux")]
pub use linux_export::{
    CudaExportInfo, ExportedNv12Frame, LinuxExportBackingStore, LinuxTextureExporter,
};
#[cfg(all(target_os = "linux", feature = "cuda"))]
pub use linux_import::CudaTextureImporter;
#[cfg(target_os = "linux")]
pub use linux_import::{DmaBufFrame, DmaBufPlane, LinuxTextureImporter};
#[cfg(target_os = "macos")]
pub use macos_import::MacOsTextureImporter;
#[cfg(target_os = "macos")]
pub use rgba_to_nv12_texture::RgbaToNv12TextureConverter;
#[cfg(target_os = "windows")]
pub use windows_export::{ExportedNv12Handles, WindowsExportBackingStore, WindowsTextureExporter};
#[cfg(target_os = "windows")]
pub use windows_import::WindowsTextureImporter;
