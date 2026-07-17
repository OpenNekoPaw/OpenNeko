//! Export render pipeline GPU support.
//!
//! This module owns reusable GPU export support types that do not require
//! kernel job orchestration, service wiring, or sink ownership.

#[cfg(test)]
mod architecture_tests;

use neko_engine_types::GpuOutputHandle;

use crate::GpuContext;

/// Detailed timing breakdown for GPU pipeline stages.
#[derive(Debug, Clone, Default)]
pub struct GpuPipelineTiming {
    /// Hardware decode time in nanoseconds.
    pub hw_decode_ns: u64,
    /// NV12 texture import to wgpu in nanoseconds.
    pub nv12_import_ns: u64,
    /// NV12 to RGBA conversion in nanoseconds.
    pub nv12_to_rgba_ns: u64,
    /// Layer composition in nanoseconds.
    pub composite_ns: u64,
    /// RGBA to NV12 conversion in nanoseconds.
    pub rgba_to_nv12_ns: u64,
    /// CPU readback in nanoseconds.
    pub cpu_readback_ns: u64,
}

impl GpuPipelineTiming {
    /// Get total GPU pipeline time in nanoseconds.
    pub fn total_ns(&self) -> u64 {
        self.hw_decode_ns
            + self.nv12_import_ns
            + self.nv12_to_rgba_ns
            + self.composite_ns
            + self.rgba_to_nv12_ns
            + self.cpu_readback_ns
    }
}

/// Result of processing a frame to NV12 with timing information.
pub struct Nv12FrameResult {
    /// NV12 data (empty if using zero-copy).
    pub data: Vec<u8>,
    /// Encoder-ready GPU handle for zero-copy export.
    pub gpu_handle: Option<GpuOutputHandle>,
    /// Output width.
    pub width: u32,
    /// Output height.
    pub height: u32,
    /// Detailed timing breakdown.
    pub timing: GpuPipelineTiming,
}

/// Simple texture pool for reusing layer textures across frames.
///
/// Avoids per-frame texture allocation by recycling textures between frames.
/// All textures in the pool have the same dimensions.
pub struct LayerTexturePool {
    /// Available textures ready for reuse.
    available: Vec<wgpu::Texture>,
    /// Textures currently in use by the current frame.
    in_use: Vec<wgpu::Texture>,
    /// Cached texture dimensions.
    width: u32,
    height: u32,
}

impl LayerTexturePool {
    /// Create an empty texture pool.
    pub fn new() -> Self {
        Self {
            available: Vec::new(),
            in_use: Vec::new(),
            width: 0,
            height: 0,
        }
    }

    /// Acquire a texture from the pool, creating one if necessary.
    ///
    /// Returns the index of the texture in the in-use vector.
    pub fn acquire(&mut self, ctx: &GpuContext, width: u32, height: u32) -> usize {
        if self.width != width || self.height != height {
            self.available.clear();
            self.in_use.clear();
            self.width = width;
            self.height = height;
        }

        if let Some(texture) = self.available.pop() {
            self.in_use.push(texture);
            return self.in_use.len() - 1;
        }

        let texture = ctx.device().create_texture(&wgpu::TextureDescriptor {
            label: Some("LayerTexturePool Texture"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba16Float,
            usage: wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_DST
                | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });

        self.in_use.push(texture);
        self.in_use.len() - 1
    }

    /// Get reference to a texture by index.
    pub fn get(&self, index: usize) -> &wgpu::Texture {
        &self.in_use[index]
    }

    /// Take the most recently acquired in-use texture.
    pub fn take_last_in_use(&mut self) -> Option<wgpu::Texture> {
        self.in_use.pop()
    }

    /// Release all in-use textures back to the available pool.
    pub fn release_all(&mut self) {
        self.available.append(&mut self.in_use);
    }

    /// Clear all textures from the pool.
    pub fn clear(&mut self) {
        self.available.clear();
        self.in_use.clear();
    }

    /// Number of available textures.
    pub fn available_len(&self) -> usize {
        self.available.len()
    }

    /// Number of in-use textures.
    pub fn in_use_len(&self) -> usize {
        self.in_use.len()
    }

    /// Cached texture dimensions.
    pub fn dimensions(&self) -> (u32, u32) {
        (self.width, self.height)
    }
}

impl Default for LayerTexturePool {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timing_total_sums_all_stages() {
        let timing = GpuPipelineTiming {
            hw_decode_ns: 1,
            nv12_import_ns: 2,
            nv12_to_rgba_ns: 3,
            composite_ns: 4,
            rgba_to_nv12_ns: 5,
            cpu_readback_ns: 6,
        };
        assert_eq!(timing.total_ns(), 21);
    }

    #[test]
    fn texture_pool_clear_resets_counts_without_gpu() {
        let mut pool = LayerTexturePool::new();
        pool.clear();
        assert_eq!(pool.available_len(), 0);
        assert_eq!(pool.in_use_len(), 0);
        assert_eq!(pool.dimensions(), (0, 0));
    }
}
