## ADDED Requirements

### Requirement: Cut uses OTIO as its only writable project format
Cut SHALL create, open, save, save-as, back up and revert timelines through one OTIO document path. It MUST NOT write Cut timelines as NKV or NKC, maintain a parallel serialized timeline store, or fall back to a legacy codec when OTIO processing fails.

#### Scenario: Copy and reopen a Cut project
- **WHEN** a user copies, moves or saves-as a `.otio` document within the same workspace
- **THEN** the copied file remains an independently writable Cut project and its workspace-relative media references keep the same meaning

#### Scenario: OTIO processing fails
- **WHEN** the OTIO document has an unknown schema version, invalid structure or unsupported OpenNeko field
- **THEN** Cut returns an object/path-level diagnostic and does not invoke NKV, NKC, an empty project or a compatibility reader

### Requirement: Host document sessions own durable Cut state
Each open or headless Cut document SHALL have a Host-owned session carrying explicit document URI, session identity and revision. The session SHALL own OTIO bytes, dirty state, commands, undo/redo, save, save-as, backup and revert. The Webview MUST NOT own a writable project snapshot or provide the authoritative bytes for save.

#### Scenario: Edit through the Webview
- **WHEN** a user submits a timeline command from the Webview with the current expected revision
- **THEN** the Host session applies the Cut Core command and returns a new revisioned `TimelineView` projection

#### Scenario: Save after Webview state is lost
- **WHEN** selection, playhead, zoom or the entire Webview presentation state is discarded
- **THEN** the Host session can still save or reopen the complete OTIO document without requesting a Webview project snapshot

#### Scenario: Reject a stale command
- **WHEN** a Webview, Canvas, Agent or TUI command carries a stale or mismatched document/session identity
- **THEN** the Host rejects it without selecting an active editor or mutating another document

### Requirement: Cut accepts one exact lightweight OTIO subset
Cut SHALL accept only the frozen Timeline, top-level Stack, Track, Clip, Gap, ExternalReference, RationalTime and TimeRange schema versions. It SHALL allow exactly one Video Track and zero or more Audio Tracks. Nested stacks, transitions, effects, time warps, markers, additional Video Tracks, multiple media references and unknown schema versions MUST be rejected before mutation.

#### Scenario: Open a supported timeline
- **WHEN** an OTIO contains one sequential Video Track, Audio Tracks, Clip/Gap items and one ExternalReference per Clip
- **THEN** Cut opens it without generating another writable timeline model

#### Scenario: Open an unsupported timeline
- **WHEN** an OTIO contains a nested Stack, second Video Track, Transition, Effect, TimeWarp, Marker or unknown schema version
- **THEN** Cut preserves the source bytes and reports every unsupported object/path without flattening or dropping it

### Requirement: OpenNeko metadata preserves current clip and link identity
Cut SHALL persist project profile/edit-rate/canvas metadata, one stable `clipId` per Clip, optional `linkedAudioClipId` / `linkedVideoClipId`, and supported audio gain/fade values under the `openneko` namespace. Link identity MAY drive the current separate/unseparate and no-duplicate-mix behavior; it MUST NOT contain paths, media bytes or runtime handles.

#### Scenario: Save linked audio
- **WHEN** a user separates audio through the current supported VS Code path and saves the project
- **THEN** the Video and Audio Clips retain stable identities, reciprocal link metadata and the same ExternalReference after reopen

#### Scenario: Encounter unknown OpenNeko metadata
- **WHEN** an OTIO contains an unknown key under the `openneko` namespace
- **THEN** Cut rejects the document for editing instead of ignoring the field and overwriting it

### Requirement: Media entry is workspace link-only
Cut SHALL add media through a normalized workspace-relative path and SHALL persist that path as the ExternalReference target. The path MAY refer to a file outside the Cut project directory but MUST remain inside the authorized workspace after normalization and symlink resolution. Cut MUST NOT copy, ingest, transcode or create a project-local media artifact as part of this operation.

#### Scenario: Link media outside the Cut directory
- **WHEN** `projects/cut/demo.otio` links `neko/assets/Footage/shot01.mp4`
- **THEN** the OTIO stores the unchanged normalized workspace-relative path and no media bytes are copied

#### Scenario: Move the OTIO document
- **WHEN** the `.otio` is moved or copied elsewhere in the same workspace
- **THEN** its ExternalReference still resolves from the workspace root to the same media file

#### Scenario: Reject a path escape
- **WHEN** a reference is absolute, a runtime URL, or escapes the workspace after normalization or symlink resolution
- **THEN** the Host rejects it before mutation or media access

### Requirement: Project root config only selects the document destination
The Host SHALL accept a workspace-relative `cut.defaultProjectRoot` only as the default directory for newly created `.otio` files. It MUST NOT persist the configured root, use it as the ExternalReference base or require project-local `media/`, `exports/` or derived directories.

#### Scenario: Create under a configured root
- **WHEN** `cut.defaultProjectRoot` is `projects/cut` and a user creates project `demo`
- **THEN** the Host creates `projects/cut/demo.otio` while media references remain workspace-relative

### Requirement: Cut exposes one basic operation surface
Cut SHALL expose one mode with a sequential Video Track, Audio Tracks, link/relink, split, trim, reorder, ripple delete, Gap, gain, mute, fade, preview and media export. It MUST NOT expose media copy/import, fixed/complex speed, multi-layer visual composition, title/subtitle authoring, transitions, nested timelines, masks, blend modes, keyframes, color/effect/plugin systems or arbitrary DSP graphs.

#### Scenario: Link and edit without a media runtime
- **WHEN** a Host provides workspace IO but no media adapter
- **THEN** Cut can create, open, link, edit and save structurally valid OTIO while probe, separation, preview and media export return an unavailable diagnostic

### Requirement: Current logical audio separation semantics are retained
The initial OTIO implementation SHALL preserve the current explicit separation behavior: before separation a Video Clip MAY contribute embedded audio; separation creates a linked Audio Clip that references the same media and prevents duplicate mixing. The operation MUST NOT create WAV, transcode, copy or modify media. Fully independent audio/video editing is not required by this change.

#### Scenario: Separate embedded audio
- **WHEN** the selected VS Code media adapter confirms usable embedded audio and the user invokes separation at the current document revision
- **THEN** one Cut Core command creates an Audio Clip with the same ExternalReference/ranges and reciprocal link identities

#### Scenario: Preview before separation
- **WHEN** a Video Clip contains embedded audio and has no linked Audio Clip
- **THEN** the current media adapter may preserve its existing embedded-audio playback behavior

#### Scenario: Preview after separation
- **WHEN** the Video Clip has a linked Audio Clip
- **THEN** the current media adapter avoids mixing the same source audio twice

### Requirement: TUI supports offline OTIO authoring only
The TUI SHALL expose the production Cut Core and document binding for OTIO create/open/save/save-as, structural import/export, workspace link/relink and editing commands. It MUST NOT claim media probe, logical-separation evidence, frame capture, PCM, preview or MP4 export when no media adapter is composed.

#### Scenario: Export an OTIO structure from TUI
- **WHEN** a TUI Agent edits a valid `.otio` and requests export to another `.otio` destination
- **THEN** the Host serializes the OTIO structure, preserves media bytes and returns the new document identity/revision

#### Scenario: Request media work from offline TUI
- **WHEN** a TUI request requires probe, frame capture, playback, logical-separation validation or MP4 render
- **THEN** the capability returns a media-runtime-unavailable diagnostic without simulating success

### Requirement: Canvas sends an explicit snapshot to an explicit Cut target
Canvas route authoring SHALL either create a new `.otio` project or append to an explicitly named `.otio` document URI with expected revision. The system MUST NOT infer an active/recent Cut, overwrite a target, replace a selection or establish continuous synchronization.

#### Scenario: Create a new Cut from Canvas
- **WHEN** the user confirms a supported workspace-relative media/gap route and chooses a new Cut target
- **THEN** the ordered route creates a new `.otio` document through Cut Core

#### Scenario: Append to a specified Cut
- **WHEN** the user confirms an existing document URI and matching expected revision
- **THEN** supported route items append at the end of that exact OTIO timeline

### Requirement: Legacy Cut projects fail visibly without migration
The new Cut editor SHALL NOT register NKC or NKV as writable Cut projects, perform automatic conversion or dual-write old and new formats. Existing files MUST remain byte-for-byte unchanged when rejected.

#### Scenario: Open a legacy Cut project
- **WHEN** a user attempts to open an NKC-embedded or NKV Cut timeline
- **THEN** Cut returns an unsupported legacy format diagnostic and does not alter, rename, migrate or delete the file

### Requirement: Cut Webview exposes one basic presentation
The Cut Webview SHALL retain one contextual Inspector and minimal playback/timeline controls. It MUST remove the basic/professional selector, profile-external entries, disabled placeholders and Minimap implementation/activation paths.

#### Scenario: Inspect supported items
- **WHEN** a Video Clip, Audio Clip, Gap or project summary is selected
- **THEN** the Inspector shows only source/link state, timing/trim, supported audio values or project summary fields owned by that context

#### Scenario: Navigate a long timeline
- **WHEN** the timeline is wider than the viewport
- **THEN** the user navigates through horizontal scrolling, zoom, fit-all and playhead following without a Minimap projection
