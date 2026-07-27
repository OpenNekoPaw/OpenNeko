# Change: restore Cut layered virtual thumbnails

## Why

The Cut refactor collapsed timeline thumbnails into one revision-scoped result
per Clip. A visible long Clip therefore receives at most eight frames sampled
across its complete source range, and the Webview stretches those images across
the Clip. Zooming changes the requested count but cannot request the newly
visible time interval or reuse already decoded time tiles. This produces blurred
or misleading thumbnails and unnecessary full-Clip regeneration.

The earlier Cut design used density layers and visible time tiles. That behavior
must be restored on the current Node/FFmpeg media-port path without reviving an
Engine client, Webview file access, or a parallel compatibility implementation.

## What Changes

- Replace Clip-wide thumbnail sampling with stable, density-layered time-tile
  requests.
- Plan only tiles intersecting the timeline viewport plus bounded overscan.
- Cache and reconcile thumbnail results by revision, Clip, density layer, and
  tile identity instead of only by Clip and representation kind.
- Render fixed-position tiles at their timeline offsets; do not flex-stretch a
  capped image strip across the complete Clip.
- Cancel superseded representation batches and discard stale revision/layer
  results.
- Keep waveform behavior on its existing bounded Clip representation path.
- Generate every requested tile through the current `FrameCapturePort` backed by
  Node/FFmpeg; no Engine or CPU video-transcode fallback is introduced.

## Scope

### In scope

- Cut domain representation request/result contracts.
- Cut Webview viewport planning, tile cache projection, and timeline rendering.
- Cut Extension validation, source-time resolution, cancellation, and frame
  capture orchestration.
- Focused tests and real VS Code Webview validation using `~/Git/neko-test`.

### Out of scope

- Generic React virtualization for Track/Clip DOM nodes.
- Persistent thumbnail storage or a repository-wide representation cache.
- Changing Preview playback, PCM synchronization, OTIO persistence, or export.
- Restoring any deleted `neko-engine` route, client, DTO, or fallback.

## Impact

- Affected packages: `@neko-cut/domain`, Cut Extension, and Cut Webview.
- The existing `cut:request-representations` message changes prelaunch schema;
  old Clip-wide thumbnail payloads are rejected rather than accepted through a
  compatibility branch.
- Thumbnail state remains derived, disposable, and absent from OTIO.
