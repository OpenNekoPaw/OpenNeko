//! GPU Layer - GPU texture-based layer for compositing
//!
//! Provides a pure GPU texture representation for layers,
//! replacing CPU Vec<u8> data with wgpu textures.
//!
//! This enables true zero-copy compositing:
//! - Hardware decoder → GPU texture (zero copy)
//! - GPU compositor → GPU texture (zero copy)
//! - GPU encoder ← GPU texture (zero copy)

use super::compositor::{BlendMode, Transform2D};

/// GPU texture layer for compositing
///
/// Unlike `CompositeLayer` which uses CPU data (`Vec<u8>`),
/// this struct holds GPU textures directly for zero-copy compositing.
pub struct GpuLayer {
    /// RGBA texture (converted from NV12 if needed)
    pub texture: wgpu::Texture,
    /// Texture view for shader binding
    pub view: wgpu::TextureView,
    /// Texture width
    pub width: u32,
    /// Texture height
    pub height: u32,
    /// Transform (position, scale, rotation)
    pub transform: Transform2D,
    /// Opacity (0.0 - 1.0)
    pub opacity: f32,
    /// Blend mode
    pub blend_mode: BlendMode,
    /// Z-index (lower = bottom)
    pub z_index: i32,
    /// Optional mask texture
    pub mask: Option<GpuMask>,
}

/// GPU mask for layer
pub struct GpuMask {
    /// Mask texture (grayscale)
    pub texture: wgpu::Texture,
    /// Mask texture view
    pub view: wgpu::TextureView,
    /// Whether mask is inverted
    pub inverted: bool,
}

impl GpuLayer {
    /// Create a new GPU layer from an RGBA texture
    pub fn from_rgba(
        texture: wgpu::Texture,
        width: u32,
        height: u32,
        transform: Transform2D,
        opacity: f32,
        blend_mode: BlendMode,
        z_index: i32,
    ) -> Self {
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        Self {
            texture,
            view,
            width,
            height,
            transform,
            opacity,
            blend_mode,
            z_index,
            mask: None,
        }
    }

    /// Set mask for this layer
    pub fn with_mask(mut self, mask: GpuMask) -> Self {
        self.mask = Some(mask);
        self
    }

    /// Check if layer has a mask
    pub fn has_mask(&self) -> bool {
        self.mask.is_some()
    }

    /// Get mask inverted status
    pub fn is_mask_inverted(&self) -> bool {
        self.mask.as_ref().is_some_and(|m| m.inverted)
    }
}

impl GpuMask {
    /// Create a new GPU mask
    pub fn new(texture: wgpu::Texture, inverted: bool) -> Self {
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        Self {
            texture,
            view,
            inverted,
        }
    }
}

/// Builder for creating GPU layers
pub struct GpuLayerBuilder {
    transform: Transform2D,
    opacity: f32,
    blend_mode: BlendMode,
    z_index: i32,
}

impl Default for GpuLayerBuilder {
    fn default() -> Self {
        Self {
            transform: Transform2D::default(),
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            z_index: 0,
        }
    }
}

impl GpuLayerBuilder {
    /// Create a new builder
    pub fn new() -> Self {
        Self::default()
    }

    /// Set transform
    pub fn transform(mut self, transform: Transform2D) -> Self {
        self.transform = transform;
        self
    }

    /// Set position
    pub fn position(mut self, x: f32, y: f32) -> Self {
        self.transform.x = x;
        self.transform.y = y;
        self
    }

    /// Set scale
    pub fn scale(mut self, scale_x: f32, scale_y: f32) -> Self {
        self.transform.scale_x = scale_x;
        self.transform.scale_y = scale_y;
        self
    }

    /// Set rotation in degrees
    pub fn rotation(mut self, degrees: f32) -> Self {
        self.transform.rotation = degrees;
        self
    }

    /// Set opacity
    pub fn opacity(mut self, opacity: f32) -> Self {
        self.opacity = opacity.clamp(0.0, 1.0);
        self
    }

    /// Set blend mode
    pub fn blend_mode(mut self, mode: BlendMode) -> Self {
        self.blend_mode = mode;
        self
    }

    /// Set z-index
    pub fn z_index(mut self, z_index: i32) -> Self {
        self.z_index = z_index;
        self
    }

    /// Build GPU layer from RGBA texture
    pub fn build_from_rgba(self, texture: wgpu::Texture, width: u32, height: u32) -> GpuLayer {
        GpuLayer::from_rgba(
            texture,
            width,
            height,
            self.transform,
            self.opacity,
            self.blend_mode,
            self.z_index,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gpu_layer_builder_defaults() {
        let builder = GpuLayerBuilder::new();
        assert_eq!(builder.opacity, 1.0);
        assert_eq!(builder.z_index, 0);
        assert_eq!(builder.blend_mode, BlendMode::Normal);
    }

    #[test]
    fn test_gpu_layer_builder_chain() {
        let builder = GpuLayerBuilder::new()
            .position(100.0, 200.0)
            .scale(2.0, 2.0)
            .rotation(45.0)
            .opacity(0.8)
            .blend_mode(BlendMode::Multiply)
            .z_index(5);

        assert_eq!(builder.transform.x, 100.0);
        assert_eq!(builder.transform.y, 200.0);
        assert_eq!(builder.transform.scale_x, 2.0);
        assert_eq!(builder.transform.rotation, 45.0);
        assert_eq!(builder.opacity, 0.8);
        assert_eq!(builder.blend_mode, BlendMode::Multiply);
        assert_eq!(builder.z_index, 5);
    }
}
