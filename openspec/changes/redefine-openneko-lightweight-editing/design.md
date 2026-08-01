## Context

Cut 的 canonical path 是 Electron Desktop Main document session → revisioned OTIO Domain → immutable
`TimelineView` → package-owned renderer。旧 NKV、Engine、Extension host 和 writable renderer store
不再属于目标设计。

## Five-layer analysis

- **Responsibility:** OTIO Domain owns validation and commands; Main document session owns durable
  document lifecycle; media runtime owns probe/preview/export; renderer owns presentation and gestures.
- **Dependency:** renderer depends on browser-safe contracts and typed preload ports. Domain and renderer
  never import Electron, Node or FFmpeg; Main never imports React.
- **Interface:** every edit/save/media/export operation carries document URI, session, revision and
  item/job identity. Stale or missing identity fails visibly.
- **Extension:** new v1 operations extend the typed command union and one projection path. Unsupported
  OTIO objects, media profiles and subtitles remain explicit diagnostics.
- **Testing:** Domain behavior, Main producer/consumer path, renderer interaction and isolated Electron
  scenarios jointly prove the canonical path and poisoned legacy routes.

## Decisions

### OTIO document authority

The `.otio` document is the only durable timeline. Main opens it into one document-scoped session,
validates the supported profile, applies revisioned commands and atomically saves through the shared
authorized project-file writer. Renderer reconstruction requests a fresh projection; it never supplies
a full timeline snapshot for persistence.

External references are normalized relative to the `.otio` directory and must resolve inside the
authorized workspace after symlink checks. Workspace-external inputs are staged and exclusively copied
beside the document before the same link command runs. Save As rebases relative targets explicitly.

### Basic editing surface

One fixed Video Track, up to three Audio Tracks and one Subtitle Track form the v1 limit. Timeline edits
use exact frame math and revisioned typed intents. Sequence mode compacts affected Tracks; placement
mode represents empty time with OTIO Gap and rejects overlap. Linked audio shares the source but retains
independent mute/gain/fade state.

The renderer retains package-owned Preview, controls, Inspector, Timeline, tracks, clips, overview,
context menus and hooks. A document-scoped presentation store holds only immutable projection plus
recoverable UI state. Shared i18n, theme, icons, menus, property primitives, errors and logging remain
the only infrastructure path.

### Desktop media and export

Main composes one bounded Node/FFmpeg media adapter and the OpenNeko resource gateway. Compatible media
uses authorized native video and bounded PCM; thumbnail/waveform/frame results are disposable projections.
No file bytes, absolute paths, runtime handles or cache identities cross ordinary IPC.

Export freezes the accepted in-memory document revision and immutable settings into an explicit
ExportJob. Main owns progress, cancellation, reconciliation, staging, validation and atomic replacement.
Closing or reconstructing the renderer does not cancel a background Job. Shell status selects the exact
document/job and never falls back to active or recent editors.

### Fail-visible unsupported paths

Unknown OTIO schema, unsupported Track/object/effect, stale revision, media escape, missing runtime,
non-empty subtitle burn-in, export outcome uncertainty and save conflict return typed diagnostics.
There is no NKV/Engine/retired-host/renderer-IO fallback and no second writable project store.

## Acceptance

Focused Domain/Node/renderer tests must prove edit-dirty-save-reopen, cross-Clip preview, exact time
placement, trim/speed/audio persistence, file drop, context menus, clipboard/multi-select, ExportJob
restore/cancel and shared infrastructure. Isolated Electron Desktop scenarios must prove the same path,
resource cleanup, multi-document isolation and shell status behavior.
