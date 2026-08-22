## ADDED Requirements

### Requirement: Portable packages contain one selected domain version

Character and World export SHALL produce a ZIP containing one selected immutable domain version and only the required bounded resources, manifest inventory and integrity information. Export MUST NOT include complete workspace history, the full global version graph, Agent transcript, tests, Project presentation state, Dialogue/Room/Run/Save state, installation metadata or internal storage metadata.

#### Scenario: User exports an older Character version

- **WHEN** the user selects one valid historical Character version and an authorized destination
- **THEN** Chara exports that exact version and its required resources
- **AND** it does not silently export the current version or unrelated history

### Requirement: ZIP import commits directly to the global catalog

Import SHALL target the corresponding Character or World global catalog and create either a new global object with its first version or, after explicit target confirmation, a new immutable version of an existing object. A valid imported version SHALL be immediately eligible for ordinary global use subject to the same owner validation as synchronized versions. Import MUST NOT create an installation, mutable Project target, adaptation, recovery record or Project membership.

#### Scenario: User imports a new World package

- **WHEN** a valid World ZIP has no confirmed existing target object
- **THEN** World atomically creates a new global object and first version
- **AND** that exact version becomes selectable for World Experience

#### Scenario: Package identifies an existing Character

- **WHEN** a valid Character ZIP identifies an existing object
- **THEN** the user must explicitly choose that exact object for a new version or save as a new object before commit
- **AND** import does not overwrite history or infer a target by display name

### Requirement: Portable ZIP boundaries fail closed and locally

Host SHALL authorize the sender, source or destination path and current Window request. The Node archive adapter SHALL validate containment, path traversal, link escape, duplicate paths, file count, expanded size, file types, manifest inventory and integrity before a domain commit. The selected archive path and temporary directory MUST NOT become durable identity, runtime authority, watcher or fallback source.

#### Scenario: Imported ZIP is unsafe

- **WHEN** validation detects an unsafe path, link, undeclared byte, digest mismatch, unsupported file or exceeded bound
- **THEN** only that import is rejected before global facts change
- **AND** existing global objects, Projects and runtimes remain available
