## ADDED Requirements

### Requirement: Registered semantic source scopes

The system SHALL discover semantic sources only from an explicitly registered workspace scope or configured media-library root. Every scope MUST carry a stable workspace identity, logical root identity, portable locator, access policy, and `off`, `link-existing`, or `discover-candidates` analysis mode. Runtime absolute paths and active-workspace state MUST NOT be persisted as source identity.

#### Scenario: Workspace scope is registered

- **WHEN** a Host activates a workspace with a valid workspace identity
- **THEN** the coordinator registers its eligible roots with portable source identity and does not use the active editor as an identity fallback

#### Scenario: External media-library root is registered

- **WHEN** media-library settings resolve an enabled and accessible local directory
- **THEN** the directory becomes a semantic source scope without becoming an Asset library fact or workspace database

### Requirement: Event-assisted eventual reconciliation

The system SHALL treat filesystem events as low-latency hints and SHALL use bounded reconciliation as the completeness mechanism. Reconciliation MUST run on Host activation, root configuration change, explicit refresh, focus/session recovery, and bounded runtime scheduling.

#### Scenario: File is copied outside the application

- **WHEN** an eligible file appears in a registered root without passing through an OpenNeko import command
- **THEN** a watcher hint or the next reconciliation discovers the file and schedules the canonical semantic analysis path

#### Scenario: Filesystem event is missed

- **WHEN** a file changes but the Host receives no create or change event
- **THEN** reconciliation compares the source fingerprint, marks the source stale, and schedules reanalysis

#### Scenario: Media-library roots change

- **WHEN** the user adds, removes, remaps, enables, or disables a configured media-library root
- **THEN** the Host disposes obsolete watchers, registers the new root set, reconciles affected scopes, and emits a typed diagnostic for inaccessible or overlapping roots

### Requirement: Fingerprint-first incremental processing

The coordinator SHALL compare a bounded source fingerprint before reading or analyzing full content and SHALL deduplicate repeated watcher and reconciliation hints for the same source. Unchanged sources MUST NOT be reparsed or reanalyzed.

#### Scenario: Reconciliation sees an unchanged source

- **WHEN** portable identity and fingerprint match the fresh `semantic_sources` row
- **THEN** the coordinator records no new analysis work and retains the current projection revision

#### Scenario: Multiple hints identify one change

- **WHEN** create/change events and reconciliation report the same source revision
- **THEN** the coordinator performs at most one canonical analysis replacement for that fingerprint

### Requirement: Bounded cancellable root scanning

Root enumeration and reconciliation SHALL run in bounded slices, SHALL support cancellation and disposal, and MUST NOT perform an unbounded directory walk on the Extension Host event path.

#### Scenario: Large media-library root is reconciled

- **WHEN** a registered root contains more entries than one scan budget
- **THEN** the coordinator yields after the budget, retains a continuation, and resumes without blocking normal editor interaction

#### Scenario: Root is removed during scanning

- **WHEN** settings remove a root while its reconciliation is in progress
- **THEN** the coordinator cancels the old scan, releases its watcher and handles, and prevents later results from writing to the removed scope

### Requirement: Stable source identity and overlap handling

Source identity SHALL be derived from workspace partition, logical root identity, and normalized root-relative path. The Host SHALL apply deterministic precedence to overlapping roots and SHALL NOT count the same runtime file twice within one semantic partition.

#### Scenario: Workspace and media root overlap

- **WHEN** an eligible file is reachable through both the workspace root and a configured media-library root
- **THEN** the workspace source owns the observation, the duplicate traversal is suppressed, and an overlap diagnostic remains available

#### Scenario: File moves within a root

- **WHEN** a file is renamed or moved to a different relative path
- **THEN** reconciliation records deletion of the old source identity and creation of the new source identity without rewriting confirmed Entity or Asset facts

### Requirement: Safe eligible-source policy

The discovery layer SHALL enforce supported formats, strict root authorization, workspace trust, symlink/overlap policy, file size limits, and canonical exclusions before analysis. It MUST exclude dependency directories, build output, caches, databases, logs, secrets, and unsupported binary files.

#### Scenario: Cache or dependency file changes

- **WHEN** a matching extension changes under an excluded cache, dependency, database, or build directory
- **THEN** the file is not registered as a semantic source and no analysis task is created

#### Scenario: External root is not authorized

- **WHEN** a path is outside the workspace and is not resolved from enabled media-library settings
- **THEN** discovery rejects the path with a typed access diagnostic

### Requirement: Source freshness and stale-result rejection

Every analysis attempt SHALL bind to an input fingerprint. Before committing evidence or projections, the system MUST verify that the source still has that fingerprint; stale results MUST NOT replace newer data.

#### Scenario: File changes during analysis

- **WHEN** the source fingerprint changes after analysis starts and before commit
- **THEN** the result is discarded, the source remains stale, and the latest fingerprint is queued for analysis

#### Scenario: Source analysis fails

- **WHEN** reading, parsing, analyzer execution, or repository replacement fails
- **THEN** the source exposes a fail-visible diagnostic and stale freshness rather than an empty successful projection

### Requirement: Discovery does not mutate project facts

Discovering, changing, deleting, or losing access to a source SHALL only update local semantic cache and diagnostics. Discovery MUST NOT automatically register an Asset, confirm an Entity, create an Entity binding, or delete any project fact.

#### Scenario: New media file appears in a watched library

- **WHEN** reconciliation discovers a new file under a configured media-library root
- **THEN** the file can enter filename or semantic projections but `neko/assets/library.json` and Entity fact files remain unchanged

#### Scenario: Source disappears

- **WHEN** a source is deleted or its root becomes unavailable
- **THEN** its cache projection is removed or marked unavailable while confirmed Assets, Entities, bindings, and user candidate decisions remain intact

### Requirement: Cross-Host revision visibility

Each visible semantic replacement SHALL increment the affected workspace partition revision. Extension and TUI consumers SHALL refresh at their documented Host boundaries and MUST NOT use SQLite WAL file notifications as a business protocol.

#### Scenario: Extension commits a semantic replacement

- **WHEN** the Extension updates evidence for a workspace partition
- **THEN** a TUI refresh at its next command or session boundary observes the new partition revision and queries the updated projection
