//! FFmpeg SSIM/PSNR log parser
//!
//! Parses the per-frame statistics output by FFmpeg's `ssim` and `psnr` filters
//! into structured Rust types.
//!
//! ## FFmpeg SSIM log format
//! ```text
//! n:1 Y:0.987654 U:0.991234 V:0.993456 All:0.990123 (20.04)
//! n:2 Y:0.985432 U:0.990123 V:0.992345 All:0.988901 (19.55)
//! ```
//!
//! ## FFmpeg PSNR log format
//! ```text
//! n:1 mse_avg:1.23 mse_y:1.45 mse_u:0.89 mse_v:0.67 psnr_avg:47.23 psnr_y:46.52 psnr_u:48.64 psnr_v:49.87
//! n:2 mse_avg:1.56 mse_y:1.78 mse_u:0.92 mse_v:0.71 psnr_avg:46.20 psnr_y:45.63 psnr_u:48.49 psnr_v:49.62
//! ```

use crate::error::Result;

/// Parsed SSIM entry for a single frame
#[derive(Debug, Clone)]
#[allow(dead_code)] // Phase 2: quality metrics analysis
pub struct SsimEntry {
    /// Frame number (1-based)
    pub frame: u64,
    /// SSIM for Y (luminance) channel
    pub y: f64,
    /// SSIM for U (chrominance) channel
    pub u: f64,
    /// SSIM for V (chrominance) channel
    pub v: f64,
    /// SSIM across all channels
    pub all: f64,
}

/// Parsed PSNR entry for a single frame
#[derive(Debug, Clone)]
#[allow(dead_code)] // Phase 2: quality metrics analysis
pub struct PsnrEntry {
    /// Frame number (1-based)
    pub frame: u64,
    /// Average MSE
    pub mse_avg: f64,
    /// Average PSNR in dB
    pub psnr_avg: f64,
}

/// Parse an FFmpeg SSIM log file into structured entries
///
/// Each line: `n:1 Y:0.987654 U:0.991234 V:0.993456 All:0.990123 (20.04)`
pub fn parse_ssim_log(content: &str) -> Result<Vec<SsimEntry>> {
    let mut entries = Vec::new();

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        match parse_ssim_line(line) {
            Ok(entry) => entries.push(entry),
            Err(e) => {
                // Tolerate malformed/truncated lines (e.g. from large FFmpeg output)
                tracing::warn!(
                    "Skipping malformed SSIM line: {} ({})",
                    e,
                    &line[..line.len().min(80)]
                );
            }
        }
    }

    Ok(entries)
}

/// Parse a single SSIM log line
fn parse_ssim_line(line: &str) -> std::result::Result<SsimEntry, String> {
    let mut frame: Option<u64> = None;
    let mut y: Option<f64> = None;
    let mut u: Option<f64> = None;
    let mut v: Option<f64> = None;
    let mut all: Option<f64> = None;

    for token in line.split_whitespace() {
        if let Some((key, value)) = token.split_once(':') {
            match key {
                "n" => {
                    frame = Some(
                        value
                            .parse::<u64>()
                            .map_err(|e| format!("bad frame: {}", e))?,
                    );
                }
                "Y" => {
                    y = Some(value.parse::<f64>().map_err(|e| format!("bad Y: {}", e))?);
                }
                "U" => {
                    u = Some(value.parse::<f64>().map_err(|e| format!("bad U: {}", e))?);
                }
                "V" => {
                    v = Some(value.parse::<f64>().map_err(|e| format!("bad V: {}", e))?);
                }
                "All" => {
                    all = Some(
                        value
                            .parse::<f64>()
                            .map_err(|e| format!("bad All: {}", e))?,
                    );
                }
                _ => {} // ignore dB value in parentheses, etc.
            }
        }
    }

    Ok(SsimEntry {
        frame: frame.ok_or("missing n:")?,
        y: y.ok_or("missing Y:")?,
        u: u.ok_or("missing U:")?,
        v: v.ok_or("missing V:")?,
        all: all.ok_or("missing All:")?,
    })
}

/// Parse an FFmpeg PSNR log file into structured entries
///
/// Each line: `n:1 mse_avg:1.23 mse_y:1.45 mse_u:0.89 mse_v:0.67 psnr_avg:47.23 ...`
pub fn parse_psnr_log(content: &str) -> Result<Vec<PsnrEntry>> {
    let mut entries = Vec::new();

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        match parse_psnr_line(line) {
            Ok(entry) => entries.push(entry),
            Err(e) => {
                // Tolerate malformed/truncated lines
                tracing::warn!(
                    "Skipping malformed PSNR line: {} ({})",
                    e,
                    &line[..line.len().min(80)]
                );
            }
        }
    }

    Ok(entries)
}

/// Parse a single PSNR log line
fn parse_psnr_line(line: &str) -> std::result::Result<PsnrEntry, String> {
    let mut frame: Option<u64> = None;
    let mut mse_avg: Option<f64> = None;
    let mut psnr_avg: Option<f64> = None;

    for token in line.split_whitespace() {
        if let Some((key, value)) = token.split_once(':') {
            match key {
                "n" => {
                    frame = Some(
                        value
                            .parse::<u64>()
                            .map_err(|e| format!("bad frame: {}", e))?,
                    );
                }
                "mse_avg" => {
                    mse_avg = Some(
                        value
                            .parse::<f64>()
                            .map_err(|e| format!("bad mse_avg: {}", e))?,
                    );
                }
                "psnr_avg" => {
                    // FFmpeg outputs "inf" for identical frames
                    let v = if value == "inf" {
                        f64::INFINITY
                    } else {
                        value
                            .parse::<f64>()
                            .map_err(|e| format!("bad psnr_avg: {}", e))?
                    };
                    psnr_avg = Some(v);
                }
                _ => {}
            }
        }
    }

    Ok(PsnrEntry {
        frame: frame.ok_or("missing n:")?,
        mse_avg: mse_avg.ok_or("missing mse_avg:")?,
        psnr_avg: psnr_avg.ok_or("missing psnr_avg:")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_ssim_line_normal() {
        let line = "n:1 Y:0.987654 U:0.991234 V:0.993456 All:0.990123 (20.04)";
        let entry = parse_ssim_line(line).unwrap();
        assert_eq!(entry.frame, 1);
        assert!((entry.y - 0.987654).abs() < 1e-6);
        assert!((entry.u - 0.991234).abs() < 1e-6);
        assert!((entry.v - 0.993456).abs() < 1e-6);
        assert!((entry.all - 0.990123).abs() < 1e-6);
    }

    #[test]
    fn test_parse_ssim_log_multi_line() {
        let log = "\
n:1 Y:0.987654 U:0.991234 V:0.993456 All:0.990123 (20.04)
n:2 Y:0.985432 U:0.990123 V:0.992345 All:0.988901 (19.55)
n:3 Y:0.999999 U:0.999998 V:0.999997 All:0.999998 (56.99)
";
        let entries = parse_ssim_log(log).unwrap();
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].frame, 1);
        assert_eq!(entries[1].frame, 2);
        assert_eq!(entries[2].frame, 3);
        assert!((entries[2].all - 0.999998).abs() < 1e-6);
    }

    #[test]
    fn test_parse_ssim_log_empty() {
        let entries = parse_ssim_log("").unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn test_parse_ssim_line_missing_field() {
        let line = "n:1 Y:0.99 U:0.99";
        let result = parse_ssim_line(line);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_psnr_line_normal() {
        let line = "n:1 mse_avg:1.23 mse_y:1.45 mse_u:0.89 mse_v:0.67 psnr_avg:47.23 psnr_y:46.52 psnr_u:48.64 psnr_v:49.87";
        let entry = parse_psnr_line(line).unwrap();
        assert_eq!(entry.frame, 1);
        assert!((entry.mse_avg - 1.23).abs() < 1e-6);
        assert!((entry.psnr_avg - 47.23).abs() < 1e-6);
    }

    #[test]
    fn test_parse_psnr_line_inf() {
        let line = "n:1 mse_avg:0.00 mse_y:0.00 mse_u:0.00 mse_v:0.00 psnr_avg:inf psnr_y:inf psnr_u:inf psnr_v:inf";
        let entry = parse_psnr_line(line).unwrap();
        assert_eq!(entry.mse_avg, 0.0);
        assert!(entry.psnr_avg.is_infinite());
    }

    #[test]
    fn test_parse_psnr_log_multi_line() {
        let log = "\
n:1 mse_avg:1.23 mse_y:1.45 mse_u:0.89 mse_v:0.67 psnr_avg:47.23 psnr_y:46.52 psnr_u:48.64 psnr_v:49.87
n:2 mse_avg:0.00 mse_y:0.00 mse_u:0.00 mse_v:0.00 psnr_avg:inf psnr_y:inf psnr_u:inf psnr_v:inf
";
        let entries = parse_psnr_log(log).unwrap();
        assert_eq!(entries.len(), 2);
        assert!((entries[0].psnr_avg - 47.23).abs() < 1e-6);
        assert!(entries[1].psnr_avg.is_infinite());
    }

    #[test]
    fn test_parse_psnr_log_empty() {
        let entries = parse_psnr_log("").unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn test_parse_psnr_line_missing_field() {
        let line = "n:1 mse_avg:1.23";
        let result = parse_psnr_line(line);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_ssim_log_tolerates_truncated_lines() {
        // Simulates truncated FFmpeg output where a line is cut off
        let log = "\
n:1 Y:0.987654 U:0.991234 V:0.993456 All:0.990123 (20.04)
n:2 Y:1.000000 U:1.00000
n:3 Y:0.999999 U:0.999998 V:0.999997 All:0.999998 (56.99)
";
        let entries = parse_ssim_log(log).unwrap();
        // Line 2 is truncated (missing V: and All:), should be skipped
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].frame, 1);
        assert_eq!(entries[1].frame, 3);
    }

    #[test]
    fn test_parse_psnr_log_tolerates_truncated_lines() {
        let log = "\
n:1 mse_avg:1.23 mse_y:1.45 mse_u:0.89 mse_v:0.67 psnr_avg:47.23 psnr_y:46.52 psnr_u:48.64 psnr_v:49.87
n:2 mse_avg:0.50
n:3 mse_avg:0.00 mse_y:0.00 mse_u:0.00 mse_v:0.00 psnr_avg:inf psnr_y:inf psnr_u:inf psnr_v:inf
";
        let entries = parse_psnr_log(log).unwrap();
        // Line 2 is truncated (missing psnr_avg), should be skipped
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].frame, 1);
        assert_eq!(entries[1].frame, 3);
    }
}
