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
- Replace fixed ten-second video rebuilding with GOP-aware H.264 preparation:
  cache a lightweight keyframe index, start compatible fragments at the
  preceding random-access point, and expose the requested media offset.
- Preconnect the next bounded video/PCM generation without mutating the active
  clients; promote it only after browser media and the first PCM packet are
  ready.
- Keep the active picture while paused seek prepares the latest requested
  generation, then atomically replace it. Older seek generations are cancelled.
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

- `packages/neko-cut/packages/domain`: Cut preview descriptor and media-port
  facts.
- `packages/neko-cut/packages/extension`: keyframe indexing, preview selection,
  FFmpeg graph order, and panel generation ownership.
- `packages/neko-cut/packages/webview`: standby media clients, paused seek, and
  continuous Timeline clock.
- `packages/neko-media/src/browser`: prepared PCM retirement and MSE client
  lifecycle primitives.
- No OTIO schema migration, CPU video fallback, proxy-file workflow, WebM
  priority change, or Neko Engine path is introduced.
