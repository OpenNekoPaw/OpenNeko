## ADDED Requirements

### Requirement: Cut uses OTIO as its only writable project format
Cut SHALL create, open, save, autosave, back up and revert timelines through one OTIO document path. It MUST NOT write Cut timelines as NKV or NKC, maintain a parallel serialized timeline store, or fall back to a legacy codec when OTIO processing fails.

#### Scenario: Create and reopen a Cut project
- **WHEN** a user creates a Cut project, edits it, saves it, closes the editor and opens it again
- **THEN** the only writable timeline artifact is `.otio` and the reopened edit state is derived from that OTIO document

#### Scenario: OTIO processing fails
- **WHEN** the OTIO document has an unknown schema version, invalid structure or unsupported OpenNeko field
- **THEN** Cut returns an object/path-level diagnostic and does not invoke NKV, NKC, an empty project or a compatibility reader

### Requirement: Cut accepts one exact lightweight OTIO subset
Cut SHALL accept only the frozen Timeline, top-level Stack, Track, Clip, Gap, ExternalReference, RationalTime and TimeRange schema versions. It SHALL allow exactly one Video Track and zero or more Audio Tracks. Nested stacks, transitions, effects, time warps, markers, additional Video Tracks, multiple active media references and unknown schema versions MUST be rejected before mutation.

#### Scenario: Open a supported timeline
- **WHEN** an OTIO contains one sequential Video Track, Audio Tracks, Clip/Gap items, one active ExternalReference per Clip and supported time ranges
- **THEN** Cut opens it as an editable lightweight timeline without generating another project model

#### Scenario: Open an unsupported timeline
- **WHEN** an OTIO contains a nested Stack, second Video Track, Transition, Effect, LinearTimeWarp, Marker or unknown schema version
- **THEN** Cut preserves the source bytes and reports every unsupported object/path without silently flattening or dropping it

### Requirement: Runtime projections are not project facts
Cut SHALL keep `OtioDocument` as the only mutable timeline authority and derive non-serialized `TimelineView`, `CutPreviewPlan` and `CutExportPlan` projections from an explicit document revision. Host adapters MUST execute the plans and MUST NOT independently interpret the complete OTIO document.

#### Scenario: Edit through the timeline UI
- **WHEN** a user performs split, trim, reorder, ripple delete, Gap, gain, mute or fade
- **THEN** a typed command mutates `OtioDocument`, undo/redo records that command and all UI/media projections refresh from the new revision

#### Scenario: Execute preview and export
- **WHEN** a supported revision is previewed or exported
- **THEN** Cut Core compiles the selected plan once and the host adapter executes it without rebuilding timeline semantics from another DTO

### Requirement: OpenNeko metadata stays minimal and strict
Cut SHALL persist only profile, project edit rate, project width/height, supported audio gain/fade values and provenance-only source Video Clip identity under the `openneko` namespace. Standard OTIO `enabled` SHALL express clip/track enable and audio mute. OpenNeko metadata MUST NOT duplicate children, track order, clip order, source range, media reference or audio stream selection. Provenance identity MUST NOT cause coupled edits.

#### Scenario: Preserve project and audio settings
- **WHEN** a user saves and reopens project timing, canvas size, audio gain, mute or fade
- **THEN** standard fields and allowed namespaced metadata reproduce the same semantics

#### Scenario: Encounter unknown OpenNeko metadata
- **WHEN** an OTIO contains an unknown key under the `openneko` namespace
- **THEN** Cut rejects the document for editing instead of ignoring the field and overwriting the file

### Requirement: Each project owns one rational edit rate
Every Cut project SHALL have one positive rational edit rate. Different supported CFR source rates MAY coexist, but importing a source MUST NOT implicitly change a non-empty project's edit rate. For each project or output sample timestamp, preview/export SHALL select the latest valid source frame whose mapped PTS is not later than the target time, except that a clip start before its first frame uses the first in-range frame. The system MUST NOT create intermediate frames.

#### Scenario: Import clips with different source rates
- **WHEN** 24 fps and 60 fps clips are imported into a 30 fps project
- **THEN** timeline placement remains in the 30 fps project grid while preview holds or skips source frames according to PTS without optical interpolation

#### Scenario: Inspect source and project timing
- **WHEN** the user selects a clip
- **THEN** the UI distinguishes source fps/source frame count from the project edit rate and timeline duration

#### Scenario: Present mixed source dimensions
- **WHEN** a supported source does not match the project width, height or aspect ratio
- **THEN** preview and export center an aspect-preserving contain image on an opaque black project canvas without editable crop or transform

### Requirement: Media references are portable and project-contained
The Host SHALL accept a workspace-relative `cut.defaultProjectRoot`, while `.otio` ExternalReference target URLs SHALL remain relative to the `.otio` location. Persistent project data MUST NOT contain the configured root, absolute user paths, file URLs, localhost URLs, Webview URIs, blob URLs, Engine tokens, Host capability tokens or temporary output paths.

#### Scenario: Create under a configured root
- **WHEN** `cut.defaultProjectRoot` is `projects/cut` and a user creates project `demo`
- **THEN** the Host creates the project under that workspace-relative root and OTIO media references remain relative to `project.otio`

#### Scenario: Reject a path escape
- **WHEN** a configured root or resolved media reference escapes the authorized workspace/project boundary after normalization and symlink resolution
- **THEN** the Host rejects it before reading or writing user data

### Requirement: Cut exposes one basic operation surface
Cut SHALL expose one mode with a sequential Video Track, Audio Tracks, import, split, trim, reorder, ripple delete, Gap, gain, mute, fade, preview and export. It MUST NOT expose fixed/complex speed, multi-layer visual composition, title/subtitle authoring, transitions, nested timelines, masks, blend modes, keyframes, color/effect/plugin systems, interpolation, enhancement or arbitrary DSP graphs.

#### Scenario: Audit the lightweight surface
- **WHEN** Webview components, commands, stores, messages, handlers, operation registries, i18n, styles and tests are inspected
- **THEN** every retained operation maps to the basic OTIO profile and no removed capability can be invoked or return compatibility success

### Requirement: Video clips are silent until audio is logically separated
Importing an MP4 SHALL create only a video-only Clip even when probe reports embedded audio. Embedded audio MUST NOT participate in preview or export until an explicit Cut command creates an independent Audio Clip that references the same MP4. The command MUST NOT create a WAV, transcode media or modify the source file.

#### Scenario: Import a video with AAC audio
- **WHEN** a conforming MP4 contains a supported AAC-LC stream
- **THEN** Cut creates one Video Clip and displays an explicit logical audio-separation action without creating an Audio Clip or media artifact

#### Scenario: Logically separate embedded audio
- **WHEN** the user invokes “Separate Audio” for a Video Clip whose source has exactly one supported audio stream
- **THEN** Cut creates an independently editable Audio Clip with the same ExternalReference and initial timeline/source range without starting an audio-transcode job

#### Scenario: Export without separated audio
- **WHEN** a timeline contains Video Clips with embedded AAC but no enabled Audio Clips
- **THEN** Cut exports a video-only MP4 and does not implicitly map the embedded streams

### Requirement: Canvas sends an explicit snapshot to an explicit Cut target
Canvas and Cut SHALL remain independent. Canvas route import SHALL either create a new `.otio` project or append to an explicitly named `.otio` document URI with expected revision. The system MUST NOT infer an active/recent Cut, overwrite a target, replace a selection or establish continuous synchronization in v1.

#### Scenario: Create a new Cut from Canvas
- **WHEN** the user confirms a route and chooses a new Cut target
- **THEN** the route's supported ordered media and gaps create a new `.otio` project

#### Scenario: Append to a specified Cut
- **WHEN** the user confirms an existing document URI and matching expected revision
- **THEN** supported route items append at the end of that exact OTIO timeline

#### Scenario: Reject unsupported draft semantics
- **WHEN** a Canvas draft contains transition, dialogue, voice-over, sound cue, text cue, subtitle, effect or another profile-external field
- **THEN** the import returns a diagnostic and does not fabricate, flatten or silently discard that semantic into a successful Cut mutation

### Requirement: Legacy Cut projects fail visibly without migration
The new Cut editor SHALL NOT register NKC or NKV as writable Cut projects, perform automatic conversion or dual-write old and new formats. Existing files MUST remain byte-for-byte unchanged when rejected.

#### Scenario: Open a legacy Cut project
- **WHEN** a user attempts to open an NKC-embedded or NKV Cut timeline
- **THEN** Cut returns an unsupported legacy format diagnostic and does not alter, rename, migrate or delete the file

### Requirement: Cut Webview exposes one contextual Inspector
The Cut Webview SHALL retain one contextual Inspector and MUST remove the basic/professional selector, disabled placeholder groups and profile-external property entries. The Inspector SHALL show only fields owned by the selected Video Clip, Audio Clip, Gap or project summary context.

#### Scenario: Inspect a Video Clip
- **WHEN** the user selects a Video Clip
- **THEN** the Inspector shows source/resolution/fps, timeline timing/trim and embedded-audio separation state without transform, speed, text, transition, color, effect or mask sections

#### Scenario: Inspect an Audio Clip
- **WHEN** the user selects an Audio Clip
- **THEN** the Inspector shows source/provenance, timing/trim and gain/mute/fade without implying synchronization with a Video Clip

#### Scenario: Inspect a Gap or no selection
- **WHEN** a Gap is selected or no timeline item is selected
- **THEN** the Inspector shows only Gap timing or a read-only project summary/empty state respectively

### Requirement: Cut control surfaces contain only v1 operations
The playback bar SHALL expose start, previous project frame, play/pause, next project frame, end, current/total timecode, mute/volume and fullscreen. The timeline toolbar SHALL expose media import, split, delete, undo/redo, zoom, fit-all and export. Profile-external, duplicate and ambiguous controls MUST be absent.

#### Scenario: Step one frame
- **WHEN** the user activates previous-frame or next-frame
- **THEN** the playhead moves by one project edit-rate frame and preview resolves the frame through the canonical source-PTS rule

#### Scenario: Audit visible controls
- **WHEN** the Cut toolbar source and rendered UI are inspected
- **THEN** retained controls map to v1 commands and text/subtitle/effect/professional/multi-view/layout controls cannot be invoked

### Requirement: Cut v1 has no Minimap
Cut SHALL navigate the timeline through horizontal scrolling, zoom, fit-all and playback playhead following. The v1 Webview MUST NOT contain a Minimap component, viewport projection, interaction state, message, setting, localization, style or hidden activation path.

#### Scenario: Navigate a long timeline
- **WHEN** the timeline is wider than the visible viewport
- **THEN** the user can scroll, zoom or fit all content and playback follows the playhead without a Minimap projection

#### Scenario: Audit Minimap removal
- **WHEN** source, bundles, state contracts and rendered UI are inspected
- **THEN** no Minimap implementation, disabled icon, hidden setting or fallback path remains

### Requirement: VS Code layers share one Cut semantics
The Cut Webview, Extension and Engine adapter SHALL use the same OTIO codec, validator, command model, TimelineView, preview/export plan compilers and Cut media profile. Extension/Engine code MUST NOT create a second writable timeline or reinterpret unsupported project semantics.

#### Scenario: Execute one edit through VS Code
- **WHEN** Webview applies commands to an OTIO fixture and requests preview/export
- **THEN** Extension and Engine consume the revisioned derived plans without adding host-specific project fields or rebuilding timeline semantics
