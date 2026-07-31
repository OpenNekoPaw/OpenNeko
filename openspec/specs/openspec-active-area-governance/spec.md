# openspec-active-area-governance Specification

## Purpose

TBD - created by archiving change clean-openspec-active-area. Update Purpose after archive.

## Requirements

### Requirement: Active changes have an explicit lifecycle disposition

The repository SHALL classify an examined OpenSpec change as active, archive with spec sync,
archive without spec sync, or empty residue before moving or deleting it. Checkbox completion alone
MUST NOT authorize archive.

#### Scenario: Completed tasks retain current requirements

- **WHEN** all change artifacts and tasks are complete and its delta requirements remain current
- **THEN** the change is archived with those requirements synchronized to the canonical specs

#### Scenario: Superseded requirements are historical only

- **WHEN** a successor owns the implemented behavior and the old delta requirements are obsolete
- **THEN** the old change is archived without synchronizing its delta specs

### Requirement: Genuine unfinished work remains visible

The repository SHALL keep an OpenSpec change active when real implementation, acceptance,
migration, or external-evidence work remains, until that work is completed or an explicit successor
disposition is recorded.

#### Scenario: External acceptance gate is still open

- **WHEN** a task requires provider evidence, packaged Electron validation, or repository settings
  that have not been verified
- **THEN** the task remains unchecked and the change remains in the active directory

### Requirement: Empty residue is deleted only after exact verification

An empty change directory MUST be deleted only after verifying that it contains no files, no tracked
entries, and no artifacts to recover.

#### Scenario: Empty untracked scaffold remains

- **WHEN** a first-level change directory is empty and Git tracks no path beneath it
- **THEN** the directory is removed without creating replacement historical artifacts

### Requirement: Archive moves preserve navigability and evidence

Archive operations SHALL retain the complete change directory and SHALL update current local
Markdown references to the date-prefixed archive location.

#### Scenario: Current documentation references an archived change

- **WHEN** a change moves from the active directory into `openspec/changes/archive/`
- **THEN** all current Markdown links resolve to the archived path after the move

### Requirement: Historical decision status matches successor ownership

The repository SHALL mark an ADR as superseded at its source when a stable successor document
replaces its implementation authority, while preserving still-valid principles and historical
evidence.

#### Scenario: Architecture index already marks an ADR historical

- **WHEN** the ADR contains a replacement notice and the architecture index no longer treats it as
  current authority
- **THEN** the ADR status is marked Superseded and names the successor boundary

### Requirement: Governance audits are reproducible snapshots

A dated OpenSpec governance audit SHALL record its source revision, collection timestamp, counting
method, and lifecycle caveat. It MUST NOT present mutable counts as timeless architecture facts.

#### Scenario: Active change counts change after cleanup

- **WHEN** empty directories are removed or completed changes are archived
- **THEN** the audit records refreshed counts together with the exact revision and collection time
