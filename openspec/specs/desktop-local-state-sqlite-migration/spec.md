# desktop-local-state-sqlite-migration Specification

## Purpose
TBD - created by archiving change migrate-desktop-local-state-to-sqlite. Update Purpose after archive.
## Requirements
### Requirement: Desktop structured local state uses one stable SQLite authority

Desktop shell state and application settings SHALL persist through package-owned repositories in the
existing user-level local metadata database. Contracts and tables MUST have one canonical version-free
shape. The product MUST NOT create a workspace database, second Desktop database, JSON fallback,
migration registry or schema dispatch path.

#### Scenario: Desktop restarts with canonical state

- **WHEN** valid shell state and application settings exist in their stable tables
- **THEN** Desktop restores both through the package-owned SQLite repositories
- **AND** startup does not inspect retired JSON files or migration markers

### Requirement: Retired local-state paths are product-unreachable

Desktop startup, package public entries, production imports, build output and ordinary tests MUST NOT
read, write, import, archive, export, repair or classify retired shell/settings JSON. Existing bytes
MUST remain untouched.

#### Scenario: Retired JSON remains on disk

- **WHEN** a retired Desktop state JSON file exists beside canonical SQLite state
- **THEN** product startup opens only the canonical repository
- **AND** no retired reader, import, archive, downgrade export or compatibility handler runs

### Requirement: Stable tables evolve additively

Initialization SHALL create only missing stable tables. Existing authority rows SHALL be updated in
place by authority identity, changing only canonical owned columns and preserving unknown columns.
Optional fields MAY be added only with one permanent absence meaning.

#### Scenario: Existing row has an unknown column

- **WHEN** the repository commits canonical state to an existing authority row
- **THEN** it updates only canonical owned columns and leaves the unknown column untouched
- **AND** it does not inspect that column as a schema generation or synthesize a value for it

### Requirement: Invalid persisted state fails locally

Authority roots SHALL preserve unknown top-level metadata as opaque values while validating required
semantic collections. Child Projects, Windows, Workbench instances, Scenes and settings components
SHALL validate independently. An invalid child MUST NOT clear valid siblings or disable Desktop.

#### Scenario: One Workbench instance is invalid

- **WHEN** a Window contains one invalid Workbench instance beside a valid sibling
- **THEN** only the invalid instance is rejected with an exact diagnostic
- **AND** the valid instance, PrimarySidebar and unrelated settings remain available

### Requirement: Unrelated data retains its owner

Desktop local-state repositories MUST exclude workspace identity, project facts, journals/logs,
media/artifact bytes, credentials, Agent configuration, Pi transcripts, explicit memory, Skills,
prompts, profiles and workspace configuration.

#### Scenario: Adjacent Agent and workspace data exists

- **WHEN** Desktop opens its shell/settings repositories
- **THEN** it reads only the exact canonical authority rows
- **AND** it does not read, copy, index, delete or repair Agent-, workspace- or project-owned data
