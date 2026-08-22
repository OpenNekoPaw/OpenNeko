# canvas-preview-legacy-protocol-removal Specification

## Purpose
TBD - created by archiving change remove-canvas-preview-legacy-protocols. Update Purpose after archive.
## Requirements
### Requirement: Legacy Canvas variant preview protocol is removed

The system SHALL delete the `preview:resolveVariant` / `preview:variantResolved` protocol, its Desktop
handler, IPC channel, bridge contract, delegate branch, preload bridge, and canvas
`WebviewPreviewResolver`/`PreviewRuntime`. The canonical `preview:resolveResource` /
`preview:resourceResolved` / `preview:releaseResource` projection SHALL remain the only canvas preview
path.

#### Scenario: Canonical resource projection is hit

- **WHEN** a Canvas node resolves a preview
- **THEN** it posts `preview:resolveResource` and receives `preview:resourceResolved`
- **AND** the Desktop resolves it through `resolvePreviewResource` with an authorized `openneko://resource` descriptor

#### Scenario: Variant protocol is unreachable

- **WHEN** a test searches canvas host, Desktop delegate, bridge contract, IPC, and preload
- **THEN** no `preview:resolveVariant`, `preview:variantResolved`, or `preview-variant-resolve` channel remains
- **AND** a canonical projection failure returns its own diagnostic and never a variant URL

### Requirement: Legacy Preview Engine playback path is removed

The system SHALL delete `EngineVideoPlayer`, `EngineAudioPlayer`, the
`preview:init`/`preview:playbackReady`/`preview:frameData`/`preview:operationFailed` host messages, and
the `useHostReady` hook. Source-URL `SourceVideoPlayer`/`SourceAudioPlayer` and
`useHostMessage`/`postMessage` for document viewers SHALL remain.

#### Scenario: Canonical media consumer is source-URL driven

- **WHEN** a video/audio viewer renders
- **THEN** it uses the source-URL player path
- **AND** no `preview:init`/`preview:frameData` message is sent or consumed

#### Scenario: Engine path is unreachable

- **WHEN** a test searches the preview webview
- **THEN** no `EngineVideoPlayer`, `EngineAudioPlayer`, or legacy `preview:*` host message type remains
