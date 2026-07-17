//! Transform types with coordinate conversion behavior

use serde::{Deserialize, Serialize};

/// 2D Transform with normalized coordinates
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transform {
    /// Position X (pixels or normalized)
    #[serde(default)]
    pub x: f32,
    /// Position Y (pixels or normalized)
    #[serde(default)]
    pub y: f32,
    /// Scale X (1.0 = 100%)
    #[serde(default = "default_scale")]
    pub scale_x: f32,
    /// Scale Y (1.0 = 100%)
    #[serde(default = "default_scale")]
    pub scale_y: f32,
    /// Rotation in degrees
    #[serde(default)]
    pub rotation: f32,
    /// Anchor point X (0.0 = left, 0.5 = center, 1.0 = right)
    #[serde(default)]
    pub anchor_x: f32,
    /// Anchor point Y (0.0 = top, 0.5 = center, 1.0 = bottom)
    #[serde(default)]
    pub anchor_y: f32,
}

fn default_scale() -> f32 {
    1.0
}

impl Default for Transform {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            rotation: 0.0,
            anchor_x: 0.0,
            anchor_y: 0.0,
        }
    }
}

impl Transform {
    /// Create a centered transform
    pub fn centered() -> Self {
        Self {
            anchor_x: 0.5,
            anchor_y: 0.5,
            ..Default::default()
        }
    }

    /// Convert to pixel coordinates for GPU pipeline
    pub fn to_pixel_coords(&self, canvas_width: u32, canvas_height: u32) -> PixelTransform {
        PixelTransform {
            x: self.x as i32,
            y: self.y as i32,
            width: (self.scale_x * canvas_width as f32) as u32,
            height: (self.scale_y * canvas_height as f32) as u32,
            rotation: self.rotation as f64,
            anchor_x: self.anchor_x,
            anchor_y: self.anchor_y,
        }
    }

    /// Convert normalized coordinates (0.0-1.0) to pixel coordinates
    pub fn normalized_to_pixel(
        &self,
        canvas_width: u32,
        canvas_height: u32,
        element_width: u32,
        element_height: u32,
    ) -> PixelTransform {
        PixelTransform {
            x: (self.x * canvas_width as f32) as i32,
            y: (self.y * canvas_height as f32) as i32,
            width: (self.scale_x * element_width as f32) as u32,
            height: (self.scale_y * element_height as f32) as u32,
            rotation: self.rotation as f64,
            anchor_x: self.anchor_x,
            anchor_y: self.anchor_y,
        }
    }

    /// Apply another transform on top of this one
    pub fn compose(&self, other: &Transform) -> Transform {
        Transform {
            x: self.x + other.x,
            y: self.y + other.y,
            scale_x: self.scale_x * other.scale_x,
            scale_y: self.scale_y * other.scale_y,
            rotation: self.rotation + other.rotation,
            anchor_x: other.anchor_x, // Use the other's anchor
            anchor_y: other.anchor_y,
        }
    }

    /// Check if transform is identity (no transformation)
    pub fn is_identity(&self) -> bool {
        self.x == 0.0
            && self.y == 0.0
            && (self.scale_x - 1.0).abs() < f32::EPSILON
            && (self.scale_y - 1.0).abs() < f32::EPSILON
            && self.rotation == 0.0
    }
}

/// Pixel-space transform for GPU pipeline
#[derive(Debug, Clone, Copy)]
pub struct PixelTransform {
    /// X position in pixels
    pub x: i32,
    /// Y position in pixels
    pub y: i32,
    /// Width in pixels
    pub width: u32,
    /// Height in pixels
    pub height: u32,
    /// Rotation in degrees
    pub rotation: f64,
    /// Anchor X (0.0-1.0)
    pub anchor_x: f32,
    /// Anchor Y (0.0-1.0)
    pub anchor_y: f32,
}

impl Default for PixelTransform {
    fn default() -> Self {
        Self {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            rotation: 0.0,
            anchor_x: 0.0,
            anchor_y: 0.0,
        }
    }
}

impl PixelTransform {
    /// Create a new pixel transform
    pub fn new(x: i32, y: i32, width: u32, height: u32) -> Self {
        Self {
            x,
            y,
            width,
            height,
            rotation: 0.0,
            anchor_x: 0.0,
            anchor_y: 0.0,
        }
    }

    /// Get the bounding rectangle
    pub fn bounds(&self) -> (i32, i32, u32, u32) {
        (self.x, self.y, self.width, self.height)
    }

    /// Check if a point is within the transform bounds (ignoring rotation)
    pub fn contains_point(&self, px: i32, py: i32) -> bool {
        px >= self.x
            && px < self.x + self.width as i32
            && py >= self.y
            && py < self.y + self.height as i32
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transform_default() {
        let t = Transform::default();
        assert!(t.is_identity());
    }

    #[test]
    fn test_transform_to_pixel() {
        let t = Transform {
            x: 100.0,
            y: 50.0,
            scale_x: 0.5,
            scale_y: 0.5,
            rotation: 45.0,
            anchor_x: 0.5,
            anchor_y: 0.5,
        };

        let pixel = t.to_pixel_coords(1920, 1080);
        assert_eq!(pixel.x, 100);
        assert_eq!(pixel.y, 50);
        assert_eq!(pixel.width, 960);
        assert_eq!(pixel.height, 540);
        assert_eq!(pixel.rotation, 45.0);
    }

    #[test]
    fn test_transform_compose() {
        let t1 = Transform {
            x: 10.0,
            y: 20.0,
            scale_x: 2.0,
            scale_y: 2.0,
            ..Default::default()
        };

        let t2 = Transform {
            x: 5.0,
            y: 5.0,
            scale_x: 0.5,
            scale_y: 0.5,
            ..Default::default()
        };

        let composed = t1.compose(&t2);
        assert_eq!(composed.x, 15.0);
        assert_eq!(composed.y, 25.0);
        assert_eq!(composed.scale_x, 1.0);
        assert_eq!(composed.scale_y, 1.0);
    }
}
