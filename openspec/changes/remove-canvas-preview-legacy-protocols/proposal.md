## Why

After the `openneko://resource` exact-resource gateway replaced the retired-host transport, two legacy
success protocols remain wired end to end although no producer reaches them: the Canvas
`preview:resolveVariant` / `preview:variantResolved` variant-resolution path (producer
`WebviewPreviewResolver` has zero consumers) and the Preview Engine playback path (`EngineVideoPlayer` /
`EngineAudioPlayer` consuming `preview:init` / `preview:playbackReady` / `preview:frameData` /
`preview:operationFailed`, which has no producer). Both are fallback/bypass paths that a canonical
failure could otherwise appear to satisfy, and both violate the single canonical authorized-projection
rule.

## What Changes

- Delete the Canvas legacy variant preview producer, the Desktop variant handler/channel/preload
  bridge/contract shape, and their fixtures/tests. Keep the canonical `preview:resolveResource` /
  `preview:resourceResolved` / `preview:releaseResource` authorized projection.
- Delete the Preview Engine playback branch in `VideoPlayer`/`AudioPlayer`, the legacy
  `preview:init`/`playbackReady`/`frameData`/`operationFailed` message types, and the now-dead
  `useHostReady` hook. Keep the source-URL canonical media consumer path and `useHostMessage`/`postMessage`
  used by Cbz/Pdf/Docx/Epub viewers.
- No fallback, compatibility shim, or try-next is retained. A canonical projection failure fails visibly
  at its own boundary and never routes through the removed variant/Engine path.

## Capabilities

### New Capabilities

- `canvas-preview-legacy-protocol-removal`: Rules and verification for deleting the retired Canvas variant
  preview protocol and Preview Engine playback protocol while keeping the canonical authorized resource
  projection and media consumer paths.

### Modified Capabilities

<!-- None. -->

## Impact

- `packages/canvas/webview` (preview resolver/runtime/types, PreviewRendererRegistry, canvas host).
- `packages/preview/webview` (VideoPlayer/AudioPlayer Engine branch, shared message types, useHostReady).
- `apps/neko-desktop` Main/preload/renderer/shared (variant handler, IPC channel, bridge contract,
  delegate, preload bridge).
- No user-data or persisted contract shape change; no new version, migration, or fallback path.
