## Why

The Node/FFmpeg media path has replaced Neko Engine, but real media validation
still exposes several correctness gaps: HDR proxy generation depends on an
unqualified host FFmpeg build, browser PCM can schedule an unbounded amount of
decoded audio, concurrent PCM tracks do not share an exact start barrier, and
Cut preview/export apply gain and clipping policy differently. Waveform
generation also buffers the complete decoded float32 stream in Node memory, so
memory grows by roughly 691 MB per hour before peaks are calculated. Partially
damaged files need interval diagnostics that distinguish a valid prefix from a
wholly unreadable source.

## What Changes

- Freeze one qualified FFmpeg runtime contract for development and packaged
  OpenNeko: exact executable identity, required codecs/filters, target identity,
  integrity metadata, and fail-visible activation diagnostics.
- Require HDR10/PQ and HLG sources to use either a changing-frame-qualified
  native MP4 profile or an all-hardware preview closure. On darwin the closure
  is VideoToolbox decode, `scale_vt`, and `h264_videotoolbox` with software
  fallback disabled; never infer native support from type/clock signals or
  silently use a CPU proxy.
- Keep optional poster capture failure separate from playback failure. Preview
  message callbacks must consume rejected promises and project an
  operation-scoped diagnostic instead of producing an Extension Host
  `unhandledRejection`.
- Replace eager PCM scheduling with a bounded browser buffer, explicit
  prepare/start phases, a shared multi-track start barrier, and deterministic
  disposal of scheduled sources.
- Replace whole-stream waveform buffering with incremental peak aggregation
  over FFmpeg stdout, preserving completed peaks and bounded trailing samples
  when a damaged source fails after a valid prefix.
- Route Cut PCM tracks through one preview mix bus, preserve the domain's
  `-60..+24 dB` gain range, apply live fades, and protect preview/export output
  with the same explicit peak-limiting policy.
- Classify bounded no-frame/early-EOF results as interval corruption while
  retaining successful probe, frame, PCM, waveform, and preview-prefix
  evidence.
- Validate the path with the read-only files under `~/Assets/Media`, the
  explicitly requested `~/Git/neko-test` fixture workspace, and a generated
  isolated VS Code workspace. User media is never copied into the repository
  or modified.

## Capabilities

### New Capabilities

- `bounded-synchronized-pcm-playback`: Defines bounded browser PCM buffering,
  shared multi-track start, mix-bus ownership, and disposal.
- `streaming-media-waveform`: Defines incremental waveform aggregation,
  cancellation, and partial-prefix behavior without retaining decoded PCM.
- `qualified-hdr-media-runtime`: Defines reproducible FFmpeg qualification,
  changing-frame native qualification, and hardware-only preview behavior.

### Modified Capabilities

- `node-media-runtime-retirement`: Tightens corruption scope, real-media
  validation, and release closure after Engine removal.
- `cut-node-ffmpeg-media-runtime`: Aligns Cut realtime preview and FFmpeg export
  gain, fade, mixing, and peak protection.

## Impact

- Affects `@neko/media` browser/node contracts and tests.
- Affects Cut Extension/Webview preview messages, audio context ownership,
  clock construction, and FFmpeg export graphs.
- Affects OpenNeko runtime staging/qualification and release tests.
- Adds only generated reports or repository fixtures; source media remains
  outside version control.
