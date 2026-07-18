## ADDED Requirements

### Requirement: Registered semantic source scopes

The system SHALL discover semantic sources only from an explicitly registered workspace scope or configured media-library root. Every scope MUST carry a stable workspace identity, logical root identity, portable locator, access policy, and `off`, `link-existing`, or `discover-candidates` analysis mode. Runtime absolute paths and active-workspace state MUST NOT be persisted as source identity.

#### Scenario: Workspace scope is registered

- **WHEN** a Host activates a workspace with a valid workspace identity
- **THEN** the coordinator registers its eligible roots with portable source identity and does not use the active editor as an identity fallback

#### Scenario: External media-library root is registered

- **WHEN** media-library settings resolve an enabled and accessible local directory
- **THEN** the directory becomes a semantic source scope without becoming an Asset library fact or workspace database

### Requirement: Creative-document eligibility policy

The discovery layer SHALL limit first-phase text entity analysis to Fountain, NKS/Story, Markdown, TXT, PDF, EPUB, DOCX, and files accepted by a registered creative-schema adapter. A JSON or YAML extension alone MUST NOT make a file eligible. Media files, ordinary configuration files, unsupported document formats, and embedded document resources MUST NOT enter the text analyzer.

#### Scenario: Supported creative document is discovered

- **WHEN** an eligible Fountain, Markdown, TXT, PDF, EPUB, DOCX, NKS, or Story source appears in a registered scope
- **THEN** discovery records its declared source profile and schedules the canonical text analysis path according to the scope analysis mode

#### Scenario: Registered creative schema is discovered

- **WHEN** a JSON or YAML source is recognized by an owning-domain adapter with a supported schema ID and version
- **THEN** discovery registers it with that schema profile rather than as generic scalar text

#### Scenario: Ordinary JSON configuration changes

- **WHEN** a JSON or YAML file has no registered creative schema or has an unknown schema version
- **THEN** discovery excludes it or exposes a typed schema diagnostic and does not scan its string values as generic text

#### Scenario: Media file appears in a material root

- **WHEN** an image, audio, or video file appears under an enabled media-library root
- **THEN** it may be observed by its owning media/library projection but no text entity analysis task is created

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

The coordinator SHALL compare a bounded source fingerprint before extracting document content and SHALL deduplicate repeated watcher and reconciliation hints for the same source. Unchanged sources MUST NOT be reparsed or reanalyzed.

#### Scenario: Reconciliation sees an unchanged source

- **WHEN** portable identity and fingerprint match the fresh `semantic_sources` row
- **THEN** the coordinator records no new analysis work and retains the current projection revision

#### Scenario: Multiple hints identify one change

- **WHEN** create/change events and reconciliation report the same source revision
- **THEN** the coordinator performs at most one canonical analysis replacement for that fingerprint

### Requirement: Separate root and document processing budgets

Root enumeration SHALL run in bounded slices and document analysis SHALL separately enforce unit, extracted-character, elapsed-time, and concurrency budgets. Both operations SHALL support cancellation and disposal. Container byte size MUST NOT be treated as the extracted-text budget, and no Extension Host event path may perform an unbounded directory walk or document read.

#### Scenario: Large media-library root is reconciled

- **WHEN** a registered root contains more entries than one scan budget
- **THEN** the coordinator yields after the budget, retains a continuation, and resumes without blocking normal editor interaction

#### Scenario: Large PDF remains within text budget

- **WHEN** a PDF container is large on disk but its page manifest and extracted text fit the configured document budgets
- **THEN** discovery permits unit-based analysis instead of rejecting it only by container byte size

#### Scenario: Extracted document text exceeds budget

- **WHEN** a document exceeds its unit, extracted-character, or elapsed-time budget
- **THEN** the source receives an `analysis-budget-exceeded` diagnostic and no partial or empty-success replacement is committed

#### Scenario: Root is removed during scanning

- **WHEN** settings remove a root while reconciliation or document analysis is in progress
- **THEN** the coordinator cancels the old work, releases watchers and parser resources, and prevents later results from writing to the removed scope

### Requirement: Stable source identity and overlap handling

Source identity SHALL be derived from workspace partition, logical root identity, and normalized root-relative path. The Host SHALL apply deterministic precedence to overlapping roots and SHALL NOT count the same runtime file twice within one semantic partition.

#### Scenario: Workspace and media root overlap

- **WHEN** an eligible file is reachable through both the workspace root and a configured media-library root
- **THEN** the workspace source owns the observation, duplicate traversal is suppressed, and an overlap diagnostic remains available

#### Scenario: File moves within a root

- **WHEN** a file is renamed or moved to a different relative path
- **THEN** reconciliation records deletion of the old source identity and creation of the new source identity without rewriting confirmed Entity or Asset facts

### Requirement: Safe authorized-source policy

The discovery layer SHALL enforce strict root authorization, workspace trust, symlink/overlap policy, canonical exclusions, parser availability, and source profile validation before analysis. It MUST exclude dependency directories, build output, caches, databases, logs, secrets, and unauthorized external paths.

#### Scenario: Cache or dependency file changes

- **WHEN** a matching extension changes under an excluded cache, dependency, database, or build directory
- **THEN** the file is not registered as a semantic source and no analysis task is created

#### Scenario: External root is not authorized

- **WHEN** a path is outside the workspace and is not resolved from enabled media-library settings
- **THEN** discovery rejects the path with a typed access diagnostic

### Requirement: Source freshness and stale-result rejection

Every analysis attempt SHALL bind to an input fingerprint and root generation. Before committing evidence or projections, the system MUST verify both values; stale results MUST NOT replace newer data.

#### Scenario: File changes during analysis

- **WHEN** the source fingerprint changes after analysis starts and before commit
- **THEN** the result is discarded, the source remains stale, and the latest fingerprint is queued for analysis

#### Scenario: Source analysis fails

- **WHEN** reading, parsing, analyzer execution, cancellation, or repository replacement fails
- **THEN** the source exposes a fail-visible diagnostic and stale freshness rather than an empty successful projection

### Requirement: Discovery does not mutate project facts

Discovering, changing, deleting, or losing access to a source SHALL only update local semantic cache and diagnostics. Discovery MUST NOT automatically register an Asset, confirm an Entity, create an Entity binding, create a durable candidate decision, or delete any project fact.

#### Scenario: New document appears in a watched library

- **WHEN** reconciliation discovers a new document under a configured media-library root
- **THEN** the document can enter semantic projections but `neko/assets/library.json` and Entity fact files remain unchanged

#### Scenario: Source disappears

- **WHEN** a source is deleted or its root becomes unavailable
- **THEN** its cache projection is removed or marked unavailable while confirmed Assets, Entities, bindings, and user candidate decisions remain intact

### Requirement: Cross-Host revision visibility

Each visible semantic replacement SHALL increment the affected workspace partition revision. Extension and TUI consumers SHALL refresh at their documented Host boundaries and MUST NOT use SQLite WAL file notifications as a business protocol.

#### Scenario: Extension commits a semantic replacement

- **WHEN** the Extension updates evidence for a workspace partition
- **THEN** a TUI refresh at its next command or session boundary observes the new partition revision and queries the updated projection
