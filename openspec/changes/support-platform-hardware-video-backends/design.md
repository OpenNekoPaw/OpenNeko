# Design: Platform hardware video backends

## Five-layer analysis

| Layer          | Decision                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | `@neko/media/node` owns backend selection, FFmpeg arguments, capability names, and diagnostic classification. Domain adapters own only operation semantics.   |
| Dependency     | Media and Cut depend on the shared backend strategy. Webviews continue to consume opaque Range and PCM descriptors.                                           |
| Interface      | One small strategy projects decode input arguments, hardware scale filters, H.264 encoder arguments, bounded readback filters, and backend-specific failures. |
| Extension      | Current implementations are VideoToolbox and VAAPI. A new target adds one complete strategy and descriptor floor without adding platform branches to callers. |
| Testing        | Unit tests assert exact backend paths and poison CPU fallbacks. Runtime smoke is platform-specific and requires a real qualified device.                      |

## Backend contract

The backend strategy is immutable and host-owned. It exposes no workspace,
session, or mutable process state. Callers provide source codec and output
dimensions; the strategy returns FFmpeg argument fragments and filters.

```text
Media/Cut operation
  -> HardwareVideoPipeline
      -> decoder/device input arguments
      -> hardware scale/color filter
      -> hardware H.264 encoder arguments
      -> optional one-frame readback filter
      -> backend-specific capability diagnostic
  -> FfmpegProcessPort
```

The default strategy is selected from the current supported host:

- `darwin-arm64`: VideoToolbox decode surfaces, `scale_vt`, and
  `h264_videotoolbox` with software encoding disabled.
- `linux-x64`: VAAPI device, VAAPI decode surfaces, `scale_vaapi`, and
  `h264_vaapi`.
- other hosts: explicit unavailable strategy. The composition root already
  rejects unsupported release targets.

Tests that exercise cache identity, corruption classification, or command
planning inject a specific strategy. They do not depend on the machine running
Vitest. A real hardware smoke runs only where the matching device exists and is
separate from portable unit coverage.

## Linux runtime closure

The Linux FFmpeg bundle enables VAAPI and libdrm at build time. Its descriptor
requires the `vaapi` hardware accelerator, `h264_vaapi`, and `scale_vaapi` in
addition to the common audio and decoder capabilities, plus `tonemap_vaapi` for
HDR-to-SDR conversion. The macOS descriptor likewise requires the
`videotoolbox` accelerator. Build capability is necessary but not sufficient:
runtime device/driver rejection is classified as a hardware-backend unavailable
diagnostic.

VAAPI device selection uses FFmpeg's default render device through a named
device rather than hard-coding `/dev/dri/renderD128`. The decode, filter, and
encode stages retain VAAPI surfaces. HDR sources pass through
`tonemap_vaapi -> scale_vaapi -> h264_vaapi`; SDR sources skip tone mapping.
Thumbnail capture performs one bounded `hwdownload` after hardware decode and
scaling, matching the existing single-frame readback policy.

## Windows boundary

Windows is not currently present in `OPENNEKO_PLATFORM_TARGETS`. It therefore
does not receive a speculative backend or release artifact in this change.
When added, the backend must qualify one complete device-compatible closure.
`d3d11va` identifies decode acceleration but does not provide a universal H.264
hardware encoder; QSV, AMF, and NVENC have different device and distribution
requirements. The future Windows implementation belongs behind the same
strategy rather than in Media or Cut.

## Failure semantics

Missing FFmpeg build capabilities fail packaged runtime verification. Missing
devices, drivers, source decoder support, filter support, or encoder support
fail the media operation with a backend-specific capability diagnostic. No
failure is retried through `libx264`, software scale, software tone mapping, or
another hidden backend.
