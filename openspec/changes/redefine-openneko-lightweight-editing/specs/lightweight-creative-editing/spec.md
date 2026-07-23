## ADDED Requirements

### Requirement: Cut uses OTIO as its only writable project format
Cut SHALL create, open, save, autosave, back up, and revert timelines through one OTIO document path. It MUST NOT write Cut timelines as NKV or NKC, maintain a parallel serialized timeline store, or fall back to a legacy codec when OTIO processing fails.

#### Scenario: Create and reopen a Cut project
- **WHEN** a user creates a Cut project, edits it, saves it, closes the editor, and opens it again
- **THEN** the only writable timeline artifact is `.otio` and the reopened edit state is derived from that OTIO document

#### Scenario: OTIO processing fails
- **WHEN** the OTIO document has an unknown schema version, invalid structure, or unsupported required capability
- **THEN** Cut returns an object/path-level diagnostic and does not invoke NKV, NKC, an empty project, or a compatibility reader

### Requirement: Cut accepts one bounded OTIO subset
Cut SHALL accept Timeline, one top-level Stack, exactly one Video Track, zero or more Audio Tracks, Clip, Gap, ExternalReference, RationalTime, TimeRange, and optionally a bounded positive LinearTimeWarp. Nested stacks, transitions, additional video tracks, unknown required effects, and profile-external objects MUST be rejected before mutation.

#### Scenario: Open a supported timeline
- **WHEN** an OTIO contains one sequential video track, audio tracks, clips, gaps, external references, and supported time ranges
- **THEN** Cut opens it as an editable lightweight timeline without generating another project model

#### Scenario: Open an unsupported timeline
- **WHEN** an OTIO contains a nested stack, a second video track, a transition, or an unknown required effect
- **THEN** Cut preserves the source bytes and reports each unsupported object and path without silently flattening or dropping it

### Requirement: Runtime projection is not a second project fact
Cut SHALL keep `OtioDocument` as the only mutable timeline authority and derive a non-serialized `TimelineView` for rendering, hit testing, and selection. Presentation state such as playhead, zoom, hover, panel layout, and decode cache MUST NOT become timeline facts.

#### Scenario: Edit through the timeline UI
- **WHEN** a user performs split, trim, reorder, ripple delete, gap, gain, mute, fade, or fixed positive speed
- **THEN** a typed command mutates the OTIO document, undo/redo records that command, and the UI refreshes from a derived projection

### Requirement: OpenNeko metadata stays minimal and namespaced
Cut SHALL limit application metadata to a profile marker and the supported source audio stream, gain, and fade values under an `openneko` namespace. Metadata MUST NOT duplicate track order, clip order, ranges, or media references.

#### Scenario: Preserve supported audio settings
- **WHEN** a user saves and reopens gain, fade, or source stream selection
- **THEN** the values round-trip through namespaced OTIO metadata while the editorial structure remains standard OTIO

#### Scenario: Encounter unknown required OpenNeko metadata
- **WHEN** an OTIO declares an unknown required `openneko` capability
- **THEN** Cut rejects the document for editing instead of ignoring the capability and overwriting the file

### Requirement: Media references are portable and host-neutral
ExternalReference target URLs SHALL be relative to the OTIO project location. OTIO MUST NOT persist absolute user paths, localhost URLs, Webview URIs, blob URLs, Engine tokens, host capability tokens, or temporary output paths.

#### Scenario: Save linked project media
- **WHEN** a conforming media file is stored under the project media directory
- **THEN** the OTIO ExternalReference stores a relative URI that both VS Code and Desktop can resolve through their host adapter

### Requirement: Legacy Cut projects fail visibly without migration
The new Cut editor SHALL NOT register NKC or NKV as writable Cut projects, perform automatic conversion, or dual-write old and new formats. Existing files MUST remain byte-for-byte unchanged when rejected.

#### Scenario: Open a legacy Cut project
- **WHEN** a user attempts to open an NKC-embedded or NKV Cut timeline
- **THEN** Cut returns an unsupported legacy format diagnostic and does not alter, rename, migrate, or delete the file

### Requirement: Cut exposes one lightweight operation surface
Cut SHALL expose one mode with a sequential video track, audio tracks, basic editorial operations, audio mixing, preview, and export. It MUST NOT expose multi-layer visual composition, title/subtitle authoring, transitions, nested timelines, masks, blend modes, keyframes, color/effect/plugin systems, reverse or arbitrary DSP graphs.

#### Scenario: Audit the lightweight UI and operation registry
- **WHEN** Webview components, commands, stores, messages, handlers, operation registries, i18n, styles, and tests are inspected
- **THEN** every retained operation maps to the lightweight OTIO profile and no removed capability can be invoked or return compatibility success

### Requirement: VS Code and Desktop share Cut Core and UI semantics
Both hosts SHALL use the same OTIO codec, validator, command model, TimelineView, React editor components, and Cut media profile. Host-specific code MUST be limited to explicit IO, preview, PCM, and export adapters.

#### Scenario: Apply the same edit sequence in both hosts
- **WHEN** VS Code and Desktop apply the same commands to the same OTIO fixture
- **THEN** they produce semantically equivalent OTIO and identical profile diagnostics without host-specific project fields
