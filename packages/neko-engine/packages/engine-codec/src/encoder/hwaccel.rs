//! Hardware-accelerated encoder using FFmpeg hwaccel
//!
//! Supports:
//! - macOS: VideoToolbox (h264_videotoolbox, hevc_videotoolbox)
//! - Linux: VAAPI (h264_vaapi, hevc_vaapi)
//! - NVIDIA: NVENC (h264_nvenc, hevc_nvenc)
//! - Intel: Quick Sync Video (h264_qsv, hevc_qsv)
//!
//! ## Input Requirements
//!
//! This encoder expects **NV12 format** input data. The GPU pipeline should
//! perform RGBA→NV12 conversion using compute shaders before encoding.
//! No CPU-based format conversion is performed (zero-copy design).

use super::codec_ext::HwEncoderTypeExt;
use super::traits::{
    EncodedPacket, Encoder, EncoderConfig, EncoderPreset, HwEncoderType, VideoCodec,
};
use crate::error::{Error, Result};

use ffmpeg_next as ffmpeg;
use ffmpeg_next::format::Pixel;
use ffmpeg_next::util::color::Range as ColorRange;
use ffmpeg_next::util::frame::video::Video as VideoFrame;
use ffmpeg_next::util::picture;
use ffmpeg_next::{Dictionary, Rational};

use crate::init_ffmpeg;
#[cfg(any(target_os = "linux", target_os = "windows"))]
use std::path::Path;

// =============================================================================
// Hardware Encoder Detection
// =============================================================================

/// Detect available hardware encoders on the current platform
pub fn detect_hw_encoders() -> Vec<HwEncoderType> {
    let mut available = Vec::new();

    #[cfg(target_os = "macos")]
    {
        // VideoToolbox is always available on macOS
        available.push(HwEncoderType::VideoToolbox);
    }

    #[cfg(target_os = "linux")]
    {
        // Check for NVIDIA GPU (NVENC)
        if Path::new("/dev/nvidia0").exists() {
            available.push(HwEncoderType::Nvenc);
        }

        // Check for VAAPI (Intel/AMD)
        if Path::new("/dev/dri/renderD128").exists() {
            available.push(HwEncoderType::Vaapi);
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Check for NVIDIA (NVENC)
        if std::env::var("CUDA_PATH").is_ok()
            || Path::new("C:\\Windows\\System32\\nvEncodeAPI64.dll").exists()
        {
            available.push(HwEncoderType::Nvenc);
        }

        // Intel QSV is generally available on Windows with Intel GPUs
        // This is a simplified check
        available.push(HwEncoderType::Qsv);
    }

    available
}

/// Get the best available hardware encoder
pub fn get_best_hw_encoder() -> HwEncoderType {
    let available = detect_hw_encoders();
    available.into_iter().next().unwrap_or(HwEncoderType::None)
}

// =============================================================================
// Hardware-Accelerated Encoder
// =============================================================================

/// Hardware-accelerated FFmpeg encoder (GPU-only)
///
/// ## Input Format
///
/// This encoder requires **NV12** pixel format input. The caller must ensure
/// data is in NV12 format before calling `encode_frame()`. Use the GPU-based
/// `RgbaToNv12Converter` for format conversion to avoid CPU overhead.
///
/// ## Zero-Copy Mode (macOS)
///
/// When `use_zero_copy_gpu` is enabled, the encoder uses VideoToolbox's hardware
/// frame context for true zero-copy encoding:
/// 1. Create hw_device_ctx (VideoToolbox device)
/// 2. Create hw_frames_ctx (hardware frame pool)
/// 3. Set encoder pix_fmt to AV_PIX_FMT_VIDEOTOOLBOX
/// 4. Pass CVPixelBuffer via AVFrame.data[3] with hw_frames_ctx reference
pub struct HwAccelEncoder {
    /// FFmpeg encoder context
    encoder: Option<ffmpeg::encoder::Video>,
    /// Encoder configuration
    config: Option<EncoderConfig>,
    /// Frame counter
    frame_count: i64,
    /// Time base for timestamps
    time_base: Rational,
    /// Resolved hardware encoder type
    hw_type: HwEncoderType,
    /// Whether hardware encoding is active
    hw_active: bool,
    /// Hardware device context (for zero-copy encoding on macOS)
    #[cfg(target_os = "macos")]
    hw_device_ctx: Option<*mut ffmpeg::ffi::AVBufferRef>,
    /// Hardware frames context (for zero-copy encoding on macOS)
    #[cfg(target_os = "macos")]
    hw_frames_ctx: Option<*mut ffmpeg::ffi::AVBufferRef>,
    /// Whether zero-copy mode is active
    #[cfg(target_os = "macos")]
    zero_copy_active: bool,
}

// Safety: The raw pointers are only accessed from the encoder thread
unsafe impl Send for HwAccelEncoder {}

impl HwAccelEncoder {
    /// Create a new hardware-accelerated encoder
    pub fn new() -> Self {
        init_ffmpeg();
        Self {
            encoder: None,
            config: None,
            frame_count: 0,
            time_base: Rational::new(1, 1000),
            hw_type: HwEncoderType::None,
            hw_active: false,
            #[cfg(target_os = "macos")]
            hw_device_ctx: None,
            #[cfg(target_os = "macos")]
            hw_frames_ctx: None,
            #[cfg(target_os = "macos")]
            zero_copy_active: false,
        }
    }

    /// Check if hardware encoding is active
    pub fn is_hw_active(&self) -> bool {
        self.hw_active
    }

    /// Whether the active encoder session is using the CVPixelBuffer zero-copy path.
    pub fn is_zero_copy_active(&self) -> bool {
        #[cfg(target_os = "macos")]
        {
            self.zero_copy_active
        }
        #[cfg(not(target_os = "macos"))]
        {
            false
        }
    }

    /// Get the active hardware encoder type
    pub fn active_hw_type(&self) -> HwEncoderType {
        if self.hw_active {
            self.hw_type
        } else {
            HwEncoderType::None
        }
    }

    /// Get codec extradata (SPS/PPS for H.264) from the encoder context.
    /// Must be called after `open()`. Returns None if encoder is not open or has no extradata.
    pub fn get_extradata(&self) -> Option<Vec<u8>> {
        let encoder = self.encoder.as_ref()?;
        unsafe {
            let ctx = encoder.as_ptr();
            let extradata = (*ctx).extradata;
            let size = (*ctx).extradata_size as usize;
            if extradata.is_null() || size == 0 {
                return None;
            }
            let data = std::slice::from_raw_parts(extradata, size).to_vec();
            tracing::info!(
                "Encoder extradata: {} bytes, first 8: {:02x?}",
                size,
                &data[..std::cmp::min(8, data.len())]
            );
            Some(data)
        }
    }

    /// Get the raw AVCodecContext pointer for use with avcodec_parameters_from_context().
    ///
    /// # Safety
    /// The returned pointer is only valid while the encoder is open.
    /// Caller must ensure the encoder is not closed/dropped while the pointer is in use.
    pub fn codec_context_ptr(&self) -> Option<*const ffmpeg::ffi::AVCodecContext> {
        self.encoder.as_ref().map(|e| unsafe { e.as_ptr() })
    }

    /// Copy NV12 frame data from buffer to VideoFrame
    ///
    /// Input data must be in NV12 format: Y plane followed by interleaved UV plane.
    /// Optimized with fast path when stride == width (uses memcpy instead of row-by-row copy).
    fn copy_nv12_to_frame(data: &[u8], frame: &mut VideoFrame, width: u32, height: u32) {
        let w = width as usize;
        let h = height as usize;

        // Y plane
        let y_stride = frame.stride(0);
        let y_data = frame.data_mut(0);

        if y_stride == w {
            // Fast path: stride matches width, use single memcpy
            // This is ~3-5x faster due to better cache utilization and SIMD optimization
            let y_size = w * h;
            y_data[..y_size].copy_from_slice(&data[..y_size]);
        } else {
            // Slow path: stride mismatch, copy row by row
            for y in 0..h {
                let src_offset = y * w;
                let dst_offset = y * y_stride;
                y_data[dst_offset..dst_offset + w]
                    .copy_from_slice(&data[src_offset..src_offset + w]);
            }
        }

        // UV plane (interleaved)
        let uv_offset = w * h;
        let uv_stride = frame.stride(1);
        let uv_data = frame.data_mut(1);
        let uv_h = h / 2;

        if uv_stride == w {
            // Fast path: stride matches width
            let uv_size = w * uv_h;
            uv_data[..uv_size].copy_from_slice(&data[uv_offset..uv_offset + uv_size]);
        } else {
            // Slow path: stride mismatch, copy row by row
            for y in 0..uv_h {
                let src_offset = uv_offset + y * w;
                let dst_offset = y * uv_stride;
                uv_data[dst_offset..dst_offset + w]
                    .copy_from_slice(&data[src_offset..src_offset + w]);
            }
        }
    }

    /// Receive encoded packets from encoder
    fn receive_packets(&mut self) -> Result<Vec<EncodedPacket>> {
        let encoder = self.encoder.as_mut().ok_or(Error::EncoderNotInitialized)?;
        let mut packets = Vec::new();
        let mut packet = ffmpeg::Packet::empty();

        loop {
            match encoder.receive_packet(&mut packet) {
                Ok(_) => {
                    packets.push(EncodedPacket {
                        data: packet.data().unwrap_or(&[]).to_vec(),
                        pts: packet.pts().unwrap_or(0),
                        dts: packet.dts().unwrap_or(0),
                        is_keyframe: packet.is_key(),
                        duration: packet.duration(),
                        stream_index: 0,
                    });
                }
                Err(ffmpeg::Error::Other { errno }) if errno == ffmpeg::error::EAGAIN => {
                    break;
                }
                Err(ffmpeg::Error::Eof) => {
                    break;
                }
                Err(e) => {
                    return Err(Error::EncodeFailed(e.to_string()));
                }
            }
        }

        Ok(packets)
    }

    /// Try to open a hardware encoder
    ///
    /// When `use_zero_copy` is true and hw_type is VideoToolbox, this will set up
    /// the complete hardware frame context chain for true zero-copy encoding.
    fn try_open_hw_encoder(
        &mut self,
        config: &EncoderConfig,
        hw_type: HwEncoderType,
    ) -> Result<bool> {
        let encoder_name = match hw_type.encoder_name(config.codec) {
            Some(name) => name,
            None => {
                tracing::debug!(
                    "Hardware encoder {:?} does not support codec {:?}",
                    hw_type,
                    config.codec
                );
                return Ok(false);
            }
        };

        tracing::info!("Attempting to open hardware encoder: {}", encoder_name);

        // Find encoder by name
        let codec = match ffmpeg::encoder::find_by_name(encoder_name) {
            Some(c) => c,
            None => {
                tracing::debug!("Hardware encoder {} not found", encoder_name);
                return Ok(false);
            }
        };

        // Create encoder context
        let context = ffmpeg::codec::context::Context::new_with_codec(codec);
        let mut encoder = context.encoder().video()?;

        // Set encoding parameters
        encoder.set_width(config.width);
        encoder.set_height(config.height);

        // Set frame rate and time base
        let fps_num = (config.fps * 1000.0) as i32;
        let fps_den = 1000;
        encoder.set_frame_rate(Some(Rational::new(fps_num, fps_den)));

        self.time_base = Rational::new(fps_den, fps_num);
        encoder.set_time_base(self.time_base);

        // Set bitrate
        encoder.set_bit_rate(config.bitrate as usize);

        // Check if zero-copy mode should be enabled
        let use_zero_copy = config.use_zero_copy_gpu && hw_type == HwEncoderType::VideoToolbox;

        #[cfg(target_os = "macos")]
        if use_zero_copy {
            // ================================================================
            // ZERO-COPY MODE: Set pix_fmt to VIDEOTOOLBOX
            // ================================================================
            // VideoToolbox encoder reads CVPixelBuffer from AVFrame.data[3]
            // when format is AV_PIX_FMT_VIDEOTOOLBOX.
            // The CVPixelBuffer must be NV12 (420v) with IOSurface backing.
            // ================================================================

            // Set encoder format to VIDEOTOOLBOX
            unsafe {
                let vt_format: ffmpeg::ffi::AVPixelFormat = Pixel::VIDEOTOOLBOX.into();
                (*encoder.as_mut_ptr()).pix_fmt = vt_format;
            }
            self.zero_copy_active = true;

            tracing::info!(
                "Zero-copy encoding enabled (CVPixelBuffer via data[3], VIDEOTOOLBOX format)"
            );
        }

        #[cfg(not(target_os = "macos"))]
        let _ = use_zero_copy; // Suppress unused variable warning

        // If zero-copy not active, use standard NV12 format
        #[cfg(target_os = "macos")]
        if !self.zero_copy_active {
            encoder.set_format(Pixel::NV12);
        }

        #[cfg(not(target_os = "macos"))]
        encoder.set_format(Pixel::NV12);

        // Set color range - VideoToolbox requires explicit color range
        encoder.set_color_range(ColorRange::MPEG); // Limited range (16-235) - standard for video

        // Set GOP size if specified
        if let Some(gop) = config.gop_size {
            encoder.set_gop(gop);
        } else {
            // Default GOP = 1 second
            encoder.set_gop((config.fps as u32).max(1));
        }

        // Set max B-frames if specified
        if let Some(max_b) = config.max_b_frames {
            encoder.set_max_b_frames(max_b as usize);
        }

        let opts = build_hw_encoder_options(config, hw_type);

        // Set GLOBAL_HEADER flag if requested (needed for MP4/fMP4 muxing)
        if config.global_header {
            unsafe {
                (*encoder.as_mut_ptr()).flags |= ffmpeg::ffi::AV_CODEC_FLAG_GLOBAL_HEADER as i32;
            }
        }

        // Try to open encoder
        match encoder.open_with(opts) {
            Ok(encoder) => {
                // Debug: Log encoder's actual pix_fmt after opening
                unsafe {
                    let encoder_ptr = encoder.as_ptr();
                    let actual_pix_fmt = (*encoder_ptr).pix_fmt as i32;
                    let vt_pix_fmt = ffmpeg::ffi::AVPixelFormat::AV_PIX_FMT_VIDEOTOOLBOX as i32;
                    tracing::debug!(
                        "Encoder opened with pix_fmt={} (VIDEOTOOLBOX={})",
                        actual_pix_fmt,
                        vt_pix_fmt
                    );
                }

                self.encoder = Some(encoder);
                self.config = Some(config.clone());
                self.hw_type = hw_type;
                self.hw_active = true;
                self.frame_count = 0;

                #[cfg(target_os = "macos")]
                let format_str = if self.zero_copy_active {
                    "VIDEOTOOLBOX (zero-copy)"
                } else {
                    "NV12"
                };
                #[cfg(not(target_os = "macos"))]
                let format_str = "NV12";

                tracing::info!(
                    "Hardware encoder opened: {} ({}x{} @ {:.2} fps, {} input)",
                    encoder_name,
                    config.width,
                    config.height,
                    config.fps,
                    format_str
                );

                Ok(true)
            }
            Err(e) => {
                // Clean up hardware contexts on failure
                #[cfg(target_os = "macos")]
                {
                    if let Some(frames_ctx) = self.hw_frames_ctx.take() {
                        unsafe {
                            let mut ctx = frames_ctx;
                            ffmpeg::ffi::av_buffer_unref(&mut ctx);
                        }
                    }
                    if let Some(device_ctx) = self.hw_device_ctx.take() {
                        unsafe {
                            let mut ctx = device_ctx;
                            ffmpeg::ffi::av_buffer_unref(&mut ctx);
                        }
                    }
                    self.zero_copy_active = false;
                }

                tracing::debug!("Failed to open hardware encoder {}: {}", encoder_name, e);
                Ok(false)
            }
        }
    }

    #[cfg(target_os = "macos")]
    fn encode_frame_gpu_with_keyframe_request(
        &mut self,
        gpu_handle: usize,
        pts: i64,
        force_keyframe: bool,
    ) -> Result<Vec<EncodedPacket>> {
        use objc::runtime::Object;
        use std::ptr;

        type IOSurfaceRef = *mut Object;
        type CVPixelBufferRef = *mut Object;

        #[link(name = "IOSurface", kind = "framework")]
        extern "C" {
            fn IOSurfaceLock(surface: IOSurfaceRef, options: u32, seed: *mut u32) -> i32;
            fn IOSurfaceUnlock(surface: IOSurfaceRef, options: u32, seed: *mut u32) -> i32;
            fn IOSurfaceGetBaseAddressOfPlane(surface: IOSurfaceRef, plane: usize) -> *mut u8;
            fn IOSurfaceGetBytesPerRowOfPlane(surface: IOSurfaceRef, plane: usize) -> usize;
        }

        #[link(name = "CoreVideo", kind = "framework")]
        extern "C" {
            fn CVPixelBufferCreateWithIOSurface(
                allocator: *const Object,
                surface: IOSurfaceRef,
                pixel_buffer_attributes: *const Object,
                pixel_buffer_out: *mut CVPixelBufferRef,
            ) -> i32;
            fn CVPixelBufferGetPixelFormatType(pixel_buffer: CVPixelBufferRef) -> u32;
            fn CVPixelBufferGetWidth(pixel_buffer: CVPixelBufferRef) -> usize;
            fn CVPixelBufferGetHeight(pixel_buffer: CVPixelBufferRef) -> usize;
        }

        #[link(name = "CoreFoundation", kind = "framework")]
        extern "C" {
            fn CFRelease(cf: *const Object);
        }

        const K_IO_SURFACE_LOCK_READ_ONLY: u32 = 1;

        let config = self
            .config
            .as_ref()
            .ok_or(Error::EncoderNotInitialized)?
            .clone();
        let io_surface = gpu_handle as IOSurfaceRef;

        if self.zero_copy_active {
            let mut cv_pixel_buffer: CVPixelBufferRef = ptr::null_mut();
            let cv_result = unsafe {
                CVPixelBufferCreateWithIOSurface(
                    ptr::null(),
                    io_surface,
                    ptr::null(),
                    &mut cv_pixel_buffer,
                )
            };

            if cv_result != 0 || cv_pixel_buffer.is_null() {
                return Err(Error::Other(format!(
                    "CVPixelBufferCreateWithIOSurface failed: {}",
                    cv_result
                )));
            }

            let cv_format = unsafe { CVPixelBufferGetPixelFormatType(cv_pixel_buffer) };
            let cv_width = unsafe { CVPixelBufferGetWidth(cv_pixel_buffer) };
            let cv_height = unsafe { CVPixelBufferGetHeight(cv_pixel_buffer) };
            tracing::debug!(
                "CVPixelBuffer: format=0x{:08x} ({}), size={}x{}",
                cv_format,
                match cv_format {
                    0x34323076 => "420v/NV12",
                    0x34323066 => "420f/NV12-full",
                    0x42475241 => "BGRA",
                    _ => "unknown",
                },
                cv_width,
                cv_height
            );

            let mut frame = VideoFrame::empty();
            frame.set_pts(Some(pts));
            if force_keyframe {
                frame.set_kind(picture::Type::I);
            }
            frame.set_color_range(ColorRange::MPEG);

            unsafe {
                let frame_ptr = frame.as_mut_ptr();
                let vt_format: ffmpeg::ffi::AVPixelFormat = Pixel::VIDEOTOOLBOX.into();
                (*frame_ptr).format = vt_format as i32;
                (*frame_ptr).width = config.width as i32;
                (*frame_ptr).height = config.height as i32;
                (*frame_ptr).data[3] = cv_pixel_buffer as *mut u8;

                extern "C" fn release_cv_pixel_buffer(
                    opaque: *mut std::ffi::c_void,
                    _data: *mut u8,
                ) {
                    if !opaque.is_null() {
                        #[link(name = "CoreFoundation", kind = "framework")]
                        extern "C" {
                            fn CFRelease(cf: *const objc::runtime::Object);
                        }
                        unsafe {
                            CFRelease(opaque as *const objc::runtime::Object);
                        }
                    }
                }

                (*frame_ptr).buf[0] = ffmpeg::ffi::av_buffer_create(
                    ptr::null_mut(),
                    0,
                    Some(release_cv_pixel_buffer),
                    cv_pixel_buffer as *mut std::ffi::c_void,
                    0,
                );

                if (*frame_ptr).buf[0].is_null() {
                    CFRelease(cv_pixel_buffer as *const Object);
                    return Err(Error::Other(
                        "Failed to create AVBufferRef for CVPixelBuffer".into(),
                    ));
                }
            }

            let encoder = self.encoder.as_mut().ok_or(Error::EncoderNotInitialized)?;
            unsafe {
                let frame_ptr = frame.as_ptr();
                let encoder_ptr = encoder.as_ptr();
                tracing::debug!(
                    "AVFrame: format={}, size={}x{}, data[3]={:?}, buf[0]={:?}",
                    (*frame_ptr).format,
                    (*frame_ptr).width,
                    (*frame_ptr).height,
                    (*frame_ptr).data[3],
                    (*frame_ptr).buf[0]
                );
                tracing::debug!(
                    "Encoder: pix_fmt={}, size={}x{}",
                    (*encoder_ptr).pix_fmt as i32,
                    (*encoder_ptr).width,
                    (*encoder_ptr).height
                );
            }

            if let Err(e) = encoder.send_frame(&frame) {
                return Err(Error::EncodeFailed(format!(
                    "Frame {} send failed (zero-copy): {}",
                    pts, e
                )));
            }

            self.frame_count += 1;
            self.receive_packets()
        } else {
            let lock_result =
                unsafe { IOSurfaceLock(io_surface, K_IO_SURFACE_LOCK_READ_ONLY, ptr::null_mut()) };
            if lock_result != 0 {
                return Err(Error::Other(format!(
                    "Failed to lock IOSurface: {}",
                    lock_result
                )));
            }

            let (y_ptr, y_stride, uv_ptr, uv_stride) = unsafe {
                let y_ptr = IOSurfaceGetBaseAddressOfPlane(io_surface, 0);
                let y_stride = IOSurfaceGetBytesPerRowOfPlane(io_surface, 0);
                let uv_ptr = IOSurfaceGetBaseAddressOfPlane(io_surface, 1);
                let uv_stride = IOSurfaceGetBytesPerRowOfPlane(io_surface, 1);
                (y_ptr, y_stride, uv_ptr, uv_stride)
            };

            if pts < 3 {
                let height = config.height as usize;
                let plane_size = y_stride * height;
                let y_data =
                    unsafe { std::slice::from_raw_parts(y_ptr, std::cmp::min(plane_size, 256)) };
                let non_zero = y_data.iter().filter(|&&b| b != 0).count();
                tracing::debug!(
                    "encode_frame_gpu: pts={} y_ptr={:?} y_stride={} first_16={:02x?} non_zero_in_256={}",
                    pts, y_ptr, y_stride, &y_data[..16.min(y_data.len())], non_zero
                );
            }

            let mut frame = VideoFrame::empty();
            frame.set_pts(Some(pts));
            if force_keyframe {
                frame.set_kind(picture::Type::I);
            }
            frame.set_color_range(ColorRange::MPEG);

            unsafe {
                let frame_ptr = frame.as_mut_ptr();
                let nv12_format: ffmpeg::ffi::AVPixelFormat = Pixel::NV12.into();
                (*frame_ptr).format = nv12_format as i32;
                (*frame_ptr).width = config.width as i32;
                (*frame_ptr).height = config.height as i32;
                (*frame_ptr).data[0] = y_ptr;
                (*frame_ptr).data[1] = uv_ptr;
                (*frame_ptr).linesize[0] = y_stride as i32;
                (*frame_ptr).linesize[1] = uv_stride as i32;
            }

            let encoder = self.encoder.as_mut().ok_or(Error::EncoderNotInitialized)?;
            let send_result = encoder.send_frame(&frame);

            unsafe {
                IOSurfaceUnlock(io_surface, K_IO_SURFACE_LOCK_READ_ONLY, ptr::null_mut());
            }

            if let Err(e) = send_result {
                return Err(Error::EncodeFailed(format!(
                    "Frame {} send failed: {}",
                    pts, e
                )));
            }

            self.frame_count += 1;
            self.receive_packets()
        }
    }
}

fn build_hw_encoder_options(config: &EncoderConfig, hw_type: HwEncoderType) -> Dictionary<'static> {
    let mut opts = Dictionary::new();

    match hw_type {
        HwEncoderType::VideoToolbox => {
            opts.set("allow_sw", "0");
            match config.preset {
                EncoderPreset::Ultrafast | EncoderPreset::Fast => {
                    opts.set("realtime", "1");
                    opts.set("prio_speed", "1");
                    opts.set("power_efficient", "0");
                    opts.set("frames_before", "0");
                    opts.set("frames_after", "0");
                    if config.codec == VideoCodec::H264 {
                        opts.set("coder", "vlc");
                    }
                }
                _ => {
                    opts.set("realtime", "0");
                }
            }
            if config.profile.is_none() {
                opts.set("profile", "constrained_baseline");
            }
        }
        HwEncoderType::Nvenc => {
            opts.set("preset", "p4");
            opts.set("tune", "hq");
            opts.set("rc", "vbr");
        }
        HwEncoderType::Vaapi => {
            opts.set("low_power", "0");
        }
        HwEncoderType::Qsv => {
            opts.set("preset", "medium");
        }
        HwEncoderType::Amf => {
            opts.set("quality", "balanced");
        }
        _ => {}
    }

    if let Some(ref profile) = config.profile {
        opts.set("profile", profile);
    }

    opts
}

impl Default for HwAccelEncoder {
    fn default() -> Self {
        Self::new()
    }
}

impl Encoder for HwAccelEncoder {
    fn open(&mut self, config: &EncoderConfig) -> Result<()> {
        // Determine which hardware encoder to try
        let hw_types_to_try: Vec<HwEncoderType> = match config.hw_encoder {
            HwEncoderType::Auto => {
                // Try all available hardware encoders
                detect_hw_encoders()
                    .into_iter()
                    .filter(|t| *t != HwEncoderType::None)
                    .collect()
            }
            HwEncoderType::None => {
                // None now means Auto (always require hardware)
                detect_hw_encoders()
                    .into_iter()
                    .filter(|t| *t != HwEncoderType::None)
                    .collect()
            }
            specific => {
                // Try only the specified hardware encoder
                vec![specific]
            }
        };

        if hw_types_to_try.is_empty() {
            return Err(Error::Other(
                "No hardware encoder available on this platform".into(),
            ));
        }

        // Try hardware encoders
        let mut last_error = None;
        for hw_type in &hw_types_to_try {
            match self.try_open_hw_encoder(config, *hw_type) {
                Ok(true) => return Ok(()),
                Ok(false) => continue,
                Err(e) => {
                    tracing::warn!("Hardware encoder {:?} failed: {}", hw_type, e);
                    last_error = Some(e);
                    continue;
                }
            }
        }

        // All hardware encoders failed
        Err(last_error.unwrap_or_else(|| {
            Error::Other(format!(
                "No hardware encoder supports codec {:?} (tried: {:?})",
                config.codec, hw_types_to_try
            ))
        }))
    }

    fn encode_frame(&mut self, data: &[u8], pts: i64) -> Result<Vec<EncodedPacket>> {
        let config = self
            .config
            .as_ref()
            .ok_or(Error::EncoderNotInitialized)?
            .clone();

        // Validate input data size (NV12: width * height * 1.5)
        let expected_size = (config.width * config.height * 3 / 2) as usize;
        if data.len() < expected_size {
            return Err(Error::InvalidParameter(format!(
                "NV12 data too small: expected {} bytes, got {}",
                expected_size,
                data.len()
            )));
        }

        // Create NV12 frame and copy data directly (no format conversion)
        let mut frame = VideoFrame::new(Pixel::NV12, config.width, config.height);
        Self::copy_nv12_to_frame(data, &mut frame, config.width, config.height);

        // Set PTS and color range (VideoToolbox requires explicit color range)
        frame.set_pts(Some(pts));
        frame.set_color_range(ColorRange::MPEG); // Limited range (16-235) - standard for video

        // Send frame to encoder
        let encoder = self.encoder.as_mut().ok_or(Error::EncoderNotInitialized)?;
        if let Err(e) = encoder.send_frame(&frame) {
            // Return error so pipeline knows the frame was dropped
            return Err(Error::EncodeFailed(format!(
                "Frame {} send failed: {}",
                pts, e
            )));
        }

        self.frame_count += 1;

        // Receive encoded packets
        self.receive_packets()
    }

    fn flush(&mut self) -> Result<Vec<EncodedPacket>> {
        let encoder = self.encoder.as_mut().ok_or(Error::EncoderNotInitialized)?;

        // Send EOF to encoder
        encoder.send_eof()?;

        // Receive remaining packets
        self.receive_packets()
    }

    fn close(&mut self) {
        self.encoder = None;
        self.config = None;
        self.frame_count = 0;
        self.hw_active = false;

        // Clean up hardware contexts on macOS
        #[cfg(target_os = "macos")]
        {
            if let Some(frames_ctx) = self.hw_frames_ctx.take() {
                unsafe {
                    let mut ctx = frames_ctx;
                    ffmpeg::ffi::av_buffer_unref(&mut ctx);
                }
            }
            if let Some(device_ctx) = self.hw_device_ctx.take() {
                unsafe {
                    let mut ctx = device_ctx;
                    ffmpeg::ffi::av_buffer_unref(&mut ctx);
                }
            }
            self.zero_copy_active = false;
        }
    }

    fn config(&self) -> Option<&EncoderConfig> {
        self.config.as_ref()
    }

    /// Encode a frame from GPU texture handle (zero-copy path)
    ///
    /// On macOS with zero_copy_active, this creates a CVPixelBuffer from the IOSurface
    /// and passes it to VideoToolbox via AVFrame.data[3] with proper hw_frames_ctx.
    ///
    /// Without zero_copy_active, it maps IOSurface memory directly to AVFrame (partial zero-copy).
    #[cfg(target_os = "macos")]
    fn encode_frame_gpu(&mut self, gpu_handle: usize, pts: i64) -> Result<Vec<EncodedPacket>> {
        self.encode_frame_gpu_with_keyframe_request(gpu_handle, pts, false)
    }

    #[cfg(target_os = "macos")]
    fn encode_keyframe_gpu(&mut self, gpu_handle: usize, pts: i64) -> Result<Vec<EncodedPacket>> {
        self.encode_frame_gpu_with_keyframe_request(gpu_handle, pts, true)
    }

    #[cfg(not(target_os = "macos"))]
    fn encode_frame_gpu(&mut self, _gpu_handle: usize, _pts: i64) -> Result<Vec<EncodedPacket>> {
        Err(Error::UnsupportedCapability(format!(
            "zero-copy GPU frame encoding is not implemented on {}",
            std::env::consts::OS
        )))
    }

    fn supports_gpu_input(&self) -> bool {
        // macOS VideoToolbox supports true zero-copy via IOSurface → CVPixelBuffer
        cfg!(target_os = "macos") && self.hw_type == HwEncoderType::VideoToolbox
    }
}

impl Drop for HwAccelEncoder {
    fn drop(&mut self) {
        self.close();
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_hw_encoders() {
        let available = detect_hw_encoders();
        // Should have platform-specific hardware encoders only
        // On macOS: VideoToolbox, on Linux: Nvenc/Vaapi, on Windows: Nvenc/Qsv
        assert!(!available.contains(&HwEncoderType::None));
    }

    #[test]
    fn test_hw_encoder_type_names() {
        // VideoToolbox
        assert_eq!(
            HwEncoderType::VideoToolbox.encoder_name(VideoCodec::H264),
            Some("h264_videotoolbox")
        );
        assert_eq!(
            HwEncoderType::VideoToolbox.encoder_name(VideoCodec::H265),
            Some("hevc_videotoolbox")
        );

        // NVENC
        assert_eq!(
            HwEncoderType::Nvenc.encoder_name(VideoCodec::H264),
            Some("h264_nvenc")
        );
        assert_eq!(
            HwEncoderType::Nvenc.encoder_name(VideoCodec::H265),
            Some("hevc_nvenc")
        );

        // VAAPI
        assert_eq!(
            HwEncoderType::Vaapi.encoder_name(VideoCodec::H264),
            Some("h264_vaapi")
        );
        assert_eq!(
            HwEncoderType::Vaapi.encoder_name(VideoCodec::H265),
            Some("hevc_vaapi")
        );

        // QSV
        assert_eq!(
            HwEncoderType::Qsv.encoder_name(VideoCodec::H264),
            Some("h264_qsv")
        );
        assert_eq!(
            HwEncoderType::Qsv.encoder_name(VideoCodec::H265),
            Some("hevc_qsv")
        );

        // None returns None
        assert_eq!(HwEncoderType::None.encoder_name(VideoCodec::H264), None);

        // VP9 and ProRes have no hardware encoders
        assert_eq!(
            HwEncoderType::VideoToolbox.encoder_name(VideoCodec::Vp9),
            None
        );
        assert_eq!(HwEncoderType::Nvenc.encoder_name(VideoCodec::ProRes), None);
    }

    #[test]
    fn test_encoder_config_with_hw() {
        let config = EncoderConfig::new(1920, 1080, 30.0, VideoCodec::H264)
            .with_hw_encoder(HwEncoderType::Auto);

        assert_eq!(config.hw_encoder, HwEncoderType::Auto);
    }

    #[test]
    fn test_encoder_config_default_no_hw() {
        let config = EncoderConfig::new(1920, 1080, 30.0, VideoCodec::H264);

        assert_eq!(config.hw_encoder, HwEncoderType::None);
    }

    #[test]
    fn videotoolbox_realtime_preview_options_prioritize_low_latency() {
        let config = EncoderConfig::new(1920, 1080, 60.0, VideoCodec::H264)
            .with_preset(EncoderPreset::Ultrafast)
            .with_max_b_frames(0);
        let opts = build_hw_encoder_options(&config, HwEncoderType::VideoToolbox);

        assert_eq!(opts.get("allow_sw"), Some("0"));
        assert_eq!(opts.get("realtime"), Some("1"));
        assert_eq!(opts.get("prio_speed"), Some("1"));
        assert_eq!(opts.get("power_efficient"), Some("0"));
        assert_eq!(opts.get("coder"), Some("vlc"));
        assert_eq!(opts.get("max_ref_frames"), None);
        assert_eq!(opts.get("profile"), Some("constrained_baseline"));
    }

    #[test]
    fn videotoolbox_quality_options_do_not_force_realtime() {
        let config = EncoderConfig::new(1920, 1080, 60.0, VideoCodec::H264)
            .with_preset(EncoderPreset::Medium)
            .with_profile("high");
        let opts = build_hw_encoder_options(&config, HwEncoderType::VideoToolbox);

        assert_eq!(opts.get("realtime"), Some("0"));
        assert_eq!(opts.get("prio_speed"), None);
        assert_eq!(opts.get("max_ref_frames"), None);
        assert_eq!(opts.get("profile"), Some("high"));
    }
}
