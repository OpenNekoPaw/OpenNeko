## ADDED Requirements

### Requirement: Character authoring uses a canonical live directory record set

OpenNeko SHALL keep editable Character facts in the authorized Workspace under one canonical `neko/characters/<characterProjectId>/...` record set owned by Chara. The record set SHALL contain the mutable CharacterProject metadata/draft and owner-qualified records for immutable CharacterVersions, lineage, Storylines and authoring evidence or tests. Character authoring SHALL operate on these records through the Chara repository and exact Workspace authority; a ZIP archive MUST NOT become a live editing authority, mounted runtime or second repository path.

#### Scenario: User authors a Character in Workspace

- **WHEN** Workspace Authoring opens one exact CharacterProject under a valid sender-bound directory grant
- **THEN** the Chara surface reads and writes its canonical relative records under that CharacterProject directory
- **AND** it does not require, mutate or execute an exported package

#### Scenario: Standalone and project-local Characters persist identically

- **WHEN** equivalent standalone and project-local CharacterProjects are stored under their respective authorized roots
- **THEN** both use the same Chara-owned relative record layout and codecs
- **AND** their catalog scope and Project membership remain external placement facts rather than alternate file formats

### Requirement: A portable Character package is an explicit ZIP transport container

OpenNeko SHALL support an explicitly imported or exported `.neko-character` ZIP container only for portable Character transfer. The archive SHALL contain one strict manifest plus a bounded snapshot of selected canonical Character records and selected embedded assets. The manifest SHALL identify the entry CharacterProject, enumerate included user-domain CharacterVersion and Storyline identities, declare every embedded asset and unresolved external dependency, and provide integrity metadata without introducing an internal schema/format version or alternate contract generation. Export MUST NOT imply remote publication, sharing permission or synchronization. ZIP location, package identity, open state and entries MUST NOT become durable Character facts, live repository keys, runtime references, watchers, mounts or synchronization sources.

#### Scenario: User exports a portable Character

- **WHEN** the user chooses an exact CharacterProject, export scope and asset inclusion policy and authorizes a destination
- **THEN** Chara produces one `.neko-character` archive whose manifest inventories the included records, exact domain identities, embedded files and external dependencies
- **AND** the source Workspace records remain the only live authoring authority
- **AND** later Workspace changes do not update or depend on that exported snapshot

#### Scenario: Character has multiple version branches

- **WHEN** the selected export scope contains multiple CharacterVersion branches
- **THEN** the archive preserves their exact immutable records and declared lineage relations
- **AND** it does not flatten branches, infer a latest version or rewrite Storyline references

### Requirement: Asset bytes are embedded only by explicit ownership-aware selection

Character definitions SHALL continue to reference representations and voices through opaque non-file resource refs. Portrait, image, Live2D, VRM, animation, audio, TTS and related bytes SHALL remain with their owning Asset or Host authority unless the user explicitly includes an authorized asset in the portable package. Embedded files SHALL use safe relative archive paths and manifest entries with media kind, byte length and integrity digest; raw absolute paths, credentials, provider secrets and silent copying of unrelated Project or global-library assets MUST be rejected.

#### Scenario: User exports with embedded Live2D assets

- **WHEN** the user explicitly selects an authorized Live2D asset tree for embedding
- **THEN** the package copies the bounded files below its declared asset directory and records their integrity and representation binding in the manifest
- **AND** no source absolute path or ambient sibling file is exposed

#### Scenario: User leaves an external VRM dependency unembedded

- **WHEN** a Character representation points to a valid external asset and the user does not include its bytes
- **THEN** the manifest records that opaque resource ref as an external dependency and the export preview reports that the package is not self-contained
- **AND** export does not silently copy the asset or claim the dependency is embedded

### Requirement: Runtime, continuity and model configuration are excluded from Character packages

A Character package SHALL contain Character authoring facts and explicitly included presentation assets only. It MUST NOT contain Agent Conversation or Task transcripts, Room records, Companion long-term memory or continuity state, narrative run state, provider/model selections, tool or Skill grants, approval history, credentials, cache, presentation snapshots or active runtime resources. Importing a package MUST NOT start a Conversation/Room, restore runtime ownership or grant Agent capabilities.

#### Scenario: User exports a Character used as a Companion

- **WHEN** the Character has existing conversations, long-term memories and per-conversation model selections
- **THEN** none of those records or settings appear in the archive inventory or bytes
- **AND** importing the package creates or installs only the explicitly selected Character authoring facts and assets

### Requirement: Character package import is validated before Workspace installation

Host/Node SHALL treat the archive as untrusted input and validate its containment, entry count, expanded size, duplicate paths, symlinks, compression behavior, manifest inventory, record codecs, exact identities and integrity digests before Chara writes any records. Chara SHALL present an import preview with placement, included branches/Storylines/assets, unresolved dependencies and exact identity conflicts. Import SHALL require an explicitly authorized standalone-library or project-local destination and MUST NOT execute in place, overwrite existing records, infer the active/recent Workspace or silently remap references. Completion, rejection or cancellation SHALL release the archive reader and temporary bytes without retaining a package binding, mount, watcher, recent-package authority or synchronization task.

#### Scenario: User imports a valid self-contained package

- **WHEN** validation succeeds and the user authorizes one exact destination and confirms the conflict-free preview
- **THEN** Chara installs the records and embedded assets through the canonical Workspace repository and returns the exact CharacterProject identity
- **AND** subsequent authoring uses normal Workspace records rather than reading from the ZIP
- **AND** moving, changing or deleting the source ZIP does not change the installed Character

#### Scenario: Package contains an unsafe or invalid entry

- **WHEN** the archive contains path traversal, symlink escape, undeclared bytes, duplicate entries, invalid Character records, digest mismatch or exceeds a configured resource bound
- **THEN** only that import is rejected with an explicit diagnostic before authoritative records are changed
- **AND** existing Characters, Workspaces and sibling assets remain available

#### Scenario: Imported identity conflicts with an existing Character

- **WHEN** the package contains a CharacterProject or immutable CharacterVersion identity already present with different facts
- **THEN** the preview reports the exact conflict and commit is disabled until an owner-defined explicit conflict workflow is chosen
- **AND** import does not overwrite, merge, rename or bind the package to the currently selected Character automatically
