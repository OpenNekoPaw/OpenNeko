## Context

Two retired protocols remain wired after the `openneko://resource` gateway became canonical.

1. Canvas variant preview: `WebviewPreviewResolver` posts `preview:resolveVariant` and waits for
   `preview:variantResolved`. It has zero consumers, but the full chain still exists:
   `canvas-webview-host` dispatch → Desktop `desktop-canvas-webview-delegate` (supportsMessage + handler)
   → `canvas-bridge-contract` (`open-neko:canvas:preview-variant-resolve` channel + parsers) →
   `desktop-canvas-runtime.resolvePreviewVariant` (`canvas-inline:` descriptor + lease) → `app-host` →
   `ipc.ts` → preload bridge. `PreviewRuntime` is also dead (type-only prop, never instantiated).

2. Preview Engine playback: `VideoPlayer`/`AudioPlayer` render `EngineVideoPlayer`/`EngineAudioPlayer`
   when `sourceUrl` is absent, consuming `preview:init`/`playbackReady`/`frameData`/`operationFailed`.
   The canonical consumers always supply `sourceUrl`, so the Engine branch has no producer and only the
   `video/main.tsx`/`audio/main.tsx` entry files (themselves unconsumed) could reach it.

## Goals / Non-Goals

**Goals:**

- Atomically delete each old producer, consumer, registration, contract shape, and fixture/test.
- Preserve the canonical authorized resource projection (`preview:resolveResource` →
  `preview:resourceResolved` → `preview:releaseResource`) and the source-URL media consumer path.
- Prove with path tests that the old channels/messages/handlers are unreachable and that a canonical
  failure never returns success through the removed path.

**Non-Goals:**

- Changing the canonical projection shape, the `LightweightPreview`/viewer-kernel path, or resource lease
  semantics.
- Changing Cbz/Pdf/Docx/Epub viewers, `useHostMessage`/`postMessage`, or the shared media clients.

## Decisions

### 1. Delete, do not migrate

`WebviewPreviewResolver`, `PreviewRuntime`, `EngineVideoPlayer`, `EngineAudioPlayer`, and the variant
handler/channel have zero producers. They are deleted with their contract shapes, parsers, exports,
fixtures, and tests. Nothing is moved to another package.

### 2. Canonical projection stays single-path

`resolvePreviewResource`/`resolvePreviewVariant` were the only two canvas preview channels. The resource
path remains the single canonical producer/consumer chain; the variant path is removed so a canonical
failure cannot be masked by a second success path.

### 3. Media consumer path stays source-URL driven

`SourceVideoPlayer`/`SourceAudioPlayer` (and the shared `PcmAudioClient`) remain the canonical media
consumer. The Engine branch and its `preview:*` host messages are removed; `useHostReady` becomes dead
and is removed, while `useHostMessage`/`postMessage` remain for the document viewers.

## Replacement Plan

1. Create OpenSpec artifacts.
2. Delete Canvas preview resolver/runtime files; trim `types.ts`; drop the `runtime` prop from
   `PreviewRendererRegistry`; remove the variant case from `canvas-webview-host`.
3. Remove the Desktop variant handler/channel/contract/delegate/preload bridge and their tests.
4. Remove the Preview Engine branch and legacy message types/`useHostReady`.
5. Add path-absence tests; run canvas/preview/desktop verification and the listed gates.

Rollback reverts deletions; no compatibility re-export is retained.

## Risks / Trade-offs

- **`video/main.tsx` / `audio/main.tsx` entry files** → already unconsumed; they are deleted with the
  Engine branch rather than kept as a dead entry.
- **`useHostReady` removal** → only the Engine branch used it; document viewers keep `useHostMessage`.
