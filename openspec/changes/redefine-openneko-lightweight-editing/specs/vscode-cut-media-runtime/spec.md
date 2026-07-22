## ADDED Requirements

### Requirement: VS Code selects one bounded media adapter
Each VS Code Cut document session SHALL receive one selected media adapter implementing host-neutral probe, frame capture, video preview, PCM stream and export ports. The public Cut contract MUST NOT expose Engine request types, tokens, native handles or timeline DTOs. Runtime failure MUST NOT switch to NKV, Webview-owned state or another hidden implementation.

#### Scenario: Compose a Cut editor
- **WHEN** a VS Code Cut document session is created
- **THEN** the composition root provides one current adapter carrying explicit document/session identity

#### Scenario: Media execution fails
- **WHEN** initialization, probe, preview, PCM, frame capture or export fails
- **THEN** VS Code returns the selected adapter diagnostic without invoking a fallback project or media path

### Requirement: Structural OTIO editing does not require media execution
Opening, editing and saving structurally valid OTIO SHALL depend on Cut Core and Host workspace IO only. Media evidence SHALL be requested only by operations that require it, including separation, preview, frame capture and media export.

#### Scenario: Open with media unavailable
- **WHEN** a valid OTIO contains a missing or currently unsupported media reference
- **THEN** Cut preserves and edits the OTIO structure while media-dependent actions report a reference-specific diagnostic

### Requirement: Current linked separation reuses the source
Separating audio SHALL create a linked Audio Clip whose ExternalReference is the same workspace-relative source used by the Video Clip. It SHALL copy the current timeline/source range and persist reciprocal Clip link identities. It MUST NOT create media output, invoke audio transcode, copy bytes or mutate the source file.

#### Scenario: Separate supported embedded audio
- **WHEN** the selected adapter confirms usable embedded audio for the current source/document revision
- **THEN** one Cut Core command creates the linked Audio Clip and undo can remove that timeline change without media cleanup

#### Scenario: Reject failed separation
- **WHEN** probe fails, no usable audio exists, the source/document revision is stale or a linked Audio Clip already exists
- **THEN** Cut returns a diagnostic and neither OTIO nor media bytes change

### Requirement: Current embedded-audio playback remains supported
Before separation, the selected VS Code adapter MAY preserve the current behavior in which a Video Clip contributes embedded audio. After separation, the reciprocal link identity SHALL prevent the same embedded stream from being mixed once through the Video Clip and again through the linked Audio Clip.

#### Scenario: Preview before separation
- **WHEN** a Video Clip has embedded audio and no linked Audio Clip
- **THEN** preview may include the embedded audio through the current adapter

#### Scenario: Preview after separation
- **WHEN** the linked Audio Clip references the same source
- **THEN** preview and export include one logical copy of the source audio rather than a duplicate mix

### Requirement: PCM and media export retain the current bounded path
VS Code SHALL continue to use the selected current adapter for PCM preview and media export. MP4-backed and WAV-backed Audio Clips MAY use the existing PCM contract. Export MUST use typed Cut inputs, manage cancellation and staging, preserve an existing output on failure and return a terminal diagnostic.

#### Scenario: Export a supported timeline
- **WHEN** the current adapter accepts the OTIO-derived timeline and output settings
- **THEN** it produces and validates the requested media output without asking FFmpeg or another backend to interpret OTIO directly

#### Scenario: Export fails or is cancelled
- **WHEN** decode, mix, encode, mux, validation or cancellation fails
- **THEN** VS Code cleans staging, preserves an existing target and reports terminal failure

### Requirement: Media bytes remain outside the Webview control bridge
Extension/Webview messages SHALL contain commands, projections, descriptors, stream identities, status, progress, cancellation and diagnostics. Source bytes, video frames and PCM MUST use authorized media data paths and MUST NOT be Base64-encoded into ordinary postMessage control payloads.

#### Scenario: Audit media transport
- **WHEN** VS Code previews or exports a timeline
- **THEN** runtime evidence shows the selected media data path and no bulk source/frame/PCM data in ordinary Extension/Webview messages

### Requirement: The current media implementation is replaceable
OTIO, Cut Core, document sessions, Agent/TUI contracts and Webview messages SHALL depend only on host-neutral media ports. Replacing or deleting the current Neko Engine implementation MUST NOT require a second OTIO codec, a new project format or changes to offline Cut commands.

#### Scenario: Audit public contracts
- **WHEN** shared Cut types and capability schemas are inspected
- **THEN** they contain media operation semantics but no Engine-specific request, action, token, native handle or lifecycle type
