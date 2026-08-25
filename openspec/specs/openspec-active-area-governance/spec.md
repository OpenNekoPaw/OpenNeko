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

The active change directory SHALL contain only unfinished, independently named system-level or
product-level capabilities that change a system boundary, core product workflow, durable user fact,
or security/trust boundary.

#### Scenario: Retired host proposal remains

- **WHEN** a proposal only describes VS Code, TUI, Engine compatibility, superseded host topology,
  or already completed work
- **THEN** it is removed from the active change directory after current references are detached

### Requirement: Genuine unfinished work remains visible

The repository SHALL keep a system/product proposal active only while its core capability boundary
is not yet implemented or a product-level qualification decides whether that capability can exist.
Local corrections and supplemental evidence SHALL proceed outside the proposal.

#### Scenario: Product qualification defines capability availability

- **WHEN** a new external integration cannot be exposed as a product capability until its trust and execution boundary is qualified
- **THEN** the product-level qualification remains in the proposal until availability is decided

### Requirement: Local implementation work does not create or retain proposals

The repository MUST implement local UI or interaction details, bug fixes, performance work,
refactors, cleanup, package or directory changes, internal contract changes, tests, quality gates,
build/dependency/tooling, inventory, audit, status, and supplemental verification directly in code
and tests. Such work MUST NOT create a proposal or keep an otherwise completed proposal active.

#### Scenario: Canonical code exists and only validation remains

- **WHEN** the system or product capability is already owned by one canonical code path and remaining work is local correction or supplemental evidence
- **THEN** the proposal is deleted and the remaining work proceeds through code, tests, issue/PR, or delivery evidence

### Requirement: Proposal artifacts remain product-level

Active proposals SHALL contain only product intent, stable system boundaries, product-level
requirements, a concise design, and a few product milestones. They MUST NOT contain implementation
inventories, file/class/function plans, command logs, dated evidence, verification reports,
evaluation reports, or code-progress histories.

#### Scenario: Implementation progresses

- **WHEN** files, types, functions, tests, or internal control flow change without altering the product boundary
- **THEN** the proposal remains unchanged because code and tests own implementation truth

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

### Requirement: Completed proposal archives are transient

The repository MUST NOT retain completed proposal history under `openspec/changes/archive`. If the
OpenSpec tooling temporarily creates an archive while promoting delta requirements, the canonical
specs and architecture documents SHALL be verified first and the archived proposal directory SHALL
then be deleted in the same cleanup boundary.

#### Scenario: Feature change is completed

- **WHEN** its current delta requirements have been promoted and current references no longer depend on the proposal
- **THEN** neither the active area nor the archive area contains that proposal directory
