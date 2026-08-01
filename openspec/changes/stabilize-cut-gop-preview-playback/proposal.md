## Why

Electron Desktop Cut still needs final real-fixture evidence for same-Clip GOP playback handoff, Clip
switching, paused seek and bounded PCM peak behavior through the current resource gateway.

## What Changes

- Compatible H.264/qualified VP8 use authorized native video resources with Chromium Range/decoder flow.
- Adjacent video/PCM generations preconnect and promote atomically without resetting the Timeline clock.
- Paused same-Clip seek reuses the active source; Clip switch prepares the latest generation only.
- PCM downmix/normalization/peak safety and shared AudioContext ownership remain bounded.
- Run current Electron Cut fixture and record exact handoff/seek/audio/no-fallback evidence.

## Capabilities

### New Capabilities

- `cut-gop-preview-playback`: GOP-aware handoff, paused seek, Timeline clock and PCM peak safety。

### Modified Capabilities

- `desktop-cut-node-media-runtime`: native authorized playback replaces fixed-window conversion。
- `bounded-synchronized-pcm-playback`: adjacent generations remain sample-safe。

## Impact

- Desktop Cut Domain/Node/renderer and `@neko/media` browser/Node runtime。
- No Engine, MSE, loopback transport, CPU fallback or proxy workflow。
