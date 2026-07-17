//! Kernel-owned terminal GPU readback target.

use std::fmt;
use std::sync::Arc;

use half::f16;
use neko_engine_types::{GpuFrameReadback, PipelineContractError};

use super::GpuContext;

/// Terminal GPU readback target for snapshot-style consumers.
pub struct GpuReadbackTarget {
    ctx: Arc<GpuContext>,
    texture: wgpu::Texture,
    width: u32,
    height: u32,
}

impl fmt::Debug for GpuReadbackTarget {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("GpuReadbackTarget")
            .field("width", &self.width)
            .field("height", &self.height)
            .field("format", &self.texture.format())
            .finish()
    }
}

impl GpuReadbackTarget {
    /// Create a terminal readback target.
    pub fn new(ctx: Arc<GpuContext>, texture: wgpu::Texture, width: u32, height: u32) -> Self {
        Self {
            ctx,
            texture,
            width,
            height,
        }
    }
}

impl GpuFrameReadback for GpuReadbackTarget {
    fn read_rgba8(&self) -> std::result::Result<Vec<u8>, PipelineContractError> {
        let raw = self
            .ctx
            .read_texture_sync(&self.texture, self.width, self.height)
            .map_err(|err| PipelineContractError::ReadbackFailed(err.to_string()))?;

        if self.texture.format() == wgpu::TextureFormat::Rgba16Float {
            Ok(rgba16float_to_rgba8(&raw))
        } else {
            Ok(raw)
        }
    }

    fn width(&self) -> u32 {
        self.width
    }

    fn height(&self) -> u32 {
        self.height
    }
}

fn rgba16float_to_rgba8(data: &[u8]) -> Vec<u8> {
    let pixel_count = data.len() / 8;
    let mut output = Vec::with_capacity(pixel_count * 4);
    for chunk in data.chunks_exact(8) {
        let r = f16::from_bits(u16::from_le_bytes([chunk[0], chunk[1]])).to_f32();
        let g = f16::from_bits(u16::from_le_bytes([chunk[2], chunk[3]])).to_f32();
        let b = f16::from_bits(u16::from_le_bytes([chunk[4], chunk[5]])).to_f32();
        let a = f16::from_bits(u16::from_le_bytes([chunk[6], chunk[7]])).to_f32();
        output.push((r.clamp(0.0, 1.0) * 255.0) as u8);
        output.push((g.clamp(0.0, 1.0) * 255.0) as u8);
        output.push((b.clamp(0.0, 1.0) * 255.0) as u8);
        output.push((a.clamp(0.0, 1.0) * 255.0) as u8);
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rgba16float_conversion_handles_white_pixel() {
        let one = 0x3c00u16.to_le_bytes();
        let data = [
            one[0], one[1], one[0], one[1], one[0], one[1], one[0], one[1],
        ];
        assert_eq!(rgba16float_to_rgba8(&data), vec![255, 255, 255, 255]);
    }
}
