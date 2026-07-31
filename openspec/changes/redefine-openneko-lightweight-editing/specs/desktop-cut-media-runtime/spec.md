# desktop-cut-media-runtime Specification

## ADDED Requirements

### Requirement: Desktop selects one bounded Cut media adapter

Each Desktop Cut document session SHALL receive one `NodeFfmpegCutMediaAdapter`
implementing the host-neutral probe, frame capture, video preview, PCM stream and
export ports. The public Cut contract MUST NOT expose Electron, Node, FFmpeg process,
local-path, native-handle or transport implementation details. Runtime failure MUST
NOT switch to an Engine adapter, Webview-owned project state or another hidden
implementation.

#### Scenario: Compose a Cut editor

- **WHEN** Desktop Main creates a Cut document session
- **THEN** it provides exactly one adapter carrying explicit document, view and session identity
- **AND** preload and renderer consume only the package-owned Cut contract

#### Scenario: Media execution fails

- **WHEN** initialization, probe, preview, PCM, frame capture or export fails
- **THEN** Desktop returns the selected adapter diagnostic
- **AND** it does not invoke a removed host, legacy Engine adapter or project fallback

### Requirement: Structural OTIO editing does not require media execution

Opening, editing and saving structurally valid OTIO SHALL depend on Cut Core and
Desktop-owned document storage only. Media evidence SHALL be requested only by
operations that require it, including separation, preview, frame capture and media
export.

#### Scenario: Open with media unavailable

- **WHEN** a valid OTIO contains a missing or currently unsupported media reference
- **THEN** Cut preserves and edits the OTIO structure
- **AND** media-dependent actions return a reference-specific diagnostic

### Requirement: Linked audio separation reuses the source

Separating audio SHALL create a linked Audio Clip whose `ExternalReference` is the
same document-relative source used by the Video Clip. It SHALL copy the current
timeline/source range, persist reciprocal Clip link identities, initialize the new
Audio Clip as unmuted with unity gain, and preserve the Video Clip mute state. It
MUST NOT create media output, transcode audio, copy bytes or mutate the source file.

#### Scenario: Separate supported embedded audio

- **WHEN** the Desktop-selected adapter confirms usable embedded audio for the current source and document revision
- **THEN** one Cut Core command creates the linked Audio Clip
- **AND** undo can remove that timeline change without media cleanup

#### Scenario: Reject failed separation

- **WHEN** probe fails, no usable audio exists, identity is stale or a linked Audio Clip already exists
- **THEN** Cut returns a diagnostic
- **AND** neither OTIO nor media bytes change

### Requirement: Embedded and separated audio are explicit mix inputs

The selected Desktop adapter SHALL allow a Video Clip with embedded audio to
contribute an audio input unless that Clip is muted. After separation, the Video Clip
and linked Audio Clip SHALL remain distinct mix inputs whose mute states are controlled
by the user; reciprocal link identity MUST NOT automatically mute or suppress either
input.

#### Scenario: Preview after separation

- **WHEN** the linked Video Clip and Audio Clip reference the same source and are both unmuted
- **THEN** preview and export include both audio inputs until the user explicitly mutes one

#### Scenario: Separate a muted Video Clip

- **WHEN** a muted Video Clip is separated
- **THEN** the Video Clip remains muted
- **AND** the new Audio Clip is audible by default

### Requirement: Desktop Main owns preview and export execution

Desktop Main SHALL resolve authorized media, own the Node/FFmpeg process and session
lifecycle, and expose only versioned Cut messages and opaque media descriptors through
preload. Renderer/Webview code SHALL NOT receive raw local paths or execute Node or
FFmpeg directly. Preview and export MUST preserve cancellation, staging, output
validation and fail-visible diagnostics.

#### Scenario: Preview a supported timeline

- **WHEN** the current adapter accepts the OTIO-derived active inputs
- **THEN** Desktop Main returns session-scoped native video and PCM descriptors
- **AND** the renderer advances the OpenNeko timeline clock without transferring media bytes through typed IPC

#### Scenario: Export a supported timeline

- **WHEN** the current adapter accepts the OTIO-derived timeline and immutable output settings
- **THEN** Desktop Main stages, validates and atomically publishes the requested media output
- **AND** FFmpeg does not become a second OTIO authority

#### Scenario: Export fails or is cancelled

- **WHEN** decode, mix, encode, mux, validation or cancellation fails
- **THEN** Desktop Main removes incomplete staging output, preserves an existing target and reports terminal failure
