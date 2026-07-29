## Why

Real `cut-basic.otio` playback in the VS Code Webview exposes three related
runtime defects. Cut rebuilds MSE and PCM clients at every fixed ten-second
preview window, so the playhead and picture pause even when playback remains
inside one H.264 Clip. Paused seek clears the active video without preparing a
replacement frame. The realtime PCM graph also normalizes multichannel audio
before stereo downmix, allowing the later channel sum to exceed full scale and
produce audible clipping.

The current non-zero H.264 rule further converts every bounded seek into a
VideoToolbox transcode. H.264 random access is GOP-based; compatible input
should use a keyframe-aligned fragment with bounded decoder pre-roll instead of
periodic re-encoding.

## What Changes

- Make realtime PCM stereo before loudness normalization and add final peak
  safety after resampling.
- Preserve one shared `AudioContext`, schedule adjacent PCM generations against
  one clock, and retire the old generation with a short gain ramp instead of
  stopping scheduled sources at an arbitrary sample.
- Replace fixed ten-second video rebuilding with one native HTML video source
  for the actual Clip interval. Compatible H.264 MP4 and qualified VP8 WebM
  register the original source as an authorized HTTP Range resource without
  FFmpeg preparation.
- Use `<video src>` as the only Cut video transport. Chromium owns Range
  scheduling, buffering, demux, decoder backpressure, and seek. Cut does not
  fetch video bytes, append `SourceBuffer` data, or maintain media windows.
- For inputs that require remux or hardware conversion, finish the bounded Host
  preparation first and publish its result as an ordinary authorized Range
  file. The path remains hardware-only and does not fall back to CPU video
  conversion.
- Preconnect the next bounded video/PCM generation without mutating the active
  clients; promote it only after the standby decoder has produced its first
  frame and PCM has accumulated a bounded scheduling reserve.
- Persist hardware-derived thumbnail tiles under a source-fingerprint cache so
  viewport overscan and density changes do not repeatedly capture unchanged
  frames.
- Keep the authorized active video resource across pause. A seek inside the
  same Clip updates native `video.currentTime`; only a seek to another Clip
  prepares and atomically promotes the latest paused generation.
- Keep one monotonic Timeline clock through generation handoff so the playhead
  does not depend on a temporarily absent segment record.

## Capabilities

### New Capabilities

- `cut-gop-preview-playback`: GOP-aware preparation, browser preconnection,
  generation handoff, paused seek, and realtime PCM peak safety.

### Modified Capabilities

- `vscode-cut-node-media-runtime`: replaces the fixed-window/non-zero H.264
  transcode rule with keyframe-aligned bounded preparation.
- `bounded-synchronized-pcm-playback`: makes adjacent PCM generations
  sample-safe and guarantees post-downmix peak protection.

## Impact

- `packages/neko-cut-domain`: Cut preview descriptor and media-port
  facts.
- `packages/neko-cut/packages/extension`: keyframe indexing, preview selection,
  FFmpeg graph order, and panel generation ownership.
- `packages/neko-cut-webview`: standby media clients, paused seek, and
  continuous Timeline clock.
- `packages/neko-media/src/browser`: prepared PCM retirement and a native HTML
  video lifecycle client.
- `packages/neko-media/src/node`: authorized media files with browser-driven
  HTTP Range reads.
- `packages/neko-cut/packages/extension`: source-fingerprint thumbnail cache
  ownership in addition to session media preparation.
- No OTIO schema migration, CPU video fallback, persistent proxy workflow,
  WebM priority change, MSE fallback, or Neko Engine path is introduced.
