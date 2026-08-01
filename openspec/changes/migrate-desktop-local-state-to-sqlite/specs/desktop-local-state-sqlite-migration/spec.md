## ADDED Requirements

### Requirement: Desktop structured local state uses the existing user-level SQLite authority

The system SHALL persist Desktop shell state and application settings in state-owned repositories in
the existing user-level local metadata database. It MUST NOT create a workspace database, a second
Desktop database, or a permanent JSON fallback.

#### Scenario: Desktop restarts after migration

- **WHEN** valid shell state and application settings have been migrated
- **THEN** Desktop restores both through their SQLite repositories
- **AND** normal startup does not read or write the legacy JSON files

### Requirement: Legacy import is transactional and restart-safe

The system SHALL validate all legacy inputs before mutation and SHALL import their state plus a
versioned migration marker in one transaction. A failed or interrupted import MUST preserve the
legacy sources and MUST NOT expose partially imported state.

#### Scenario: One legacy document is invalid

- **WHEN** shell state is valid but application settings has an unknown schema or invalid value
- **THEN** migration fails visibly before committing either repository
- **AND** both legacy files remain available for explicit recovery

#### Scenario: Archival is interrupted after commit

- **WHEN** SQLite commit succeeds but a legacy file cannot be archived
- **THEN** the committed marker keeps SQLite authoritative
- **AND** the next startup retries archival only after matching and validating the recorded digest

### Requirement: Normal runtime has one canonical path

After migration, Desktop shell and settings operations SHALL read and write only the SQLite
repositories. Unknown schema, repository absence, or migration conflict MUST fail visibly instead of
falling back to legacy JSON or dual-writing both stores.

#### Scenario: SQLite repository is unavailable

- **WHEN** Desktop cannot access a compatible shell-state or settings repository
- **THEN** startup reports an explicit diagnostic
- **AND** it does not make the legacy JSON repository authoritative again

### Requirement: Release rollback uses explicit validated export

The migration owner SHALL provide an explicit downgrade export that serializes current SQLite state
through the owning shell/settings codecs and atomically publishes validated legacy JSON documents.
The export MUST NOT be invoked as a normal runtime fallback.

#### Scenario: Downgrade export fails validation

- **WHEN** exported shell state or settings cannot be read back through its owning codec
- **THEN** no legacy destination is replaced
- **AND** the SQLite state remains unchanged and authoritative

### Requirement: Unrelated data retains its current owner

The migration MUST exclude workspace identity, project facts, journals/logs, media and artifact
bytes, and credentials or mount secrets.

#### Scenario: Desktop local state migration completes

- **WHEN** shell state and application settings are committed to SQLite
- **THEN** `.neko/workspace.json`, project JSON/NKC/OTIO, and JSONL journals/logs remain files
- **AND** credentials remain in SecretStorage or the system keychain
