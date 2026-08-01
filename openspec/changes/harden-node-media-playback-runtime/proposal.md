## Why

> 2026-08-01 transport update: the media behavior in this proposal remains relevant, but VS Code,
> Extension Host and loopback transport statements are historical. Current runtime ownership and
> byte projection use Desktop Main and the unified `openneko://resource` path.

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
- Pass the explicit development FFmpeg/ffprobe identity through the VS Code
  pre-launch task boundary; launch-configuration environment does not propagate
  to that separate process.
- Require HDR10/PQ and HLG sources to use either a changing-frame-qualified
  native MP4 profile or an all-hardware preview closure. On darwin the closure
  is VideoToolbox decode, `scale_vt`, and `h264_videotoolbox` with software
  fallback disabled; never infer native support from type/clock signals or
  silently use a CPU proxy.
- Keep optional poster capture failure separate from playback failure. Preview
  message callbacks must consume rejected promises and project an
  operation-scoped diagnostic instead of producing an Extension Host
  `unhandledRejection`.
- Order Preview capability checks as probe, playback-route selection, and only
  then optional poster capture. Routes that still require hardware video
  processing must not attempt HDR poster extraction before hardware decode is
  qualified; they use the prepared video's first frame instead.
- Project hardware playback and HDR poster limitations as structured,
  localized notices inside the retained player surface. Raw FFmpeg/runtime
  messages must not replace the whole Webview or become the primary user copy.
- Replace eager PCM scheduling with a bounded browser buffer, explicit
  prepare/start phases, a shared multi-track start barrier, and deterministic
  disposal of scheduled sources.
- Replace whole-stream waveform buffering with incremental peak aggregation
  over FFmpeg stdout, preserving completed peaks and bounded trailing samples
  when a damaged source fails after a valid prefix.
- Move Cut preview mixing into one Host-owned FFmpeg PCM stream so clip gain,
  fades, overlap summing, and EBU R128 normalization are applied to the exact
  audible segment before browser scheduling. The Webview remains the clock and
  bounded PCM consumer; it no longer pretends that a
  `DynamicsCompressorNode` is a loudness normalizer.
- Normalize Cut preview to the declared streaming target with FFmpeg
  `loudnorm` dynamic mode, and normalize export with a measured two-pass
  `loudnorm` graph. Peak limiting remains a safety stage, not the loudness
  algorithm.
- Classify bounded no-frame/early-EOF results as interval corruption while
  retaining successful probe, frame, PCM, waveform, and preview-prefix
  evidence.
- Validate the path only in the explicitly requested `~/Git/neko-test`
  workspace. Read-only real media stays under that root; generated VS Code
  fixtures stay in its marker-owned `.neko/.functional/media-runtime`
  subtree. User media is never copied into the repository or modified.

## Capabilities

### New Capabilities

- `bounded-synchronized-pcm-playback`: Defines bounded browser PCM buffering,
  Host-owned segment mixing, EBU R128 loudness policy, clock ownership, and
  disposal.
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
