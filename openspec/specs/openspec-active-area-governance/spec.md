# openspec-active-area-governance Specification

## Purpose

Keep the OpenSpec active area limited to current Electron Desktop design and implementation work,
while promoting stable requirements to canonical specs and removing completed or obsolete proposal
residue.

## Requirements

### Requirement: Active changes have an explicit lifecycle disposition

The repository SHALL classify an examined OpenSpec change as current Desktop work, completed work
whose stable requirements must be promoted, obsolete work, or empty residue before deleting it.
Checkbox completion alone MUST NOT authorize deletion until current requirements and references have
been checked.

#### Scenario: Completed tasks retain current requirements

- **WHEN** all change artifacts and tasks are complete and its delta requirements remain current
- **THEN** those requirements are synchronized to canonical specs or current architecture documents,
  and the completed proposal directory is deleted

#### Scenario: Superseded requirements are historical only

- **WHEN** a successor owns the implemented behavior and the old delta requirements are obsolete
- **THEN** the old proposal is deleted without preserving a historical change copy

### Requirement: Active changes describe the current Electron Desktop product

The active change directory SHALL contain only unfinished design, implementation, migration, or
acceptance work for the current Electron Desktop product and its directly consumed packages.

#### Scenario: Retired host proposal remains

- **WHEN** a proposal only describes VS Code, TUI, Engine compatibility, superseded host topology,
  or already completed work
- **THEN** it is removed from the active change directory after current references are detached

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

### Requirement: Current references do not depend on deleted proposal history

Current architecture documents, active changes, scripts, and checks SHALL reference canonical specs,
current architecture facts, or implementation paths rather than deleted proposal directories.

#### Scenario: Completed proposal is removed

- **WHEN** a completed proposal directory is deleted
- **THEN** repository link and name searches find no current dependency on that directory
