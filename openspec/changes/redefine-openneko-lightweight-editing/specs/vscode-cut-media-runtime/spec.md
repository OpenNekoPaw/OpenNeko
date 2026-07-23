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
Separating audio SHALL create a linked Audio Clip whose ExternalReference is the same document-relative source used by the Video Clip. It SHALL copy the current timeline/source range, persist reciprocal Clip link identities, initialize the new Audio Clip as unmuted with unity gain, and preserve the Video Clip mute state. It MUST NOT create media output, invoke audio transcode, copy bytes or mutate the source file.

#### Scenario: Separate supported embedded audio
- **WHEN** the selected adapter confirms usable embedded audio for the current source/document revision
- **THEN** one Cut Core command creates the linked Audio Clip and undo can remove that timeline change without media cleanup

#### Scenario: Reject failed separation
- **WHEN** probe fails, no usable audio exists, the source/document revision is stale or a linked Audio Clip already exists
- **THEN** Cut returns a diagnostic and neither OTIO nor media bytes change

### Requirement: Embedded and separated audio are explicit mix inputs
The selected VS Code adapter SHALL allow a Video Clip with embedded audio to contribute an audio input unless that Clip is muted. After separation, the Video Clip and linked Audio Clip SHALL remain distinct mix inputs whose mute states are controlled by the user; reciprocal link identity MUST NOT automatically mute or suppress either input.

#### Scenario: Preview before separation
- **WHEN** a Video Clip has embedded audio and no linked Audio Clip
- **THEN** preview and export include its embedded audio unless the Video Clip is muted

#### Scenario: Preview after separation
- **WHEN** the linked Video Clip and Audio Clip reference the same source and are both unmuted
- **THEN** preview and export include both audio inputs until the user explicitly mutes one

#### Scenario: Separate a muted Video Clip
- **WHEN** a muted Video Clip is separated
- **THEN** the Video Clip remains muted and the new Audio Clip is audible by default

### Requirement: PCM and media export retain the current bounded path
VS Code SHALL continue to use the selected current adapter for PCM preview and media export. MP4-backed and WAV-backed Audio Clips MAY use the existing PCM contract. Export MUST use typed Cut inputs, manage cancellation and staging, preserve an existing output on failure and return a terminal diagnostic.

#### Scenario: Export a supported timeline
- **WHEN** the current adapter accepts the OTIO-derived timeline and output settings
- **THEN** it produces and validates the requested media output without asking FFmpeg or another backend to interpret OTIO directly

#### Scenario: Export fails or is cancelled
- **WHEN** decode, mix, encode, mux, validation or cancellation fails
- **THEN** VS Code cleans staging, preserves an existing target and reports terminal failure

### Requirement: Timeline preview switches media at every active-input boundary
VS Code SHALL resolve each preview request from timeline time and SHALL return the end of the interval for which the active Video and Audio input set remains valid. Playback SHALL stop the current document-scoped streams and request the next interval when that boundary is reached. Preview source offsets and stream speed SHALL honor the selected Clip's constant playback rate. A stale preview result MUST NOT replace a newer generation.

#### Scenario: Playback crosses two adjacent Video Clips
- **WHEN** playback reaches the end of the first Video Clip while a second Video Clip begins
- **THEN** the Webview stops the first preview session and requests the second Clip at the exact boundary without depending on selection

#### Scenario: Playback crosses an Audio input boundary
- **WHEN** an Audio Clip begins or ends before the current Video Clip ends
- **THEN** the preview interval ends there and the next request reconstructs the complete unmuted input set

#### Scenario: Preview a constant-speed Clip
- **WHEN** timeline playback enters a Clip with a non-unity constant speed
- **THEN** the adapter starts video and PCM at `sourceStart + localTimelineOffset * playbackRate` and configures both streams with that rate

#### Scenario: Preview audio without active video
- **WHEN** playback enters an interval with one or more active unmuted Audio Clips but no active Video Clip
- **THEN** VS Code SHALL start the PCM inputs, keep the Preview stage black and advance to the next active-input boundary

#### Scenario: Preview a timeline gap
- **WHEN** playback enters an interval without active Video or Audio but a later media boundary exists
- **THEN** the Webview SHALL advance a streamless clock segment over the black Preview stage without reporting an error
- **AND** reaching the timeline end SHALL stop playback normally

### Requirement: Media bytes remain outside the Webview control bridge
Extension/Webview messages SHALL contain commands, projections, descriptors, stream identities, status, progress, cancellation and diagnostics. Source bytes, video frames and PCM MUST use authorized media data paths and MUST NOT be Base64-encoded into ordinary postMessage control payloads.

#### Scenario: Audit media transport
- **WHEN** VS Code previews or exports a timeline
- **THEN** runtime evidence shows the selected media data path and no bulk source/frame/PCM data in ordinary Extension/Webview messages

### Requirement: The current media implementation is replaceable
OTIO, Cut Core, document sessions and Webview messages SHALL depend only on host-neutral media ports. Replacing or deleting the current Neko Engine implementation MUST NOT require a second OTIO codec or a new project format.

#### Scenario: Audit public contracts
- **WHEN** shared Cut types and Webview contracts are inspected
- **THEN** they contain media operation semantics but no Engine-specific request, action, token, native handle or lifecycle type
