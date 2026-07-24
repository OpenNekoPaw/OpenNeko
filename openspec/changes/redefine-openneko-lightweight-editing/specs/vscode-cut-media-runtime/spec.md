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
VS Code SHALL continue to use the selected current adapter for PCM preview and media export. MP4-backed and WAV-backed Audio Clips MAY use the existing PCM contract. Export MUST use typed Cut inputs, manage cancellation and staging, preserve an existing output on failure and return a terminal diagnostic. Each job SHALL explicitly provide `outputName`, `container`, `width`, `height`, `framesPerSecond`, `videoBitrate`, `includeAudio`, `audioBitrate` and `audioSampleRate`. The adapter MUST map MP4/MOV to the selected muxer while keeping the H.264/AAC encode path canonical. When `includeAudio=false`, no embedded or independent audio contribution may reach the Engine and output validation MUST NOT require an audio stream. When audio is enabled, the requested 44.1kHz or 48kHz sample rate MUST reach the Engine mixer and encoder.

#### Scenario: Export a supported timeline
- **WHEN** the current adapter accepts the OTIO-derived timeline and output settings
- **THEN** it produces and validates the requested media output without asking FFmpeg or another backend to interpret OTIO directly

#### Scenario: Export fails or is cancelled
- **WHEN** decode, mix, encode, mux, validation or cancellation fails
- **THEN** VS Code cleans staging, preserves an existing target and reports terminal failure

#### Scenario: Export without audio
- **WHEN** the user disables audio for an export job
- **THEN** the adapter removes every embedded Video and independent Audio contribution before Engine execution
- **AND** the completed output is accepted without an audio stream

#### Scenario: Export MOV with a selected audio sample rate
- **WHEN** the user selects MOV and 44.1kHz or 48kHz audio
- **THEN** the Save Dialog and staging target use the `.mov` extension
- **AND** the same H.264/AAC adapter selects the MOV muxer and passes the exact sample rate through to mixing and encoding

### Requirement: Timeline preview prepares and switches media at every active-input boundary
VS Code SHALL resolve each preview request from timeline time and SHALL return both the end of the interval for which the active Video and Audio input set remains valid and the current revision's last enabled Video/Audio Clip end. Before the interval boundary, the Webview SHALL request at most one next generation. The Host SHALL prepare that generation by resolving, probing, creating, seeking and speed-configuring paused document-scoped Video/PCM streams without advancing their media time. At the exact boundary, playback SHALL activate the prepared generation and retire the previous active generation. Initial playback SHALL use the same paused builder and SHALL start its transport clock only after the Webview clients are connected and Host activation is confirmed. One Webview preview session SHALL reuse one user-gesture-started `AudioContext` across generation clients; automatic boundary switching MUST NOT create a new suspended context. Available Audio PTS or presented Video frame PTS SHALL correct the transport clock; a wall clock MAY advance only an internal streamless Gap before a future enabled media input. During generation activation the old segment SHALL relinquish the playhead, and unavailable or pre-source PTS SHALL keep the transport clamped at the boundary rather than reset it to the previous segment start. Trailing Gap and presentation canvas extent MUST NOT extend playback after the last enabled Video/Audio Clip. Preview source offsets and stream speed SHALL honor the selected Clip's constant playback rate. A stale prepare, ready or activation MUST NOT replace a newer generation.

#### Scenario: Playback crosses two adjacent Video Clips
- **WHEN** playback reaches the end of the first Video Clip while a second Video Clip begins
- **THEN** the second Clip's paused generation has already been prepared during the bounded lead window without depending on selection
- **AND** the Webview activates it at the exact boundary before the Host retires the first generation

#### Scenario: Playback crosses an Audio input boundary
- **WHEN** an Audio Clip begins or ends before the current Video Clip ends
- **THEN** the preview interval ends there and the prepared generation contains the complete next unmuted input set

#### Scenario: Playback reaches trailing empty timeline space
- **WHEN** the final enabled Video or Audio Clip reaches its end and the OTIO Tracks contain only trailing Gap afterward
- **THEN** transport stops once at that Clip end and releases the active and prepared generations
- **AND** the playhead does not continue to the OTIO or presentation extent through a streamless tail

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

#### Scenario: Preparation is slower than the remaining segment
- **WHEN** the next generation is not ready when the current segment reaches its boundary
- **THEN** the transport SHALL remain clamped at that boundary until the matching prepared generation is ready
- **AND** it MUST NOT advance a blank clock, accept a stale generation or start another parallel session path

#### Scenario: Web Audio remains activated across a Clip boundary
- **WHEN** an Audio-backed generation is replaced automatically after the initial user playback gesture
- **THEN** the next generation connects through the same session-owned running `AudioContext`
- **AND** the old generation client is disposed without closing that shared context
- **AND** boundary activation does not wait for another user gesture

#### Scenario: Cancel prepared preview resources
- **WHEN** the user seeks, pauses or stops, the document revision/session changes, or the Webview is disposed
- **THEN** the Host SHALL cancel in-flight preparation and release both active and prepared Video/PCM sessions for that panel
- **AND** one panel SHALL own no more than one active and one prepared generation

### Requirement: Media bytes remain outside the Webview control bridge
Extension/Webview messages SHALL contain commands, projections, descriptors, stream identities, status, progress, cancellation and diagnostics. Source bytes, video frames and PCM MUST use authorized media data paths and MUST NOT be Base64-encoded into ordinary postMessage control payloads.

#### Scenario: Audit media transport
- **WHEN** VS Code previews or exports a timeline
- **THEN** runtime evidence shows the selected media data path and no bulk source/frame/PCM data in ordinary Extension/Webview messages

### Requirement: User diagnostics are structured, localized and projected once
User-visible Cut failures SHALL cross the Extension/Webview boundary as a stable structured diagnostic code rather than an English `Error.message`. The Extension SHALL record unknown internal causes through the shared ErrorHandler, while the Webview SHALL localize the diagnostic using the active shared i18n runtime and project recoverable failures through the existing Toast surface only. Export task snapshots and native status projection SHALL use the same diagnostic code contract.

#### Scenario: Reject an overlapping exact Clip placement in Chinese
- **WHEN** a Chinese-locale Webview submits an exact Clip placement that overlaps another Clip
- **THEN** the Domain returns the dedicated overlap diagnostic code
- **AND** the Webview displays one Chinese error Toast in the canonical bottom-right Toast container
- **AND** no raw English error or Preview-top alert is rendered

#### Scenario: Reject legacy or unknown diagnostics
- **WHEN** the Host sends the removed `message: string` error shape or an unknown diagnostic code
- **THEN** the Webview SHALL fail-visible as a contract mismatch
- **AND** it SHALL NOT display the raw message as a compatibility fallback

### Requirement: The current media implementation is replaceable
OTIO, Cut Core, document sessions and Webview messages SHALL depend only on host-neutral media ports. Replacing or deleting the current Neko Engine implementation MUST NOT require a second OTIO codec or a new project format.

#### Scenario: Audit public contracts
- **WHEN** shared Cut types and Webview contracts are inspected
- **THEN** they contain media operation semantics but no Engine-specific request, action, token, native handle or lifecycle type
