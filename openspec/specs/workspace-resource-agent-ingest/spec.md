# workspace-resource-agent-ingest Specification

## Purpose

Define authorized Workspace resource acquisition and exact Agent context ingestion without raw-path or active-target fallback.

## Requirements

### Requirement: Agent file resources enter through one Workspace locator path

The Agent Composer SHALL discover Files, linked Media and installed Assets through the existing `@`
resource presentation. A selected file resource SHALL reach DSH only as an authorized Workspace
`ContentLocator` projected to one ACP resource link. DSH MUST NOT receive Asset Library membership,
Media Library connection, physical source path, synchronization state or a parallel Asset context payload.

#### Scenario: Select a Workspace file

- **WHEN** the user selects an authorized Workspace file from `@`
- **THEN** Composer adds the existing locator-backed file reference without copying the file

#### Scenario: Select linked Media

- **WHEN** the user selects a file below an authorized `neko/assets/<libraryName>` managed link
- **THEN** Composer adds that Workspace locator and preserves Media only as a presentation source label
- **AND** DSH receives no Media connection or physical target identity

#### Scenario: Submit a materialized Asset

- **WHEN** an installed Asset has been copied into the exact Workspace after explicit selection
- **THEN** Composer submits the resulting Workspace locator as one ACP resource link
- **AND** no `openneko_assets` Tool or Asset context payload participates

#### Scenario: Asset copy is still running

- **WHEN** the user selects an Asset and its Workspace copy has not completed
- **THEN** Composer shows a local materialization status and prevents submission of the unresolved `@` input
- **AND** the user can continue editing the draft while the copy runs
- **AND** completion does not overwrite a newer draft

### Requirement: Asset selection performs one conflict-safe Workspace copy

Asset materialization SHALL resolve one exact active Asset membership, require an available regular source
file contained by the canonical Asset root, and copy it into the exact authorized Workspace `assets/`
directory. It SHALL publish a new ordinary file without overwrite and return its canonical
`WorkspaceFileContentLocator`. It MUST NOT create a symlink, synchronization record, recovery task,
provenance ledger or background runtime.

#### Scenario: Select an available Asset

- **WHEN** the user selects an available Asset for an exact Workspace
- **THEN** Assets copies its bytes to `assets/<name>` and returns that Workspace locator
- **AND** later Asset move, removal or modification does not mutate the copied Workspace file

#### Scenario: Destination name already exists

- **WHEN** `assets/<name>` already exists
- **THEN** Assets creates a unique sibling name without reading or overwriting the existing file

#### Scenario: Asset source is stale or unsafe

- **WHEN** the membership is missing, removed, outside the Asset root, unavailable, non-file or a symlink
- **THEN** only the current selection fails with an exact diagnostic
- **AND** no Workspace file, context payload or Tool result reports success

### Requirement: Resource search has no filesystem side effects

Opening or filtering `@` SHALL only read bounded owner projections. Asset bytes SHALL be copied only after
the user selects one exact candidate and the Host revalidates the same sender-bound Surface and Workspace
grant.

#### Scenario: Browse Asset candidates

- **WHEN** the user opens `@` or changes its filter without selecting a result
- **THEN** no Workspace directory, file, link, task or synchronization record is created

#### Scenario: Candidate becomes stale before selection

- **WHEN** an Asset candidate is removed after search and before selection
- **THEN** materialization fails locally instead of using cached path data or another matching Asset

### Requirement: Symlink policy remains owner-specific

The product SHALL allow only an explicitly connected Media Library to create a package-managed direct
symlink or junction at `neko/assets/<libraryName>`. Installed Assets and ordinary Files MUST NOT use that
link lifecycle. A managed Media link is a rebuildable access projection and MUST NOT become business
identity or synchronization authority.

#### Scenario: Use an Asset in a Workspace

- **WHEN** a user selects an installed Asset
- **THEN** the result is a regular Workspace file under `assets/` and not a link into the global Asset root

#### Scenario: Link a Media Library

- **WHEN** the user explicitly connects an external Media directory to a Workspace
- **THEN** the existing binding owner may materialize one managed link under `neko/assets/`
- **AND** missing binding, ordinary symlink or nested escape cannot authorize content access
