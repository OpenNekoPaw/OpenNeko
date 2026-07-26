## Why

The Node/FFmpeg media path has replaced Neko Engine, but real media validation
still exposes four correctness gaps: HDR proxy generation depends on an
unqualified host FFmpeg build, browser PCM can schedule an unbounded amount of
decoded audio, concurrent PCM tracks do not share an exact start barrier, and
Cut preview/export apply gain and clipping policy differently. Partially
damaged files also need interval diagnostics that distinguish a valid prefix
from a wholly unreadable source.

## What Changes

- Freeze one qualified FFmpeg runtime contract for development and packaged
  OpenNeko: exact executable identity, required codecs/filters, target identity,
  integrity metadata, and fail-visible activation diagnostics.
- Require HDR10/PQ and HLG sources to use an explicit 10-bit-to-SDR proxy with
  `zscale` and `tonemap`; never silently treat unqualified HDR as SDR or direct
  play.
- Replace eager PCM scheduling with a bounded browser buffer, explicit
  prepare/start phases, a shared multi-track start barrier, and deterministic
  disposal of scheduled sources.
- Route Cut PCM tracks through one preview mix bus, preserve the domain's
  `-60..+24 dB` gain range, apply live fades, and protect preview/export output
  with the same explicit peak-limiting policy.
- Classify bounded no-frame/early-EOF results as interval corruption while
  retaining successful probe, frame, PCM, waveform, and preview-prefix
  evidence.
- Validate the path with the read-only files under `~/Assets/Media` and a
  generated isolated VS Code workspace. User media is never copied into the
  repository or modified.

## Capabilities

### New Capabilities

- `bounded-synchronized-pcm-playback`: Defines bounded browser PCM buffering,
  shared multi-track start, mix-bus ownership, and disposal.
- `qualified-hdr-media-runtime`: Defines reproducible FFmpeg qualification and
  explicit HDR-to-SDR proxy behavior.

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
