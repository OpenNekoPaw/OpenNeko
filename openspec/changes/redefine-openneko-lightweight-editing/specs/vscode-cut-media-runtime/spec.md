## ADDED Requirements

### Requirement: VS Code selects one editor-scoped Engine adapter
Each VS Code Cut editor SHALL receive one editor-scoped adapter implementing shared probe, video preview, PCM stream and export job ports. Runtime failure MUST NOT switch to Node media, HTML media, NKV or another hidden implementation.

#### Scenario: Compose a Cut editor
- **WHEN** a VS Code Cut editor session is created
- **THEN** the composition root provides one Engine-backed adapter carrying explicit document/session identity

#### Scenario: Engine execution fails
- **WHEN** Engine initialization, probe, preview, PCM or export fails
- **THEN** VS Code returns the Engine diagnostic without invoking a fallback media path

### Requirement: Media probing provides complete profile evidence
The shared `MediaDescriptor` SHALL expose container, stream count/index, codec/profile, dimensions, rational rate, CFR evidence, pixel format, bit depth/chroma, field order, color/HDR metadata, duration, audio sample rate/channels and encryption status required by the Cut v1 validator. Missing required evidence MUST be treated as unknown.

#### Scenario: Probe a conforming MP4
- **WHEN** Engine probes a supported fixture
- **THEN** the descriptor contains enough field-level evidence for host-neutral validation without decoder-success inference

#### Scenario: Probe evidence is incomplete
- **WHEN** a required profile field is absent or ambiguous
- **THEN** Cut returns an actionable unknown-profile diagnostic before mutation or playback

### Requirement: Logical audio separation reuses the video source
Separating audio SHALL create an Audio Track Clip whose ExternalReference is the same MP4 used by the source Video Clip. It SHALL copy the initial timeline/source range and MAY store provenance-only source Video Clip identity. It MUST NOT create WAV or other media output, invoke audio transcode, or mutate the source file.

#### Scenario: Separate one embedded audio stream
- **WHEN** the user invokes separation for a current Video Clip revision whose MP4 has exactly one supported AAC-LC stream
- **THEN** one Cut Core command creates the Audio Clip and undo can remove that timeline change without any media-file cleanup

#### Scenario: Reject ambiguous or stale separation
- **WHEN** the source has zero or multiple audio streams, an unsupported codec, a stale source/document revision, or an existing provenance Audio Clip
- **THEN** Cut returns a diagnostic and neither OTIO nor media files change

### Requirement: Video and audio media roles are isolated
`CutPreviewPlan` and `CutExportPlan` SHALL assign every segment an explicit video or audio role. A Video Track Clip MUST NOT contribute embedded audio. An Audio Track Clip MAY reference MP4 and SHALL contribute only its supported audio stream.

#### Scenario: Preview an imported video before separation
- **WHEN** a Video Track contains an MP4 with embedded AAC and no Audio Clip exists
- **THEN** Engine produces video frames without starting or mixing an audio segment for that source

#### Scenario: Preview after logical separation
- **WHEN** an enabled Audio Clip references the same MP4 as a Video Clip
- **THEN** Engine decodes PCM for the Audio Clip while the Video Clip remains video-only

### Requirement: Logical Audio Clips remain independently editable
An Audio Clip created by separation SHALL remain playable from its own ExternalReference/source range and MUST NOT receive automatic move, trim, delete or undo mutations from its source Video Clip.

#### Scenario: Edit the source video after separation
- **WHEN** the user moves, trims or deletes the originating Video Clip
- **THEN** the Audio Clip remains unchanged and provenance metadata does not trigger synchronization

### Requirement: PCM preview uses the current bounded Engine stream
VS Code SHALL preview enabled Audio Track Clips through the existing Engine PCM stream as interleaved f32le, 48 kHz, stereo frames carrying PTS, duration, sample rate, channels and seek generation. MP4 and WAV Audio Clips SHALL share this runtime contract.

#### Scenario: Seek MP4-backed audio
- **WHEN** the user seeks while an Audio Clip backed by MP4 is active
- **THEN** Engine decodes the container audio at the requested source range and stale PCM generations are discarded

#### Scenario: Mix multiple Audio Tracks
- **WHEN** enabled MP4-backed or WAV-backed Audio Clips overlap
- **THEN** preview applies the shared gain/fade/sum/clamp semantics without enabling audio on Video Track Clips

### Requirement: VS Code enforces one Cut v1 Media Profile
Video Clips SHALL be limited to MP4 with one H.264 AVC 8-bit yuv420p SDR progressive CFR video stream up to 1080p, and their video role SHALL ignore all embedded audio streams. Logical separation SHALL be available only when the MP4 has exactly one AAC-LC 44.1/48 kHz mono/stereo stream. Independently imported Audio Clips SHALL be limited to WAV PCM 44.1/48 kHz mono/stereo. General format-conversion import is out of scope.

#### Scenario: Import conforming media
- **WHEN** probe evidence satisfies every required field for the selected role
- **THEN** VS Code accepts the source and records a project-relative ExternalReference

#### Scenario: Reject multiple embedded audio streams
- **WHEN** an MP4 contains more than one audio stream
- **THEN** Video Clip import remains video-only and logical separation reports unsupported-multiple-audio-streams instead of choosing the first stream

#### Scenario: Reject profile-external media
- **WHEN** media is VFR, HDR, 10-bit, non-4:2:0, interlaced, has extra video streams, surround/object audio, DRM, corrupt timestamps or unknown duration
- **THEN** Cut returns field-level diagnostics even if Engine can decode the source

### Requirement: Export executes one typed role-aware plan
VS Code export SHALL produce MP4/H.264/AAC-LC/SDR/yuv420p up to 1080p from a frozen `CutExportPlan`. Output fps SHALL default to project edit rate and MAY use another supported rate with the frozen PTS/drop/repeat rule. Callers MUST NOT supply shell commands, arbitrary FFmpeg arguments or filter graphs.

#### Scenario: Export before logical separation
- **WHEN** Video Clips contain embedded AAC but no enabled Audio Track Clips exist
- **THEN** output validation requires a video-only MP4 and proves the embedded streams were not implicitly mapped

#### Scenario: Export after logical separation
- **WHEN** an enabled Audio Clip references an MP4 embedded stream
- **THEN** Engine decodes that stream through the audio role, mixes it and validates audio presence before atomic output commit

#### Scenario: Export fails or is cancelled
- **WHEN** decode, mix, encode, mux, validation or cancellation reaches terminal failure
- **THEN** Extension cleans staging, preserves an existing target and returns a terminal diagnostic without partial success

### Requirement: Media bytes remain outside the Webview control bridge
Extension/Webview messages SHALL contain only descriptors, plans, commands, stream identities, status, progress, cancellation and diagnostics. Source bytes and PCM MUST use Engine-authorized data channels and MUST NOT be Base64-encoded into ordinary postMessage payloads.

#### Scenario: Audit media transport
- **WHEN** VS Code previews a long video and MP4-backed Audio Clips
- **THEN** runtime evidence shows Engine video/PCM traffic and no bulk file or PCM data in Extension/Webview control messages
