# Change: replace Cut Engine media path with Node/FFmpeg

## Why

`neko-cut` currently routes probe, preview, PCM audio, frame capture, waveform, and
export through `packages/neko-engine`. That path couples the lightweight Cut
editor to a Rust runtime even though Desktop Main can own file IO
and FFmpeg orchestration directly, while the Webview can render supported media
through native `<video src>` and Web Audio.

The replacement must remain explicit and fail-visible. Unsupported codecs are
normalized by a declared remux/transcode preparation step; the runtime must not
silently fall back to the old Engine adapter.

## What Changes

- Freeze host-neutral Cut media ports for probe, frame capture, waveform,
  native Range video preparation, HTTP PCM streaming, and export.
- Add a Node/FFmpeg Desktop Main adapter and a loopback media server.
- Use native `<video src>` for video and Web Audio PCM for all audible audio.
- Make OpenNeko's preview clock the synchronization authority.
- Switch the Cut composition root once to the Node/FFmpeg adapter.
- Poison and then remove the legacy Cut Engine adapter, connection, routes,
  client calls, and Cut-owned DTO references.
- Audit all remaining `packages/neko-engine` consumers and record their owning
  responsibilities.
- Delete `packages/neko-engine` only if the audit proves that no non-Cut runtime,
  build, packaging, test, or documentation responsibility remains.

## Playback Policy

- Direct preview codec allowlist: H.264 and VP8.
- H.264 in an incompatible container is remuxed when possible.
- VP8 is enabled only after the target Electron renderer passes the real
  native WebM video fixture; until then preparation explicitly transcodes it to
  the H.264 preview profile.
- Other video codecs are explicitly transcoded to the H.264 preview profile.
- All audible tracks, including audio embedded in video assets, are decoded to
  PCM and synchronized by OpenNeko. The `<video>` element remains muted.
- 10-bit/HDR sources remain valid inputs. The initial H.264 preview profile uses
  explicit SDR tone mapping and does not claim native HDR preview fidelity.

## Scope

### In scope

- Cut domain contracts, Desktop Main adapter/composition, and renderer Webview
  playback.
- FFmpeg/ffprobe process lifecycle, cancellation, diagnostics, local loopback
  range/segment delivery, and temporary artifact cleanup.
- Existing Cut probe, frame capture, waveform, PCM, preview, and export features.
- Real isolated Electron Desktop validation.
- Legacy Cut Engine path removal and repository-wide Engine consumer audit.

### Out of scope

- A new general-purpose cloud media service.
- Native HDR mastering or color-critical HDR monitoring in the initial preview
  profile.
- Multi-video-track compositing beyond the already accepted lightweight Cut
  scope.
- Deleting the Engine while any independently owned responsibility remains.

## Impact

- Affected packages: `packages/neko-cut-domain`, `packages/neko-cut-node`,
  `packages/neko-cut-webview`, and `apps/neko-desktop`.
- Affected architecture decision:
  `docs/architecture/adr-cut-html-video-node-ffmpeg-media-runtime-boundary.md`.
- This change supersedes the Cut-specific current-state Engine implementation
  described by `redefine-openneko-lightweight-editing`; it preserves that
  change's media-port boundary and single-adapter invariant.

The Desktop-only composition from `flatten-desktop-only-monorepo` supersedes all
earlier Extension Host composition and acceptance wording in this change. Historical
VS Code results remain only in `validation.md`; they are not current implementation
or release requirements.
