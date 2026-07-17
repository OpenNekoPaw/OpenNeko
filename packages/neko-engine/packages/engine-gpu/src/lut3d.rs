//! 3D LUT (Look-Up Table) support for color grading
//!
//! Supports parsing `.cube` files (Adobe/Resolve standard format) and
//! applying them to RGBA pixel buffers via CPU trilinear interpolation.
//!
//! The process-level `LutRegistry` singleton holds all loaded LUTs keyed by ID.
//! `ColorCorrectionController` writes to it; `EffectDispatcher` reads from it.

use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};

// =============================================================================
// LutRegistry — process-level singleton
// =============================================================================

/// Process-level registry for uploaded 3D LUTs.
///
/// All `EffectDispatcher` instances read from this; `ColorCorrectionController`
/// writes to it. Thread-safe via `RwLock`.
pub struct LutRegistry {
    luts: RwLock<HashMap<String, Lut3DData>>,
}

impl LutRegistry {
    fn new() -> Self {
        Self {
            luts: RwLock::new(HashMap::new()),
        }
    }

    /// Get the global singleton instance.
    pub fn global() -> &'static LutRegistry {
        static INSTANCE: OnceLock<LutRegistry> = OnceLock::new();
        INSTANCE.get_or_init(LutRegistry::new)
    }

    /// Store a LUT under the given ID. Returns the ID.
    pub fn insert(&self, id: String, lut: Lut3DData) {
        if let Ok(mut map) = self.luts.write() {
            map.insert(id, lut);
        }
    }

    /// Remove a LUT by ID. Returns true if it existed.
    pub fn remove(&self, id: &str) -> bool {
        self.luts
            .write()
            .map(|mut m| m.remove(id).is_some())
            .unwrap_or(false)
    }

    /// List all stored LUT IDs.
    pub fn list_ids(&self) -> Vec<String> {
        self.luts
            .read()
            .map(|m| m.keys().cloned().collect())
            .unwrap_or_default()
    }

    /// Get a copy of a stored LUT's data, if it exists.
    pub fn get_data(&self, id: &str) -> Option<Lut3DData> {
        self.luts.read().ok()?.get(id).cloned()
    }

    /// Apply a stored LUT to a pixel buffer, if it exists.
    /// Returns `true` if the LUT was found and applied.
    pub fn apply_to_pixels(&self, id: &str, pixels: &mut [u8], intensity: f32) -> bool {
        if let Ok(map) = self.luts.read() {
            if let Some(lut) = map.get(id) {
                lut.apply_to_pixels(pixels, intensity);
                return true;
            }
        }
        false
    }
}

// =============================================================================
// Lut3DData
// =============================================================================

/// 3D Look-Up Table for color grading.
///
/// Data layout: data[r_idx * size * size + g_idx * size + b_idx] = [out_r, out_g, out_b]
/// where r_idx, g_idx, b_idx are indices into [0, size-1].
#[derive(Debug, Clone)]
pub struct Lut3DData {
    /// LUT grid dimension (e.g., 17, 33, 65)
    pub size: usize,
    /// Flattened RGB output values, 0.0–1.0
    pub data: Vec<[f32; 3]>,
}

impl Lut3DData {
    /// Parse a `.cube` file text content into a Lut3DData.
    ///
    /// Supports the Adobe/DaVinci Resolve `.cube` format:
    /// - Lines starting with `#` are comments (skipped)
    /// - `LUT_3D_SIZE N` declares grid size
    /// - Data lines: `r g b` (float 0.0–1.0), one entry per line
    /// - Entries iterate B fastest, then G, then R
    pub fn from_cube(text: &str) -> Result<Self, String> {
        let mut size: Option<usize> = None;
        let mut data: Vec<[f32; 3]> = Vec::new();

        for line in text.lines() {
            let line = line.trim();

            // Skip comments and empty lines
            if line.is_empty() || line.starts_with('#') {
                continue;
            }

            // Parse LUT_3D_SIZE directive
            if let Some(rest) = line.strip_prefix("LUT_3D_SIZE") {
                let n: usize = rest
                    .trim()
                    .parse()
                    .map_err(|_| format!("Invalid LUT_3D_SIZE value: {}", rest.trim()))?;
                if !(2..=256).contains(&n) {
                    return Err(format!("LUT_3D_SIZE {n} out of valid range [2, 256]"));
                }
                size = Some(n);
                continue;
            }

            // Skip other directives (DOMAIN_MIN, DOMAIN_MAX, TITLE, etc.)
            if line.contains(' ')
                && line
                    .split_whitespace()
                    .next()
                    .map(|w| w.chars().all(|c| c.is_ascii_uppercase() || c == '_'))
                    .unwrap_or(false)
            {
                continue;
            }

            // Parse data line: "r g b"
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 3 {
                continue;
            }
            let r = parts[0]
                .parse::<f32>()
                .map_err(|_| format!("Invalid float in LUT data: {}", parts[0]))?;
            let g = parts[1]
                .parse::<f32>()
                .map_err(|_| format!("Invalid float in LUT data: {}", parts[1]))?;
            let b = parts[2]
                .parse::<f32>()
                .map_err(|_| format!("Invalid float in LUT data: {}", parts[2]))?;
            data.push([r.clamp(0.0, 1.0), g.clamp(0.0, 1.0), b.clamp(0.0, 1.0)]);
        }

        let size = size.ok_or_else(|| "Missing LUT_3D_SIZE directive".to_string())?;
        let expected = size * size * size;
        if data.len() != expected {
            return Err(format!(
                "LUT data count mismatch: expected {expected} entries for size {size}, got {}",
                data.len()
            ));
        }

        Ok(Self { size, data })
    }

    /// Apply trilinear interpolation to a single RGB triplet (0.0–1.0).
    ///
    /// The `.cube` format iterates B fastest, G next, R slowest:
    ///   index = r_i * size * size + g_i * size + b_i
    #[inline]
    pub fn apply(&self, r: f32, g: f32, b: f32) -> [f32; 3] {
        let n = self.size;
        let scale = (n - 1) as f32;

        // Clamp and compute fractional indices
        let fr = (r.clamp(0.0, 1.0) * scale).min(scale);
        let fg = (g.clamp(0.0, 1.0) * scale).min(scale);
        let fb = (b.clamp(0.0, 1.0) * scale).min(scale);

        let r0 = fr.floor() as usize;
        let g0 = fg.floor() as usize;
        let b0 = fb.floor() as usize;
        let r1 = (r0 + 1).min(n - 1);
        let g1 = (g0 + 1).min(n - 1);
        let b1 = (b0 + 1).min(n - 1);

        let dr = fr - r0 as f32;
        let dg = fg - g0 as f32;
        let db = fb - b0 as f32;

        // Trilinear interpolation: sample 8 corners
        let c000 = self.get(r0, g0, b0);
        let c001 = self.get(r0, g0, b1);
        let c010 = self.get(r0, g1, b0);
        let c011 = self.get(r0, g1, b1);
        let c100 = self.get(r1, g0, b0);
        let c101 = self.get(r1, g0, b1);
        let c110 = self.get(r1, g1, b0);
        let c111 = self.get(r1, g1, b1);

        let mut out = [0.0f32; 3];
        for i in 0..3 {
            // Interpolate along B axis
            let c00 = c000[i] * (1.0 - db) + c001[i] * db;
            let c01 = c010[i] * (1.0 - db) + c011[i] * db;
            let c10 = c100[i] * (1.0 - db) + c101[i] * db;
            let c11 = c110[i] * (1.0 - db) + c111[i] * db;
            // Interpolate along G axis
            let c0 = c00 * (1.0 - dg) + c01 * dg;
            let c1 = c10 * (1.0 - dg) + c11 * dg;
            // Interpolate along R axis
            out[i] = c0 * (1.0 - dr) + c1 * dr;
        }
        out
    }

    /// Apply this LUT to an RGBA pixel buffer in-place with intensity blend.
    ///
    /// `intensity` is 0.0 (no effect) to 1.0 (full LUT). Alpha channel is preserved.
    pub fn apply_to_pixels(&self, pixels: &mut [u8], intensity: f32) {
        let intensity = intensity.clamp(0.0, 1.0);
        for chunk in pixels.chunks_exact_mut(4) {
            let r_in = chunk[0] as f32 / 255.0;
            let g_in = chunk[1] as f32 / 255.0;
            let b_in = chunk[2] as f32 / 255.0;

            let [r_out, g_out, b_out] = self.apply(r_in, g_in, b_in);

            // Blend between original and LUT output
            chunk[0] = ((r_in + (r_out - r_in) * intensity) * 255.0)
                .round()
                .clamp(0.0, 255.0) as u8;
            chunk[1] = ((g_in + (g_out - g_in) * intensity) * 255.0)
                .round()
                .clamp(0.0, 255.0) as u8;
            chunk[2] = ((b_in + (b_out - b_in) * intensity) * 255.0)
                .round()
                .clamp(0.0, 255.0) as u8;
            // chunk[3] alpha unchanged
        }
    }

    /// Convert LUT data to RGBA8 bytes for uploading as a `wgpu::Texture` (3D, `Rgba8Unorm`).
    ///
    /// GPU 3D texture layout: x = r_idx, y = g_idx, z = b_idx
    /// → texel at (x, y, z) = LUT output for input (x/scale, y/scale, z/scale)
    /// → data[z * n * n + y * n + x] mapped from our storage [r*n*n + g*n + b]
    ///
    /// Result: `n * n * n * 4` bytes (RGBA8, A=255), depth-slice-major order.
    pub fn to_texture_bytes(&self) -> Vec<u8> {
        let n = self.size;
        let mut out = Vec::with_capacity(n * n * n * 4);
        // GPU texture layout: x=r, y=g, z=b
        // Iterate z (b) outermost, y (g) middle, x (r) innermost — matches wgpu depth-slice upload
        for b in 0..n {
            for g in 0..n {
                for r in 0..n {
                    let [ro, go, bo] = self.get(r, g, b);
                    out.push((ro * 255.0).round().clamp(0.0, 255.0) as u8);
                    out.push((go * 255.0).round().clamp(0.0, 255.0) as u8);
                    out.push((bo * 255.0).round().clamp(0.0, 255.0) as u8);
                    out.push(255u8); // alpha
                }
            }
        }
        out
    }

    #[inline]
    fn get(&self, r: usize, g: usize, b: usize) -> [f32; 3] {
        let n = self.size;
        self.data[r * n * n + g * n + b]
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn identity_cube(size: usize) -> String {
        let mut lines = format!("LUT_3D_SIZE {size}\n");
        let scale = (size - 1) as f32;
        for r in 0..size {
            for g in 0..size {
                for b in 0..size {
                    lines.push_str(&format!(
                        "{:.6} {:.6} {:.6}\n",
                        r as f32 / scale, // R out = R in (identity)
                        g as f32 / scale,
                        b as f32 / scale, // B out = B in (identity)
                    ));
                }
            }
        }
        lines
    }

    #[test]
    fn test_parse_identity_lut() {
        let cube = identity_cube(17);
        let lut = Lut3DData::from_cube(&cube).expect("parse identity lut");
        assert_eq!(lut.size, 17);
        assert_eq!(lut.data.len(), 17 * 17 * 17);
    }

    #[test]
    fn test_identity_apply() {
        let cube = identity_cube(33);
        let lut = Lut3DData::from_cube(&cube).expect("parse");

        // At grid corners, output == input exactly
        let [r, g, b] = lut.apply(0.0, 0.0, 0.0);
        assert!((r - 0.0).abs() < 1e-4, "r={r}");
        assert!((g - 0.0).abs() < 1e-4, "g={g}");
        assert!((b - 0.0).abs() < 1e-4, "b={b}");

        let [r, g, b] = lut.apply(1.0, 1.0, 1.0);
        assert!((r - 1.0).abs() < 1e-4, "r={r}");
        assert!((g - 1.0).abs() < 1e-4, "g={g}");
        assert!((b - 1.0).abs() < 1e-4, "b={b}");

        // Mid-point interpolation on identity LUT
        let [r, g, b] = lut.apply(0.5, 0.25, 0.75);
        assert!((r - 0.5).abs() < 0.02, "r={r}");
        assert!((g - 0.25).abs() < 0.02, "g={g}");
        assert!((b - 0.75).abs() < 0.02, "b={b}");
    }

    #[test]
    fn test_apply_to_pixels_full_intensity() {
        // Identity LUT should not change pixels at full intensity
        let cube = identity_cube(17);
        let lut = Lut3DData::from_cube(&cube).expect("parse");
        let mut pixels: Vec<u8> = vec![128, 64, 200, 255, 10, 20, 30, 128];
        let original = pixels.clone();
        lut.apply_to_pixels(&mut pixels, 1.0);
        // With identity LUT, pixels should be nearly unchanged (within rounding)
        for i in 0..pixels.len() {
            assert!(
                (pixels[i] as i32 - original[i] as i32).abs() <= 2,
                "pixel[{i}] changed too much"
            );
        }
    }

    #[test]
    fn test_apply_to_pixels_zero_intensity() {
        let cube = identity_cube(17);
        let lut = Lut3DData::from_cube(&cube).expect("parse");
        let mut pixels: Vec<u8> = vec![100, 150, 200, 255];
        let original = pixels.clone();
        lut.apply_to_pixels(&mut pixels, 0.0);
        assert_eq!(pixels, original, "zero intensity should not change pixels");
    }

    #[test]
    fn test_parse_with_comments_and_directives() {
        let cube = "# This is a test LUT\n# Author: Test\nTITLE \"Test\"\nDOMAIN_MIN 0.0 0.0 0.0\nDOMAIN_MAX 1.0 1.0 1.0\nLUT_3D_SIZE 2\n0.0 0.0 0.0\n1.0 1.0 1.0\n0.0 0.0 0.0\n1.0 1.0 1.0\n0.0 0.0 0.0\n1.0 1.0 1.0\n0.0 0.0 0.0\n1.0 1.0 1.0\n";
        let lut = Lut3DData::from_cube(cube).expect("parse with metadata");
        assert_eq!(lut.size, 2);
        assert_eq!(lut.data.len(), 8);
    }

    #[test]
    fn test_parse_missing_size() {
        let cube = "0.0 0.0 0.0\n";
        assert!(Lut3DData::from_cube(cube).is_err());
    }

    #[test]
    fn test_parse_wrong_data_count() {
        let cube = "LUT_3D_SIZE 2\n0.0 0.0 0.0\n";
        assert!(Lut3DData::from_cube(cube).is_err());
    }

    #[test]
    fn test_to_texture_bytes_size() {
        let cube = identity_cube(4);
        let lut = Lut3DData::from_cube(&cube).expect("parse");
        let bytes = lut.to_texture_bytes();
        assert_eq!(bytes.len(), 4 * 4 * 4 * 4); // n^3 * 4 bytes
                                                // All alpha bytes should be 255
        for i in (3..bytes.len()).step_by(4) {
            assert_eq!(bytes[i], 255);
        }
    }

    #[test]
    fn test_to_texture_bytes_identity_corners() {
        // Identity LUT: texel at (x=r, y=g, z=b) should output (r/scale, g/scale, b/scale)
        let n = 4usize;
        let cube = identity_cube(n);
        let lut = Lut3DData::from_cube(&cube).expect("parse");
        let bytes = lut.to_texture_bytes();
        let scale = (n - 1) as f32;

        // Check corner (r=0, g=0, b=0) → first texel → (0, 0, 0, 255)
        assert_eq!(&bytes[0..4], &[0u8, 0, 0, 255]);

        // Check corner (r=n-1, g=n-1, b=n-1) → last texel → (255, 255, 255, 255)
        let last_start = bytes.len() - 4;
        assert_eq!(&bytes[last_start..], &[255u8, 255, 255, 255]);

        // Check (r=1, g=0, b=0): z=0 (b=0), y=0 (g=0), x=1 (r=1)
        // index = (0*n*n + 0*n + 1) * 4 = 4
        let expected_r = ((1.0f32 / scale) * 255.0).round() as u8;
        assert_eq!(bytes[4], expected_r, "r channel at (1,0,0)");
        assert_eq!(bytes[5], 0u8, "g channel at (1,0,0)");
        assert_eq!(bytes[6], 0u8, "b channel at (1,0,0)");
    }

    #[test]
    fn test_lut_registry_get_data() {
        let registry = LutRegistry::new();
        assert!(registry.get_data("nonexistent").is_none());

        let cube = identity_cube(4);
        let lut = Lut3DData::from_cube(&cube).expect("parse");
        registry.insert("test".to_string(), lut);
        let retrieved = registry.get_data("test");
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().size, 4);
    }
}
