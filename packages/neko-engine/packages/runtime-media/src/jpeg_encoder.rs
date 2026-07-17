//! JPEG Encoder - High-performance JPEG encoding
//!
//! This module provides JPEG encoding using the `image` crate, which is a pure Rust
//! implementation with no external dependencies.
//!
//! ## Features
//!
//! - Pure Rust implementation (no system dependencies)
//! - Configurable quality (1-100)
//! - Support for RGBA, RGB, and grayscale input
//!
//! ## Usage
//!
//! ```ignore
//! use neko_runtime_media::encode_rgba_to_jpeg;
//!
//! let jpeg_data = encode_rgba_to_jpeg(&rgba_buffer, 1920, 1080, 85)?;
//! ```

use crate::error::{MediaError as Error, Result};
use image::codecs::jpeg::JpegEncoder;
use image::{ColorType, ImageEncoder};
use std::io::Cursor;

/// Encode RGBA buffer to JPEG
///
/// # Arguments
/// * `rgba_data` - RGBA pixel data (4 bytes per pixel)
/// * `width` - Image width in pixels
/// * `height` - Image height in pixels
/// * `quality` - JPEG quality (1-100, higher is better quality)
///
/// # Returns
/// * JPEG image data as Vec<u8>
///
/// # Example
/// ```ignore
/// let jpeg = encode_rgba_to_jpeg(&rgba_buffer, 1920, 1080, 85)?;
/// assert_eq!(jpeg[0..2], [0xFF, 0xD8]); // JPEG magic bytes
/// ```
pub fn encode_rgba_to_jpeg(
    rgba_data: &[u8],
    width: u32,
    height: u32,
    quality: u32,
) -> Result<Vec<u8>> {
    let pixel_count = (width as usize) * (height as usize);
    let expected_rgba8 = pixel_count * 4;
    let expected_rgba16f = pixel_count * 8; // Rgba16Float = 4 channels × 2 bytes (f16)

    let rgb_data =
        if rgba_data.len() == expected_rgba8 {
            // RGBA8: 4 bytes per pixel
            rgba8_to_rgb(rgba_data)
        } else if rgba_data.len() == expected_rgba16f {
            // Rgba16Float: 8 bytes per pixel (4 × f16)
            rgba16f_to_rgb(rgba_data)
        } else {
            return Err(Error::Other(format!(
            "RGBA data size mismatch: expected {} (RGBA8) or {} (Rgba16Float) bytes, got {} bytes",
            expected_rgba8, expected_rgba16f, rgba_data.len()
        )));
        };

    // Encode to JPEG
    let mut jpeg_buffer = Cursor::new(Vec::new());
    let quality = quality.clamp(1, 100) as u8;

    let encoder = JpegEncoder::new_with_quality(&mut jpeg_buffer, quality);
    encoder
        .write_image(&rgb_data, width, height, ColorType::Rgb8.into())
        .map_err(|e| Error::Image(format!("JPEG encoding failed: {}", e)))?;

    let jpeg_data = jpeg_buffer.into_inner();

    if jpeg_data.is_empty() {
        return Err(Error::Image("JPEG encoding produced no output".to_string()));
    }

    Ok(jpeg_data)
}

/// Encode RGB buffer to JPEG
pub fn encode_rgb_to_jpeg(
    rgb_data: &[u8],
    width: u32,
    height: u32,
    quality: u32,
) -> Result<Vec<u8>> {
    let expected_rgb8 = (width as usize) * (height as usize) * 3;
    if rgb_data.len() != expected_rgb8 {
        return Err(Error::Other(format!(
            "RGB data size mismatch: expected {} bytes, got {} bytes",
            expected_rgb8,
            rgb_data.len()
        )));
    }

    let mut jpeg_buffer = Cursor::new(Vec::new());
    let quality = quality.clamp(1, 100) as u8;

    let encoder = JpegEncoder::new_with_quality(&mut jpeg_buffer, quality);
    encoder
        .write_image(rgb_data, width, height, ColorType::Rgb8.into())
        .map_err(|e| Error::Image(format!("JPEG encoding failed: {}", e)))?;

    let jpeg_data = jpeg_buffer.into_inner();

    if jpeg_data.is_empty() {
        return Err(Error::Image("JPEG encoding produced no output".to_string()));
    }

    Ok(jpeg_data)
}

/// Convert RGBA8 to RGB by dropping alpha channel
#[inline]
fn rgba8_to_rgb(rgba: &[u8]) -> Vec<u8> {
    let pixel_count = rgba.len() / 4;
    let mut rgb = Vec::with_capacity(pixel_count * 3);

    for chunk in rgba.chunks_exact(4) {
        rgb.push(chunk[0]); // R
        rgb.push(chunk[1]); // G
        rgb.push(chunk[2]); // B
    }

    rgb
}

/// Convert Rgba16Float (f16) to RGB8 by converting each channel from f16 to u8
#[inline]
fn rgba16f_to_rgb(data: &[u8]) -> Vec<u8> {
    let pixel_count = data.len() / 8;
    let mut rgb = Vec::with_capacity(pixel_count * 3);

    for chunk in data.chunks_exact(8) {
        // Each channel is a 16-bit IEEE 754 half-precision float
        let r = f16_to_u8(u16::from_le_bytes([chunk[0], chunk[1]]));
        let g = f16_to_u8(u16::from_le_bytes([chunk[2], chunk[3]]));
        let b = f16_to_u8(u16::from_le_bytes([chunk[4], chunk[5]]));
        // Skip alpha (chunk[6..8])
        rgb.push(r);
        rgb.push(g);
        rgb.push(b);
    }

    rgb
}

/// Convert IEEE 754 half-precision float (f16) to u8 [0..255]
#[inline]
fn f16_to_u8(bits: u16) -> u8 {
    let f = f16_to_f32(bits);
    (f.clamp(0.0, 1.0) * 255.0 + 0.5) as u8
}

/// Convert IEEE 754 half-precision float to f32
#[inline]
fn f16_to_f32(bits: u16) -> f32 {
    let sign = ((bits >> 15) & 1) as u32;
    let exponent = ((bits >> 10) & 0x1F) as u32;
    let mantissa = (bits & 0x3FF) as u32;

    if exponent == 0 {
        if mantissa == 0 {
            // Zero
            f32::from_bits(sign << 31)
        } else {
            // Subnormal: convert to normalized f32
            let mut m = mantissa;
            let mut e: i32 = -14;
            while (m & 0x400) == 0 {
                m <<= 1;
                e -= 1;
            }
            m &= 0x3FF;
            let f32_exp = ((e + 127) as u32) & 0xFF;
            f32::from_bits((sign << 31) | (f32_exp << 23) | (m << 13))
        }
    } else if exponent == 31 {
        // Inf or NaN
        if mantissa == 0 {
            f32::from_bits((sign << 31) | (0xFF << 23))
        } else {
            f32::from_bits((sign << 31) | (0xFF << 23) | (mantissa << 13))
        }
    } else {
        // Normalized
        let f32_exp = (exponent as i32 - 15 + 127) as u32;
        f32::from_bits((sign << 31) | (f32_exp << 23) | (mantissa << 13))
    }
}

/// Quality presets for common use cases
#[derive(Debug, Clone, Copy)]
pub enum JpegQualityPreset {
    /// Thumbnail quality (60) - small file size
    Thumbnail,
    /// Preview quality (75) - balanced
    Preview,
    /// High quality (85) - good for screenshots
    High,
    /// Maximum quality (95) - best quality, larger files
    Maximum,
}

impl JpegQualityPreset {
    /// Get the quality value (1-100)
    pub fn value(&self) -> u32 {
        match self {
            JpegQualityPreset::Thumbnail => 60,
            JpegQualityPreset::Preview => 75,
            JpegQualityPreset::High => 85,
            JpegQualityPreset::Maximum => 95,
        }
    }
}

impl From<JpegQualityPreset> for u32 {
    fn from(preset: JpegQualityPreset) -> u32 {
        preset.value()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_rgba_to_jpeg() {
        // Create a simple 8x8 red image
        let width = 8u32;
        let height = 8u32;
        let mut rgba_data = Vec::with_capacity((width * height * 4) as usize);
        for _ in 0..(width * height) {
            rgba_data.extend_from_slice(&[255, 0, 0, 255]); // Red pixel
        }

        let result = encode_rgba_to_jpeg(&rgba_data, width, height, 85);
        assert!(result.is_ok(), "Encoding failed: {:?}", result.err());

        let jpeg = result.unwrap();
        // JPEG magic bytes
        assert!(jpeg.len() > 2);
        assert_eq!(jpeg[0], 0xFF);
        assert_eq!(jpeg[1], 0xD8);
    }

    #[test]
    fn test_rgba8_to_rgb() {
        let rgba = vec![255, 128, 64, 255, 0, 0, 0, 128];
        let rgb = rgba8_to_rgb(&rgba);
        assert_eq!(rgb, vec![255, 128, 64, 0, 0, 0]);
    }

    #[test]
    fn test_f16_to_u8() {
        // f16 1.0 = 0x3C00
        assert_eq!(f16_to_u8(0x3C00), 255);
        // f16 0.0 = 0x0000
        assert_eq!(f16_to_u8(0x0000), 0);
        // f16 0.5 = 0x3800
        assert_eq!(f16_to_u8(0x3800), 128);
    }

    #[test]
    fn test_rgba16f_to_rgb() {
        // One pixel: R=1.0, G=0.5, B=0.0, A=1.0 in f16
        let data: Vec<u8> = vec![
            0x00, 0x3C, // R = 1.0
            0x00, 0x38, // G = 0.5
            0x00, 0x00, // B = 0.0
            0x00, 0x3C, // A = 1.0
        ];
        let rgb = rgba16f_to_rgb(&data);
        assert_eq!(rgb, vec![255, 128, 0]);
    }

    #[test]
    fn test_encode_rgba16f() {
        // 2x2 image in Rgba16Float (8 bytes/pixel)
        let width = 2u32;
        let height = 2u32;
        let f16_one: [u8; 2] = 0x3C00u16.to_le_bytes();
        let f16_zero: [u8; 2] = 0x0000u16.to_le_bytes();
        let mut data = Vec::with_capacity(32);
        for _ in 0..4 {
            data.extend_from_slice(&f16_one); // R
            data.extend_from_slice(&f16_zero); // G
            data.extend_from_slice(&f16_zero); // B
            data.extend_from_slice(&f16_one); // A
        }
        let result = encode_rgba_to_jpeg(&data, width, height, 85);
        assert!(
            result.is_ok(),
            "Encoding Rgba16Float failed: {:?}",
            result.err()
        );
        let jpeg = result.unwrap();
        assert_eq!(jpeg[0], 0xFF);
        assert_eq!(jpeg[1], 0xD8);
    }

    #[test]
    fn test_quality_presets() {
        assert_eq!(JpegQualityPreset::Thumbnail.value(), 60);
        assert_eq!(JpegQualityPreset::Preview.value(), 75);
        assert_eq!(JpegQualityPreset::High.value(), 85);
        assert_eq!(JpegQualityPreset::Maximum.value(), 95);
    }

    #[test]
    fn test_invalid_data_size() {
        let rgba_data = vec![0u8; 100]; // Wrong size
        let result = encode_rgba_to_jpeg(&rgba_data, 10, 10, 85);
        assert!(result.is_err());
    }

    #[test]
    fn test_quality_clamping() {
        let width = 8u32;
        let height = 8u32;
        let rgba_data = vec![128u8; (width * height * 4) as usize];

        // Quality 0 should be clamped to 1
        let result = encode_rgba_to_jpeg(&rgba_data, width, height, 0);
        assert!(result.is_ok());

        // Quality 200 should be clamped to 100
        let result = encode_rgba_to_jpeg(&rgba_data, width, height, 200);
        assert!(result.is_ok());
    }
}
