# legacy-timeline-contract-retirement Specification

## Purpose
TBD - created by archiving change localize-media-diff-and-retire-timeline-contracts. Update Purpose after archive.
## Requirements
### Requirement: NKV/JVI and Timeline Diff are removed vertically

OpenNeko SHALL remove Neko Tools `.nkv` language/custom editor contributions, JVI language services, workspace NKV indexing and Timeline Diff analysis/presentation as one vertical slice. No removed command, handler, message, analyzer, viewer, locale, style, fixture or test SHALL remain available as a successful compatibility path.

#### Scenario: Neko Tools activates in a workspace containing NKV files

- **WHEN** the current extension activates
- **THEN** it SHALL NOT register an NKV language server, index NKV timelines or offer a Timeline Diff editor
- **AND** it SHALL leave the files byte-for-byte unchanged

#### Scenario: A retired Timeline Diff command or message is invoked

- **WHEN** a stale caller attempts to use a removed command, message or analyzer
- **THEN** the route SHALL be absent or fail with an explicit unsupported diagnostic
- **AND** it SHALL NOT fall back to media comparison, an active editor or a legacy parser

### Requirement: Owning project domains replace shared legacy Timeline projections

Cut consumers SHALL use the revisioned OTIO projection and stable IDs owned by Cut; Canvas consumers SHALL use explicit NKC-owned contracts; Agent context SHALL use an explicit read-only owning projection. They MUST NOT depend on shared writable `ProjectData`, `TimelineElement`, NKV codecs or old Timeline operation models.

#### Scenario: Cut projects a timeline for UI or Agent context

- **WHEN** a Cut document projection or selection context is requested
- **THEN** the owning OTIO session SHALL provide the revision, stable identities and read-only data required by the caller
- **AND** no shared NKV/Timeline model or implicit active document SHALL be consulted

#### Scenario: Desktop Canvas opens a project

- **WHEN** a caller expects an NKC project
- **THEN** it SHALL select an NKC-owned codec explicitly
- **AND** an NKV input SHALL fail closed without empty-project fallback or mutation

### Requirement: Old NKV user files remain untouched

The cleanup SHALL NOT migrate, convert, rewrite, move or delete existing NKV/NKC/OTIO projects or referenced media. Unsupported NKV inputs SHALL be rejected before any writer or migration path is created.

#### Scenario: An existing NKV file is encountered

- **WHEN** a removed product path or a current project command encounters the file
- **THEN** the current product SHALL leave its bytes unchanged
- **AND** it SHALL NOT create an OTIO/NKC replacement, backup rewrite or hidden compatibility copy

### Requirement: Interface-only Proto generation is removed

Timeline and Diff definitions that have no real serialization, cross-language producer/consumer or wire transport SHALL NOT remain in `@neko/proto`. Their generated Engine-prefixed TypeScript projections, generator and sync gates SHALL be deleted after all production consumers migrate.

#### Scenario: Timeline and Diff are the only remaining Proto definitions

- **WHEN** the consumer inventory confirms neither definition crosses a real wire or persistence boundary
- **THEN** both definitions and generated outputs SHALL be deleted
- **AND** the empty Proto package, custom interface generator and no-op CI gate SHALL also be removed

#### Scenario: A future change proposes a Proto contract

- **WHEN** a future feature needs generated wire types
- **THEN** its proposal SHALL identify producer, consumer, serialization, versioning, compatibility and generated-output ownership
- **AND** shared TypeScript shape reuse alone SHALL NOT justify restoring Proto

### Requirement: Legacy contract resurrection is CI-blocking

Repository quality checks SHALL reject reintroduction of Neko Tools JVI/Timeline Diff registration, shared NKV default codecs, generated legacy Timeline/Diff DTOs and `EngineDiff*` compatibility aliases.

#### Scenario: A change restores a retired surface

- **WHEN** source, manifest or package metadata reintroduces a prohibited legacy surface
- **THEN** the focused legacy-debt or architecture gate SHALL fail with the owning replacement guidance

### Requirement: Removal is proven at producer and consumer boundaries

The cleanup SHALL validate both the replacement result and the executed path across Desktop Tools, Cut, Agent and Canvas. Passing tests that rely on legacy fixtures, aliases, fallback readers or generated DTOs SHALL NOT count as acceptance.

#### Scenario: The cleanup reaches release validation

- **WHEN** all target implementations and migrations are complete
- **THEN** producer/consumer tests and package builds SHALL prove the Tools contract, media adapter, OTIO/NKC projections and explicit Agent context were used
- **AND** poisoned NKV/JVI/Timeline Diff/Engine DTO paths SHALL remain unobserved
