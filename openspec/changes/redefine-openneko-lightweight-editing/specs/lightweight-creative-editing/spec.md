## ADDED Requirements

### Requirement: Cut uses OTIO as its only writable project format

Cut SHALL create, open, save, save-as, back up and revert timelines through one OTIO document path. It MUST NOT write Cut timelines as NKV or NKC, maintain a parallel serialized timeline store, or fall back to a legacy codec when OTIO processing fails.

#### Scenario: Copy and reopen a Cut project

- **WHEN** a user moves a `.otio` document together with its relative media tree
- **THEN** the moved file remains an independently writable Cut project and its document-relative media references keep the same meaning

#### Scenario: Save as to another directory

- **WHEN** a user performs Save As for a `.otio` document within the same workspace
- **THEN** the Host rewrites every relative ExternalReference against the new document directory while preserving the resolved media target

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

- **WHEN** a Webview or Canvas command carries a stale or mismatched document/session identity
- **THEN** the Host rejects it without selecting an active editor or mutating another document

### Requirement: Cut accepts one exact lightweight OTIO subset

Cut SHALL accept only the frozen Timeline, top-level Stack, Track, Clip, Gap, ExternalReference, RationalTime, TimeRange and bounded LinearTimeWarp schema versions. It SHALL allow exactly one Video Track, zero to three Audio Tracks and zero to one Subtitle Track, with no more than five Tracks in total. A Video or Audio Clip MAY contain at most one `LinearTimeWarp.1` with a finite positive `time_scalar` from 0.25 through 4. Nested stacks, transitions, other effects/time warps, multiple LinearTimeWarps, reverse/time-remap, markers, additional Video Tracks, a fourth Audio Track, a second Subtitle Track, multiple media references and unknown schema versions MUST be rejected before mutation.

#### Scenario: Open a supported timeline

- **WHEN** an OTIO contains one sequential Video Track, no more than three Audio Tracks, no more than one Subtitle Track, Clip/Gap items and one ExternalReference per Clip
- **THEN** Cut opens it without generating another writable timeline model

#### Scenario: Open an unsupported timeline

- **WHEN** an OTIO contains a nested Stack, second Video Track, fourth Audio Track, second Subtitle Track, Transition, unsupported Effect/TimeWarp, multiple LinearTimeWarps, Marker or unknown schema version
- **THEN** Cut preserves the source bytes and reports every unsupported object/path without flattening or dropping it

### Requirement: OpenNeko metadata preserves clip, link and mute state

Cut SHALL persist project profile/edit-rate/canvas metadata, one stable `clipId` per Clip, optional `linkedAudioClipId` / `linkedVideoClipId`, Video Clip mute, and supported Audio Clip gain/mute/fade values under the `openneko` namespace. Link identity SHALL express separate/unseparate provenance only and MUST NOT drive automatic muting or mix suppression. It MUST NOT contain paths, media bytes or runtime handles.

#### Scenario: Save linked audio

- **WHEN** a user separates audio through the current supported VS Code path and saves the project
- **THEN** the Video and Audio Clips retain stable identities, reciprocal link metadata and the same ExternalReference after reopen

#### Scenario: Encounter unknown OpenNeko metadata

- **WHEN** an OTIO contains an unknown key under the `openneko` namespace
- **THEN** Cut rejects the document for editing instead of ignoring the field and overwriting it

### Requirement: Media entry becomes a document-relative workspace link

Cut SHALL accept explicitly selected or dropped local media. Media already inside the authorized workspace SHALL remain linked in place. Media outside the workspace SHALL first be copied by the Host into a `media/` directory beside the current `.otio` document using staging and exclusive publication; name conflicts SHALL allocate a portable suffix and MUST NOT overwrite existing media. Both cases SHALL then persist a normalized POSIX-style path relative to the `.otio` document directory as the ExternalReference target. The path MAY use `..` to refer to a file outside the Cut project directory but MUST remain inside the authorized workspace after resolution and symlink checks. After resolution, the Host SHALL project one canonical workspace-relative source to existing media consumers without persisting that projection as a second path fact. The Webview MUST NOT read or copy media bytes, and import MUST NOT transcode or create derived media.

#### Scenario: Link media outside the Cut directory

- **WHEN** `projects/cut/demo.otio` links workspace media `neko/assets/Footage/shot01.mp4`
- **THEN** the OTIO stores the equivalent document-relative target `../../neko/assets/Footage/shot01.mp4` and no media bytes are copied

#### Scenario: Import media outside the workspace

- **WHEN** a user selects or drops a regular local media file outside the authorized workspace
- **THEN** the Host atomically copies it into `<otio-directory>/media/`
- **AND** an existing destination is never overwritten
- **AND** probe and `link-media` run against the copied workspace-relative file
- **AND** the OTIO reference remains document-relative

#### Scenario: Move only the OTIO document outside Cut

- **WHEN** the `.otio` file is moved or copied without its relative media layout and without Cut Save As rebasing
- **THEN** Cut resolves the stored path from the new document directory and reports missing media rather than treating workspace root as a hidden fallback

#### Scenario: Rebase references during Save As

- **WHEN** Cut saves the document from `projects/cut/demo.otio` to `edits/demo.otio`
- **THEN** it rewrites each ExternalReference so the resolved workspace media URI remains unchanged

#### Scenario: Reject a path escape

- **WHEN** a reference is absolute, a runtime URL, or escapes the workspace after normalization or symlink resolution
- **THEN** the Host rejects it before mutation or media access

#### Scenario: Project a media source to an existing consumer

- **WHEN** `../../neko/assets/Footage/shot01.mp4` resolves safely from `projects/cut/demo.otio`
- **THEN** the Host passes `neko/assets/Footage/shot01.mp4` to the existing media boundary without adding that workspace path to OTIO metadata

### Requirement: Project root config only selects the document destination

The Host SHALL accept a workspace-relative `cut.defaultProjectRoot` only as the default directory for newly created `.otio` files. It MUST NOT persist the configured root, use it as the ExternalReference base or require project-local `media/`, `exports/` or derived directories; media references SHALL resolve from the actual `.otio` directory.

#### Scenario: Create under a configured root

- **WHEN** `cut.defaultProjectRoot` is `projects/cut` and a user creates project `demo`
- **THEN** the Host creates `projects/cut/demo.otio` while media references remain relative to that document

### Requirement: Cut exposes one basic operation surface

Cut SHALL expose one mode with a Video Track, up to three Audio Tracks, one optional Subtitle Track, add/remove optional empty Tracks, target-specific audio/video/subtitle link, Explorer/file drop import, explicit sequence/position placement, split, trim/duration, bounded constant speed, ripple delete, Gap, gain, mute, fade, preview and media export. It MUST NOT expose general media-library ingest/catalog, automatic transcode, speed ramps/time-remap/reverse, multi-layer visual composition, rich subtitle authoring/styling/generation, transitions, nested timelines, masks, blend modes, keyframes, color/effect/plugin systems or arbitrary DSP graphs.

#### Scenario: Place a Clip at a timeline time

- **WHEN** a user drags a Clip to a compatible Track at a frame-quantized unoccupied time range
- **THEN** position mode replaces its source interval with an equal Gap, splits or extends target Gaps as required, merges adjacent Gaps and persists the exact frame placement through one revisioned command
- **AND** position mode rejects overlap, while sequence mode removes all Gaps from the modified source and target Tracks before inserting at the nearest sequence boundary
- **AND** when a sequence-mode drop overlaps another Clip, Cut inserts before or after the stable anchor according to the overlapped Clip half instead of reporting a placement error
- **AND** moving later on the same Track accounts for the source interval removed before resolving the final target
- **AND** an exact start-time edit outside pointer dragging keeps reject-on-overlap semantics

#### Scenario: Ripple-delete a Clip from a Track with Gaps

- **WHEN** a user ripple-deletes a Clip or a reciprocally linked Clip pair from Tracks that contain internal or trailing Gaps
- **THEN** Cut removes the selected Clip identities and all Gaps from each Track that actually lost a Clip
- **AND** Tracks that did not lose a Clip remain unchanged
- **AND** deleting the final Clip cannot leave an old trailing Gap extending the Timeline

#### Scenario: Import a dropped local file

- **WHEN** the Webview receives a VS Code Explorer or system file drop over a compatible Track
- **THEN** the Host validates the dropped URI through the same prepare, workspace containment, media probe and document-relative `link-media` path as the file picker
- **AND** a drop uses the pointer Track/time while the picker uses the playhead and selected compatible Track, or the fixed Video/first compatible Track when no selection exists
- **AND** multiple files preserve input order and each following item starts at the prior inserted item's actual end
- **AND** `link-media` without an explicit timeline start and overlap policy fails visibly instead of appending to the Track
- **AND** workspace-contained input is not copied
- **AND** workspace-external input is copied once by the Host before the same link path

#### Scenario: Change a constant Clip speed

- **WHEN** a user changes a Video or Audio Clip from 1x to a supported constant speed
- **THEN** Cut persists one OTIO `LinearTimeWarp.1`, projects timeline duration from the source range and applies the same source-time mapping to preview and export

#### Scenario: Track limits are enforced by the canonical command path

- **WHEN** a user attempts to add a second Video Track, fourth Audio Track, second Subtitle Track or any sixth Track
- **THEN** Cut SHALL reject the command before mutation with a visible track-limit diagnostic

#### Scenario: Clips move only between compatible Tracks

- **WHEN** a user drags a Clip within its Track or an Audio Clip between Audio Tracks
- **THEN** Cut SHALL persist the move through a revisioned `trackId`-targeted command
- **AND** a cross-kind drop SHALL be rejected without partial mutation

#### Scenario: Unsupported subtitle burn-in is visible

- **WHEN** the current VS Code media adapter exports a Timeline with a non-empty Subtitle Track
- **THEN** it SHALL return an explicit unsupported diagnostic before enqueueing export
- **AND** it MUST NOT silently omit subtitles while reporting success

#### Scenario: Link and edit without a media runtime

- **WHEN** a Host provides workspace IO but no media adapter
- **THEN** Cut can create, open, link, edit and save structurally valid OTIO while probe, separation, preview and media export return an unavailable diagnostic

### Requirement: Video and separated audio use explicit manual muting

The initial OTIO implementation SHALL allow a Video Clip to contribute embedded audio and SHALL expose a persisted Clip-level mute control. Separation SHALL create a linked Audio Clip that references the same media without changing the Video Clip mute state or automatically suppressing either mix input. The operation MUST NOT create WAV, transcode, copy or modify media. Fully independent audio/video editing is not required by this change.

#### Scenario: Separate embedded audio

- **WHEN** the selected VS Code media adapter confirms usable embedded audio and the user invokes separation at the current document revision
- **THEN** one Cut Core command creates an unmuted Audio Clip with the same ExternalReference/ranges and reciprocal link identities while preserving the Video Clip mute state

#### Scenario: Mute embedded video audio

- **WHEN** a user toggles mute on a Video Clip that contains embedded audio
- **THEN** preview and export omit that Clip's embedded audio while its video remains present

#### Scenario: Preview after separation

- **WHEN** a linked Video Clip and Audio Clip are both unmuted
- **THEN** preview and export mix both inputs and the UI makes both mute controls available for manual correction

#### Scenario: Unseparate after manually muting video

- **WHEN** a user removes the linked Audio Clip after manually muting the Video Clip
- **THEN** Cut removes the link but preserves the Video Clip mute state until the user changes it

#### Scenario: Edit the source range of linked Clips

- **WHEN** a user changes trim, duration, source reference or constant speed while reciprocal separation links remain present
- **THEN** Cut SHALL update the linked Video and Audio Clip timing/source fields atomically while preserving their independent audio settings
- **AND** the accepted revision SHALL be serializable before dirty state, undo history, backup or save can observe it

### Requirement: Canvas sends an explicit snapshot to an explicit Cut target

Canvas route authoring SHALL either create a new `.otio` project or append to an explicitly named `.otio` document URI with expected revision. The system MUST NOT infer an active/recent Cut, overwrite a target, replace a selection or establish continuous synchronization.

#### Scenario: Create a new Cut from Canvas

- **WHEN** the user confirms a supported workspace-contained media/gap route and chooses a new Cut target
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

The Cut Webview SHALL retain separately testable preview, transport, contextual Inspector, timeline overview, timeline toolbar, ruler/playhead, Track, Clip and context-menu presentation components. It SHALL expose embedded-audio state and Clip-level mute for Video Clips. These components MUST consume a revisioned read-only `TimelineView` and command callbacks rather than own a writable project snapshot. It MUST remove the basic/professional selector, profile-external entries, disabled placeholders and the legacy NKV Minimap implementation/activation paths.

The retained presentation SHALL be migrated from the pre-change component, hook, localization and style implementation rather than replaced by a newly authored minimal component tree under the same names. Migration SHALL first restore that implementation baseline, then replace its writable NKV project dependencies through one OTIO adapter/controller and a document-scoped Zustand Presentation Store, and finally remove only explicitly deferred professional feature branches. The Presentation Store MAY own the immutable `TimelineView` projection and recoverable selection, transport, viewport, layout and pointer-gesture drafts, but MUST NOT expose a writable project snapshot, OTIO serialization, project save, project undo/redo or optimistic durable timeline mutation. Existing interaction and accessibility tests for retained behavior SHALL be adapted rather than deleted and recreated as source-string assertions.

#### Scenario: Migrate the retained component implementation

- **WHEN** the OTIO presentation replaces the legacy project data source
- **THEN** Preview, transport, Timeline, PropertyPanel, Export and their retained hooks continue from the pre-change component implementation and test semantics
- **AND** one adapter/controller supplies a read-only `TimelineView` projection and typed intents through the document-scoped Presentation Store without restoring writable project authority
- **AND** a same-named minimal rewrite is rejected as an incomplete migration

#### Scenario: Inspect supported items

- **WHEN** a Video Clip, Audio Clip, Gap or project summary is selected
- **THEN** the Inspector shows the selected context's basic editable name/timing/duration/constant-speed/audio/link controls plus read-only source/project fields
- **AND** every edit invokes a revisioned typed command rather than mutating the projection
- **AND** all applicable properties remain visible in one vertically scrollable surface grouped by responsibility
- **AND** the Inspector does not introduce Tabs, a basic/professional selector or unsupported transform/blend/mask groups
- **AND** labels and controls use stable aligned columns, compact group spacing and uniform control heights throughout the supported Inspector width
- **AND** Slider, numeric value and unit stay grouped without overflow; a narrow Inspector may reflow that control group without hiding any field
- **AND** frame-derived seconds use concise millisecond presentation without floating-point noise, while committing a formatted value on the same project frame sends no mutation

#### Scenario: Navigate a long timeline

- **WHEN** the timeline is wider than the viewport
- **THEN** the user navigates through horizontal scrolling, zoom, fit-all, playhead following and a compact read-only Timeline Overview
- **AND** the Overview derives Track/item geometry only from the current `TimelineView`, projects the real timeline viewport and changes only Webview scroll state when clicked or dragged
- **AND** the Overview gives each Track and Clip a readable vertical range rather than compressing all structure into an indistinguishable strip
- **AND** shortening a trailing Clip without changing Track/item identity or order does not immediately shrink the current document-session timeline canvas and disturb cross-Track alignment
- **AND** deleting, moving or reordering items changes the structure signature and shrinks the canvas to the current projection instead of preserving historical empty extent
- **AND** a real projected Gap is visually distinct from ordinary Track background, while retained presentation extent is never presented as a Gap
- **AND** it does not send a Cut command, own a project snapshot or restore the legacy NKV Minimap media/store path

#### Scenario: Preserve the preview workspace

- **WHEN** the Preview/Timeline split changes or the editor viewport is resized
- **THEN** the preview stage fills the remaining Preview region while preserving the project profile aspect ratio inside a black canvas
- **AND** the complete project Canvas is contained within both the available width and height without cropping
- **AND** a source frame with a different aspect ratio is contained and centered inside that Canvas without stretching
- **AND** the canvas does not render a decorative border, Clip filename or source path over the media
- **AND** the transport remains below the stage rather than consuming or collapsing the media viewport

#### Scenario: Change the project Canvas preset

- **WHEN** the user selects TV `16:9`, cinema `2.39:1`, short-video `9:16` or square `1:1` in the Project Inspector
- **THEN** Cut submits one revisioned typed command that persists the preset's concrete profile name, width and height while preserving the project edit rate
- **AND** Preview immediately uses that project aspect ratio after the accepted revision
- **AND** background export uses the same persisted width and height without a second Webview-owned resolution state

#### Scenario: Seek from the basic timeline

- **WHEN** the user clicks the ruler or drags the playhead
- **THEN** the Webview updates only its temporary timeline position and starts preview through a revisioned timeline-time intent
- **AND** the Host resolves the active Video and Audio Clips for that time
- **AND** continuous playback prepares at most one paused next generation before an active-input boundary, activates it at the boundary and retires the previous generation
- **AND** playback stops at the final enabled Video/Audio Clip end instead of advancing through a trailing Gap or retained presentation extent
- **AND** seek, pause, stop or revision/session replacement cancels prepared media without blocking the pointer gesture

#### Scenario: Render derived Clip content

- **WHEN** a visible Video or Audio Clip is projected for the current revision
- **THEN** the Webview requests bounded thumbnail or waveform data from the Host and renders the Engine-derived result without adding it to OTIO
- **AND** stale-revision results are ignored and per-Clip failures are shown explicitly rather than replaced with fabricated waveform values

#### Scenario: Distinguish Clip participation from Video audio mute

- **WHEN** a user disables any Clip
- **THEN** OTIO `enabled=false` is persisted and the Clip no longer participates in preview or export
- **AND** disabling a Video Clip disables both its image and embedded audio, while muting that Video Clip disables only embedded audio
- **AND** the Timeline uses a distinct disabled visual state while a normal thumbnail remains fully visible and muted/disabled state is rendered with localized icons or tags

#### Scenario: Restore a trimmed source range from either edge

- **WHEN** a user shortens a Clip from its start or end and later drags the same edge outward
- **THEN** the selected Clip renders distinct visible start and end trim boundaries
- **THEN** the Webview derives independent start/end trim capacity from the ExternalReference available range
- **AND** the Core accepts the negative edge delta until that edge reaches the available range
- **AND** changing duration adjusts the end edge only instead of consuming or resetting the start trim

#### Scenario: Copy and control Clip and Track state

- **WHEN** a user copies, pastes, deletes, locks, unlocks, hides or shows a Clip or optional Track
- **THEN** copy state remains recoverable presentation state and paste submits a revisioned Host intent with newly allocated identities
- **AND** locked content rejects editing commands in the Core while unlock and visibility changes remain available
- **AND** the retained Timeline/context-menu primitives expose these actions with shared icons and localized labels without redefining theme colors

#### Scenario: Distinguish Track participation, audio mute and edit lock

- **WHEN** a user disables, mutes or locks a Track
- **THEN** disabling removes all contributions of that Track from preview/export, muting suppresses only audio contributions, and locking changes only whether structure and content may be edited
- **AND** the Track header identifies its kind with a Video, Audio or Subtitle icon and does not render redundant index/name tags
- **AND** localized icon buttons expose show/hide, lock/unlock, mute/unmute where applicable and optional-Track deletion
- **AND** Track headers do not repeat per-Track media-add buttons; media add and Track creation stay in Timeline controls while the Track menu can add media to its explicit target
- **AND** the Timeline controls for creating Audio and Subtitle Tracks render the matching shared media-kind icons with localized accessible names instead of visible `+A` or `+S` glyphs
- **AND** Subtitle Tracks do not expose mute, the required Video Track cannot be deleted, and deleting a non-empty optional Track is an explicit undoable destructive command

#### Scenario: Copy an optional Track

- **WHEN** a user copies and pastes an optional Audio or Subtitle Track
- **THEN** the Host duplicates its compatible content with new Track, Clip and reciprocal-link identities in one revisioned command
- **AND** copying the fixed Video Track as a second Video Track or pasting across documents fails visibly instead of bypassing track or workspace constraints

#### Scenario: Edit and snap a Clip

- **WHEN** the user seeks, drags a compatible Clip, adjusts a Clip trim edge, splits at the playhead or ripple-deletes the selection
- **THEN** temporary positions are quantized to the project frame and snap within a screen-space threshold to the playhead or same-Track item boundaries
- **AND** durable edits are submitted only as revisioned typed commands against the selected `clipId`/`trackId`

#### Scenario: Resize the basic editing workspace

- **WHEN** the user resizes the Preview/Timeline split or the right Inspector and then reconstructs the Webview
- **THEN** Cut restores the bounded layout from VS Code Webview state without writing layout values to OTIO
- **AND** the Inspector remains independently collapsible and resizable to the right of Preview while Timeline spans the full lower width
- **AND** Preview controls keeps the single localized Inspector visibility button at its right edge without overwriting the last expanded width
- **AND** a collapsed Inspector does not add a separate right-side rail or duplicate Timeline toolbar action

#### Scenario: Drag a Clip with recoverable pointer interaction

- **WHEN** the user pointer-drags a Clip toward a compatible Track timeline time
- **THEN** Cut shows the compatible Track, frame-quantized time placement and snapping feedback and may auto-scroll the timeline near its horizontal edges
- **AND** pointer cancellation, lost capture, window blur or an incompatible target clears temporary feedback without submitting a command
- **AND** successful release submits exactly one revisioned `place-clip` command with explicit source and overlap policies, without persisting pixel coordinates or Webview-owned timeline state
- **AND** sequence mode compacts modified Tracks and uses insert-on-overlap semantics so an occupied drop becomes a deterministic before/after reorder
- **AND** position mode uses preserve-gap plus reject-on-overlap semantics so exact placement never silently moves another Clip

#### Scenario: Enter sequence mode with trailing Gap

- **WHEN** the current projection contains one or more Track-ending Gaps and the user changes the icon-only placement button from position mode to sequence mode
- **THEN** Cut submits one revisioned `trim-trailing-gaps` command before treating the document as sequence mode
- **AND** the command removes every trailing Gap from every unlocked Track while preserving internal Gaps and all Clip timing relative to preceding items
- **AND** a locked affected Track or stale revision fails visibly and leaves position mode active
- **AND** undoing the trim restores both the trailing Gap projection and position-mode presentation
- **AND** the button uses its icon, active state and localized accessible label rather than a two-option text `SegmentedControl`
- **AND** the placement-mode button is adjacent to the Timeline Overview visibility button in one toolbar group without merging their state or actions

#### Scenario: Serialize rapid durable Clip edits

- **WHEN** the user completes another Clip move or trim before the Host has projected the previous edit revision
- **THEN** the Webview keeps the later durable intent in its document-scoped FIFO dispatcher
- **AND** sends it only after the preceding `TimelineView` revision is accepted, using that new revision as `expectedRevision`
- **AND** a mutation error or document/session replacement clears the pending sequence visibly instead of retrying stale commands

#### Scenario: Invoke the Timeline context menu

- **WHEN** the user opens the context menu over a Clip, Gap, Track or empty timeline area
- **THEN** Cut shows only context-valid basic actions and routes enabled actions through the same typed callbacks as the toolbar and Inspector
- **AND** Clip menus use Clip-specific visibility/lock/mute/delete labels and commands, while Track menus use Track-specific add-media/rename/visibility/lock/mute/delete labels and commands

### Requirement: Retained editing UI uses shared infrastructure

Cut SHALL retain the existing `PreviewPanel`, `PreviewControls`, `Timeline`/`TimelineTrack`, `PropertyPanel`, Export subviews and their interaction hooks as the canonical component boundaries. The Webview SHALL use the shared Workbench Shell, resize hooks, icons/tags, context menu, property primitives, keyboard dispatcher, i18n provider, theme tokens, ErrorBoundary, Toast and logger. The Extension SHALL use shared Logger, ErrorHandler, l10n and `StatusBarGroup`. Cut MUST NOT create a parallel package-local foundation for any of these concerns.

#### Scenario: Render and operate the retained workbench

- **WHEN** the Cut Webview opens, changes VS Code theme or locale, resizes a panel, drags media/Clips, opens a menu or reports a failure
- **THEN** the interaction is handled through the retained component/hook and shared infrastructure path
- **AND** all user-visible labels, ARIA text, tags, status text and recoverable errors are localized without hard-coded mixed-language fragments
- **AND** no operation writes a Webview-owned project snapshot or accesses workspace media directly

### Requirement: AI quick invocation is a structured context handoff

Cut SHALL expose a localized “Send to Agent” action for a current Clip or Track selection. The Extension Host SHALL resolve that selection against the explicit current document/session/revision and project a shared `AgentContextPayload` with stable OTIO locators and a read-only summary before invoking the unified Agent context command. This action MUST NOT call a model from the Webview, restore the legacy `executeAIAction` handler, infer an active/recent Cut target or report unimplemented automatic editing actions as success.

#### Scenario: Send a Cut selection to Agent

- **WHEN** the user invokes “Send to Agent” for a valid current selection
- **THEN** Agent receives one context payload carrying the exact `.otio` document, session/revision, Track/Clip identities, time range and media summary
- **AND** the payload becomes a visible Agent context attachment without mutating the Cut document

#### Scenario: Reject an unavailable or stale Agent handoff

- **WHEN** the selection is stale, explicit document identity is missing or the Agent command is unavailable
- **THEN** Cut reports a localized diagnostic and does not fall back to the active editor, legacy AI handler or an apparent success

### Requirement: Export remains a Host-owned background workflow

Cut SHALL retain an export configuration panel, progress display, cancellation and background-running interaction. The Extension Host SHALL own each export job's media validation, Engine execution, progress polling, staging output, cancellation and terminal state under explicit document/session/job identity. The Webview MUST NOT own the task lifetime, send a writable project snapshot for export or cancel a task merely because the panel, editor or Webview closes.

The Extension Host SHALL project background export state into a native VS Code status item. The projection MUST be derived from explicit task snapshots and its navigation action MUST open the owning `.otio` document rather than infer an active or recent editor. Playback time and media metadata SHALL remain Webview control-bar state and MUST NOT be duplicated as another writable status source.

The Extension Host MAY additionally project the currently visible Cut document's playback state, timeline time/FPS, Track/Clip counts and dirty/diagnostic summary into a separate native status item. That projection SHALL be keyed by explicit document/session identity. VS Code active-editor state MAY select which projection is visible but MUST NOT own, mutate or recover Cut session state. All status text, tooltips and command titles SHALL use Extension l10n.

The Host SHALL freeze the accepted in-memory `TimelineView` immediately when it accepts a matching `cut:export-start` identity, before opening the destination picker. Export SHALL NOT implicitly save the VS Code document and SHALL NOT re-read disk, request a writable Webview snapshot or infer an active/recent editor. Each job SHALL bind that frozen `documentUri/sessionId/revision` to immutable output name, container, width, height, frame rate, video bitrate, audio inclusion, audio bitrate and audio sample-rate settings. Job settings MAY explicitly override encoding settings, SHALL initialize dimensions/rate from the frozen OTIO profile at the Webview boundary, and MUST NOT be persisted as another project profile or hidden user preference. The export surface SHALL create only a local MP4 or MOV file through the native Save Dialog and SHALL NOT expose export-to-Canvas or DaVinci Resolve actions.

#### Scenario: Export a dirty accepted revision

- **WHEN** the Host accepts export for a dirty in-memory revision and the user edits the document while the destination picker or export job remains active
- **THEN** the running job exports exactly the revision accepted at the original start intent without saving or re-reading the document
- **AND** later edits affect only a subsequent export

#### Scenario: Override output settings for one job

- **WHEN** the user submits valid output width, height or frame rate values from the export panel
- **THEN** the Host binds those immutable values to that job and passes the same values to the selected media adapter
- **AND** the OTIO project profile and the defaults of the next newly opened export panel remain unchanged

#### Scenario: Resize and restore the contextual Inspector

- **WHEN** the user drags the Inspector's left resize handle, collapses it and later expands it
- **THEN** the Inspector width remains within the responsive 220–420px bounds and restores the last persisted expanded width
- **AND** property labels, values, units, Sliders and bottom actions remain readable, aligned and non-overlapping at both width bounds
- **AND** resize state remains recoverable Webview presentation state rather than an OTIO or Host command

#### Scenario: Continue export after dismissing the panel

- **WHEN** a user starts an export and closes the progress panel or the Webview is reconstructed
- **THEN** the same Host-owned job continues and reopening the same document can query its current progress or terminal result

#### Scenario: Cancel an exact export job

- **WHEN** the user cancels an active or restored export task
- **THEN** the Host cancels the explicit `jobId`, cleans that job's staging output and preserves any previously completed destination
- **AND** jobs owned by other documents remain unaffected

#### Scenario: Export fails visibly

- **WHEN** media validation, Engine execution, output validation or atomic replacement fails
- **THEN** the task enters an explicit error state with a diagnostic and Cut does not publish a partial or empty output as success

#### Scenario: Follow a background export from the VS Code status bar

- **WHEN** an export continues after its panel or editor becomes hidden and then reaches a running, completed or failed state
- **THEN** a native VS Code status item reflects that Host-owned state
- **AND** activating the item opens the exact `.otio` identified by the selected task snapshot, without consulting the active or most-recent Cut editor

#### Scenario: Show the active Cut document status

- **WHEN** focus changes between multiple Cut editors or away from Cut while each document has an independent session
- **THEN** the document status item shows only the explicitly selected session projection or hides when no Cut editor is selected
- **AND** background export items and other document sessions retain their own state
- **AND** clicking the document item addresses the exact document/session rather than a global active-state owner
