//! Image Content Diff - Pixel-level comparison with SSIM/PSNR metrics
//!
//! Decodes two images, computes structural similarity (SSIM),
//! peak signal-to-noise ratio (PSNR), and generates a difference heatmap.

use crate::error::{MediaError as Error, Result};
use image::{DynamicImage, GenericImageView, Rgba, RgbaImage};
use serde::Serialize;
use std::io::Cursor;
use std::path::Path;

/// Image content diff result
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageContentDiff {
    /// Structural Similarity Index (0.0 = completely different, 1.0 = identical)
    pub ssim: f64,
    /// Peak Signal-to-Noise Ratio in dB (higher = more similar, Infinity = identical)
    pub psnr: f64,
    /// Mean Squared Error (0.0 = identical)
    pub mse: f64,
    /// Percentage of pixels that differ (0.0 - 100.0)
    pub diff_pixel_percent: f64,
    /// Number of pixels that differ
    pub diff_pixel_count: u64,
    /// Total pixel count
    pub total_pixels: u64,
    /// Width of source A
    pub width_a: u32,
    /// Height of source A
    pub height_a: u32,
    /// Width of source B
    pub width_b: u32,
    /// Height of source B
    pub height_b: u32,
    /// Difference heatmap as JPEG base64 (same dimensions as source A)
    pub heatmap: String,
    /// Heatmap width
    pub heatmap_width: u32,
    /// Heatmap height
    pub heatmap_height: u32,
}

/// Compare two images at the pixel level
pub fn diff_image_content<P: AsRef<Path>>(source_a: P, source_b: P) -> Result<ImageContentDiff> {
    let path_a = source_a.as_ref();
    let path_b = source_b.as_ref();

    // Decode images
    let img_a = image::open(path_a)
        .map_err(|e| Error::Other(format!("Failed to decode image A: {}", e)))?;
    let img_b = image::open(path_b)
        .map_err(|e| Error::Other(format!("Failed to decode image B: {}", e)))?;

    let (wa, ha) = img_a.dimensions();
    let (wb, hb) = img_b.dimensions();

    // Resize B to match A if dimensions differ
    let img_b_resized = if wa != wb || ha != hb {
        img_b.resize_exact(wa, ha, image::imageops::FilterType::Lanczos3)
    } else {
        img_b
    };

    let rgba_a = img_a.to_rgba8();
    let rgba_b = img_b_resized.to_rgba8();

    // Compute metrics
    let (mse, diff_count) = compute_mse_and_diff_count(&rgba_a, &rgba_b);
    let total_pixels = (wa as u64) * (ha as u64);
    let psnr = if mse > 0.0 {
        10.0 * (255.0_f64 * 255.0 / mse).log10()
    } else {
        f64::INFINITY
    };
    let ssim = compute_ssim(&rgba_a, &rgba_b);
    let diff_pixel_percent = (diff_count as f64 / total_pixels as f64) * 100.0;

    // Generate heatmap
    let heatmap_img = generate_heatmap(&rgba_a, &rgba_b);
    let heatmap_base64 = encode_image_to_jpeg_base64(&heatmap_img, 85)?;

    Ok(ImageContentDiff {
        ssim,
        psnr,
        mse,
        diff_pixel_percent,
        diff_pixel_count: diff_count,
        total_pixels,
        width_a: wa,
        height_a: ha,
        width_b: wb,
        height_b: hb,
        heatmap: heatmap_base64,
        heatmap_width: wa,
        heatmap_height: ha,
    })
}

/// Compute MSE across all channels and count differing pixels
fn compute_mse_and_diff_count(a: &RgbaImage, b: &RgbaImage) -> (f64, u64) {
    let (w, h) = a.dimensions();
    let total = (w as u64) * (h as u64);
    if total == 0 {
        return (0.0, 0);
    }

    let mut sum_sq: f64 = 0.0;
    let mut diff_count: u64 = 0;

    for (pa, pb) in a.pixels().zip(b.pixels()) {
        let dr = pa[0] as f64 - pb[0] as f64;
        let dg = pa[1] as f64 - pb[1] as f64;
        let db = pa[2] as f64 - pb[2] as f64;
        sum_sq += (dr * dr + dg * dg + db * db) / 3.0;

        // A pixel is "different" if any RGB channel differs by > 1
        if (pa[0] as i16 - pb[0] as i16).unsigned_abs() > 1
            || (pa[1] as i16 - pb[1] as i16).unsigned_abs() > 1
            || (pa[2] as i16 - pb[2] as i16).unsigned_abs() > 1
        {
            diff_count += 1;
        }
    }

    (sum_sq / total as f64, diff_count)
}

/// Compute SSIM (Structural Similarity Index) on RGB channels
///
/// Computes SSIM independently on R, G, B channels using 8x8 blocks,
/// then averages the three channel scores. This captures color differences
/// that luminance-only SSIM would miss.
/// Constants: C1 = (0.01*255)^2, C2 = (0.03*255)^2
fn compute_ssim(a: &RgbaImage, b: &RgbaImage) -> f64 {
    let (w, h) = a.dimensions();
    if w < 8 || h < 8 {
        // Too small for block-based SSIM, fall back to simple comparison
        let (mse, _) = compute_mse_and_diff_count(a, b);
        return if mse == 0.0 {
            1.0
        } else {
            (1.0 / (1.0 + mse / 100.0)).max(0.0)
        };
    }

    // Compute SSIM per channel and average
    let ssim_r = compute_ssim_channel(a, b, 0);
    let ssim_g = compute_ssim_channel(a, b, 1);
    let ssim_b = compute_ssim_channel(a, b, 2);

    ((ssim_r + ssim_g + ssim_b) / 3.0).clamp(0.0, 1.0)
}

/// Compute SSIM for a single channel (0=R, 1=G, 2=B) using 8x8 blocks
fn compute_ssim_channel(a: &RgbaImage, b: &RgbaImage, channel: usize) -> f64 {
    let (w, h) = a.dimensions();
    let c1: f64 = (0.01 * 255.0) * (0.01 * 255.0); // 6.5025
    let c2: f64 = (0.03 * 255.0) * (0.03 * 255.0); // 58.5225

    let block_size: u32 = 8;
    let blocks_x = w / block_size;
    let blocks_y = h / block_size;
    let mut ssim_sum: f64 = 0.0;
    let mut block_count: u64 = 0;

    for by in 0..blocks_y {
        for bx in 0..blocks_x {
            let x0 = bx * block_size;
            let y0 = by * block_size;
            let n = (block_size * block_size) as f64;

            let mut sum_a: f64 = 0.0;
            let mut sum_b: f64 = 0.0;
            let mut sum_a2: f64 = 0.0;
            let mut sum_b2: f64 = 0.0;
            let mut sum_ab: f64 = 0.0;

            for dy in 0..block_size {
                for dx in 0..block_size {
                    let va = a.get_pixel(x0 + dx, y0 + dy)[channel] as f64;
                    let vb = b.get_pixel(x0 + dx, y0 + dy)[channel] as f64;
                    sum_a += va;
                    sum_b += vb;
                    sum_a2 += va * va;
                    sum_b2 += vb * vb;
                    sum_ab += va * vb;
                }
            }

            let mu_a = sum_a / n;
            let mu_b = sum_b / n;
            let sigma_a2 = (sum_a2 / n) - (mu_a * mu_a);
            let sigma_b2 = (sum_b2 / n) - (mu_b * mu_b);
            let sigma_ab = (sum_ab / n) - (mu_a * mu_b);

            let numerator = (2.0 * mu_a * mu_b + c1) * (2.0 * sigma_ab + c2);
            let denominator = (mu_a * mu_a + mu_b * mu_b + c1) * (sigma_a2 + sigma_b2 + c2);

            ssim_sum += numerator / denominator;
            block_count += 1;
        }
    }

    if block_count == 0 {
        1.0
    } else {
        ssim_sum / block_count as f64
    }
}

/// Convert RGBA pixel to luminance (BT.601)
#[inline]
#[allow(dead_code)]
fn luminance(p: &Rgba<u8>) -> f64 {
    0.299 * p[0] as f64 + 0.587 * p[1] as f64 + 0.114 * p[2] as f64
}

/// Generate a difference heatmap image
///
/// Maps per-pixel difference magnitude to a color gradient:
/// - Black (0) = identical
/// - Blue → Green → Yellow → Red (255) = maximum difference
fn generate_heatmap(a: &RgbaImage, b: &RgbaImage) -> RgbaImage {
    let (w, h) = a.dimensions();
    let mut heatmap = RgbaImage::new(w, h);

    for y in 0..h {
        for x in 0..w {
            let pa = a.get_pixel(x, y);
            let pb = b.get_pixel(x, y);

            // Compute per-pixel difference magnitude (0-255)
            let dr = (pa[0] as i16 - pb[0] as i16).unsigned_abs();
            let dg = (pa[1] as i16 - pb[1] as i16).unsigned_abs();
            let db = (pa[2] as i16 - pb[2] as i16).unsigned_abs();
            let diff = ((dr + dg + db) / 3).min(255) as u8;

            // Map to heatmap color
            let color = diff_to_heatmap_color(diff);
            heatmap.put_pixel(x, y, color);
        }
    }

    heatmap
}

/// Map a difference value (0-255) to a heatmap color
/// 0 = transparent black, 1-64 = blue, 65-128 = green, 129-192 = yellow, 193-255 = red
fn diff_to_heatmap_color(diff: u8) -> Rgba<u8> {
    if diff == 0 {
        return Rgba([0, 0, 0, 0]); // Transparent for identical pixels
    }

    let t = diff as f32 / 255.0;
    let (r, g, b) = if t < 0.25 {
        // Black → Blue
        let s = t / 0.25;
        (0.0, 0.0, s)
    } else if t < 0.5 {
        // Blue → Green
        let s = (t - 0.25) / 0.25;
        (0.0, s, 1.0 - s)
    } else if t < 0.75 {
        // Green → Yellow
        let s = (t - 0.5) / 0.25;
        (s, 1.0, 0.0)
    } else {
        // Yellow → Red
        let s = (t - 0.75) / 0.25;
        (1.0, 1.0 - s, 0.0)
    };

    Rgba([
        (r * 255.0) as u8,
        (g * 255.0) as u8,
        (b * 255.0) as u8,
        ((0.3 + 0.7 * t) * 255.0) as u8, // Alpha: 30% base + 70% proportional
    ])
}

/// Encode an RGBA image to JPEG base64
fn encode_image_to_jpeg_base64(img: &RgbaImage, quality: u8) -> Result<String> {
    use base64::Engine;
    use image::codecs::jpeg::JpegEncoder;
    use image::ImageEncoder;

    // Convert RGBA to RGB for JPEG (JPEG doesn't support alpha)
    let rgb_img = DynamicImage::ImageRgba8(img.clone()).to_rgb8();

    let mut buf = Cursor::new(Vec::new());
    let encoder = JpegEncoder::new_with_quality(&mut buf, quality);
    encoder
        .write_image(
            rgb_img.as_raw(),
            img.width(),
            img.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| Error::Other(format!("JPEG encoding failed: {}", e)))?;

    Ok(base64::engine::general_purpose::STANDARD.encode(buf.into_inner()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_solid_image(w: u32, h: u32, color: [u8; 4]) -> RgbaImage {
        let mut img = RgbaImage::new(w, h);
        for p in img.pixels_mut() {
            *p = Rgba(color);
        }
        img
    }

    #[test]
    fn test_mse_identical() {
        let img = make_solid_image(16, 16, [128, 128, 128, 255]);
        let (mse, diff) = compute_mse_and_diff_count(&img, &img);
        assert_eq!(mse, 0.0);
        assert_eq!(diff, 0);
    }

    #[test]
    fn test_mse_different() {
        let a = make_solid_image(16, 16, [0, 0, 0, 255]);
        let b = make_solid_image(16, 16, [255, 255, 255, 255]);
        let (mse, diff) = compute_mse_and_diff_count(&a, &b);
        assert_eq!(mse, 255.0 * 255.0); // Max MSE
        assert_eq!(diff, 256); // All pixels differ
    }

    #[test]
    fn test_ssim_identical() {
        let img = make_solid_image(64, 64, [100, 150, 200, 255]);
        let ssim = compute_ssim(&img, &img);
        assert!(
            (ssim - 1.0).abs() < 0.001,
            "SSIM should be ~1.0, got {}",
            ssim
        );
    }

    #[test]
    fn test_ssim_different() {
        let a = make_solid_image(64, 64, [0, 0, 0, 255]);
        let b = make_solid_image(64, 64, [255, 255, 255, 255]);
        let ssim = compute_ssim(&a, &b);
        assert!(
            ssim < 0.1,
            "SSIM should be low for opposite images, got {}",
            ssim
        );
    }

    #[test]
    fn test_heatmap_identical() {
        let img = make_solid_image(16, 16, [128, 128, 128, 255]);
        let heatmap = generate_heatmap(&img, &img);
        // All pixels should be transparent black
        for p in heatmap.pixels() {
            assert_eq!(p[3], 0, "Identical pixels should be transparent");
        }
    }

    #[test]
    fn test_heatmap_different() {
        let a = make_solid_image(16, 16, [0, 0, 0, 255]);
        let b = make_solid_image(16, 16, [255, 255, 255, 255]);
        let heatmap = generate_heatmap(&a, &b);
        // All pixels should be red (max diff)
        for p in heatmap.pixels() {
            assert!(p[3] > 0, "Different pixels should not be transparent");
            assert_eq!(p[0], 255, "Max diff should be red");
        }
    }

    #[test]
    fn test_diff_to_heatmap_color_zero() {
        let c = diff_to_heatmap_color(0);
        assert_eq!(c[3], 0); // Transparent
    }

    #[test]
    fn test_diff_to_heatmap_color_max() {
        let c = diff_to_heatmap_color(255);
        assert_eq!(c[0], 255); // Red
        assert_eq!(c[1], 0); // No green
    }

    #[test]
    fn test_psnr_identical() {
        let img = make_solid_image(16, 16, [128, 128, 128, 255]);
        let (mse, _) = compute_mse_and_diff_count(&img, &img);
        let psnr = if mse > 0.0 {
            10.0 * (255.0_f64 * 255.0 / mse).log10()
        } else {
            f64::INFINITY
        };
        assert!(
            psnr.is_infinite(),
            "PSNR should be infinity for identical images"
        );
    }

    #[test]
    fn test_luminance() {
        let white = Rgba([255, 255, 255, 255]);
        let black = Rgba([0, 0, 0, 255]);
        assert!((luminance(&white) - 255.0).abs() < 0.01);
        assert!((luminance(&black) - 0.0).abs() < 0.01);
    }

    #[test]
    fn test_ssim_color_only_difference() {
        // Two images with same luminance but different colors
        // RGB SSIM should detect this difference
        let a = make_solid_image(64, 64, [255, 0, 0, 255]); // Red
        let b = make_solid_image(64, 64, [0, 0, 255, 255]); // Blue
        let ssim = compute_ssim(&a, &b);
        assert!(
            ssim < 0.5,
            "RGB SSIM should detect color-only differences, got {}",
            ssim
        );
    }

    #[test]
    fn test_ssim_channel_identical() {
        let img = make_solid_image(64, 64, [100, 150, 200, 255]);
        let ssim_r = compute_ssim_channel(&img, &img, 0);
        let ssim_g = compute_ssim_channel(&img, &img, 1);
        let ssim_b = compute_ssim_channel(&img, &img, 2);
        assert!((ssim_r - 1.0).abs() < 0.001);
        assert!((ssim_g - 1.0).abs() < 0.001);
        assert!((ssim_b - 1.0).abs() < 0.001);
    }
}
