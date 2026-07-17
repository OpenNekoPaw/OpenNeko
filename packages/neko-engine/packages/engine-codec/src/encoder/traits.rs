//! Encoder trait and types
//!
//! Canonical enum definitions (`VideoCodec`, `HwEncoderType`, `EncoderPreset`,
//! `ContainerFormat`) live in `neko_engine_types` and are re-exported here for
//! backward compatibility. FFmpeg-specific methods are provided via extension
//! traits in [`super::codec_ext`].

use crate::error::Result;

// Re-export canonical types from neko_engine_types (single source of truth)
pub use neko_engine_types::{
    ContainerFormat, EncoderPreset, HwEncoderType, PixelFormat, VideoCodec,
};

// Import extension traits so methods are available where traits.rs types are used
use super::codec_ext::VideoCodecExt;

/// Encoder configuration
#[derive(Debug, Clone)]
pub struct EncoderConfig {
    /// Output width
    pub width: u32,
    /// Output height
    pub height: u32,
    /// Frame rate (fps)
    pub fps: f64,
    /// Target bitrate in bits per second
    pub bitrate: u64,
    /// Video codec
    pub codec: VideoCodec,
    /// Input pixel format
    pub pixel_format: PixelFormat,
    /// Encoding preset
    pub preset: EncoderPreset,
    /// Codec profile (e.g., "high", "main", "baseline" for H.264)
    pub profile: Option<String>,
    /// GOP size (keyframe interval)
    pub gop_size: Option<u32>,
    /// Maximum B-frames
    pub max_b_frames: Option<u32>,
    /// Hardware encoder type (None = software only, Auto = try hw first)
    pub hw_encoder: HwEncoderType,
    /// Enable true zero-copy GPU encoding via CVPixelBuffer (macOS only)
    ///
    /// When enabled, `encode_frame_gpu` will use AV_PIX_FMT_VIDEOTOOLBOX format
    /// and pass CVPixelBuffer directly to VideoToolbox without any CPU involvement.
    /// This provides the best performance but requires IOSurface-backed textures.
    pub use_zero_copy_gpu: bool,
    /// Request global header (extradata) from encoder.
    /// Required for muxing into containers like MP4/fMP4 that need SPS/PPS in moov.
    pub global_header: bool,
}

impl EncoderConfig {
    /// Create a new encoder config with defaults
    ///
    /// Note: Default pixel format is NV12 for hardware encoder compatibility.
    /// Use GPU-based RgbaToNv12Converter if your source is RGBA.
    pub fn new(width: u32, height: u32, fps: f64, codec: VideoCodec) -> Self {
        Self {
            width,
            height,
            fps,
            bitrate: codec.default_bitrate(width, height),
            codec,
            pixel_format: PixelFormat::Nv12, // NV12 for hardware encoders
            preset: EncoderPreset::default(),
            profile: None,
            gop_size: None,
            max_b_frames: None,
            hw_encoder: HwEncoderType::default(),
            use_zero_copy_gpu: false, // Disabled by default for compatibility
            global_header: false,
        }
    }

    /// Set bitrate
    pub fn with_bitrate(mut self, bitrate: u64) -> Self {
        self.bitrate = bitrate;
        self
    }

    /// Set pixel format
    pub fn with_pixel_format(mut self, format: PixelFormat) -> Self {
        self.pixel_format = format;
        self
    }

    /// Set preset
    pub fn with_preset(mut self, preset: EncoderPreset) -> Self {
        self.preset = preset;
        self
    }

    /// Set profile
    pub fn with_profile(mut self, profile: impl Into<String>) -> Self {
        self.profile = Some(profile.into());
        self
    }

    /// Set hardware encoder type
    pub fn with_hw_encoder(mut self, hw_encoder: HwEncoderType) -> Self {
        self.hw_encoder = hw_encoder;
        self
    }

    /// Set GOP size (keyframe interval)
    pub fn with_gop_size(mut self, gop_size: u32) -> Self {
        self.gop_size = Some(gop_size);
        self
    }

    /// Set maximum B-frames
    pub fn with_max_b_frames(mut self, max_b_frames: u32) -> Self {
        self.max_b_frames = Some(max_b_frames);
        self
    }

    /// Enable zero-copy GPU encoding (macOS VideoToolbox only)
    ///
    /// When enabled, `encode_frame_gpu` uses AV_PIX_FMT_VIDEOTOOLBOX format
    /// and passes CVPixelBuffer directly to VideoToolbox encoder.
    /// This eliminates all CPU-GPU data transfers for maximum performance.
    pub fn with_zero_copy_gpu(mut self, enabled: bool) -> Self {
        self.use_zero_copy_gpu = enabled;
        self
    }

    /// Enable global header mode (extradata in codec context, required for MP4/fMP4 muxing)
    pub fn with_global_header(mut self, enabled: bool) -> Self {
        self.global_header = enabled;
        self
    }
}

/// Encoded video packet
#[derive(Debug)]
pub struct EncodedPacket {
    /// Encoded data
    pub data: Vec<u8>,
    /// Presentation timestamp
    pub pts: i64,
    /// Decoding timestamp
    pub dts: i64,
    /// Whether this is a keyframe
    pub is_keyframe: bool,
    /// Duration in time base units
    pub duration: i64,
    /// Stream index (for muxing)
    pub stream_index: usize,
}

/// Video encoder trait
pub trait Encoder {
    /// Initialize the encoder with configuration
    fn open(&mut self, config: &EncoderConfig) -> Result<()>;

    /// Encode a single frame from CPU buffer
    /// Returns encoded packets (may be empty if encoder is buffering)
    fn encode_frame(&mut self, data: &[u8], pts: i64) -> Result<Vec<EncodedPacket>>;

    /// Encode a frame from GPU texture handle (zero-copy path)
    ///
    /// On macOS, `gpu_handle` is an IOSurface handle.
    /// On Linux, `gpu_handle` is a DMA-BUF file descriptor.
    /// On Windows, `gpu_handle` is a D3D11 shared handle.
    ///
    /// Default implementation falls back to CPU path (not recommended).
    fn encode_frame_gpu(&mut self, gpu_handle: usize, pts: i64) -> Result<Vec<EncodedPacket>> {
        let _ = (gpu_handle, pts);
        Err(crate::error::Error::Other(
            "GPU frame encoding not supported by this encoder".to_string(),
        ))
    }

    /// Encode a GPU frame while requesting this frame to be independently decodable.
    ///
    /// Encoders that cannot force an IDR frame without reopening the hardware session
    /// may fall back to `encode_frame_gpu`.
    fn encode_keyframe_gpu(&mut self, gpu_handle: usize, pts: i64) -> Result<Vec<EncodedPacket>> {
        self.encode_frame_gpu(gpu_handle, pts)
    }

    /// Check if this encoder supports zero-copy GPU input
    fn supports_gpu_input(&self) -> bool {
        false
    }

    /// Flush the encoder and get remaining packets
    fn flush(&mut self) -> Result<Vec<EncodedPacket>>;

    /// Close the encoder and release resources
    fn close(&mut self);

    /// Get current encoder configuration
    fn config(&self) -> Option<&EncoderConfig>;

    /// Check if encoder is open
    fn is_open(&self) -> bool {
        self.config().is_some()
    }
}
