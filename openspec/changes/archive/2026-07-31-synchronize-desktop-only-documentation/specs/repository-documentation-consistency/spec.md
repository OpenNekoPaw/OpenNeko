## ADDED Requirements

### Requirement: Current product documents follow executable topology

Current product and architecture documents SHALL describe a capability as Desktop-integrated only
when the Desktop composition consumes its public package entry and exposes a real product path.
Retained packages without a Desktop consumer MUST be identified as retained, dormant, unavailable,
or planned.

#### Scenario: Retained package has no Desktop consumer

- **WHEN** a workspace package exists but `apps/neko-desktop` does not consume it
- **THEN** root README, client target, roadmap, and domain navigation do not present it as a current Desktop capability

### Requirement: Current and target architecture remain distinguishable

Accepted current architecture documents SHALL describe the executable Desktop-only topology.
Proposed ADRs MAY describe target package renaming or decomposition, but current rules MUST NOT
present those changes as implemented before their canonical path and verification exist.

#### Scenario: Proposed Platform decomposition is not implemented

- **WHEN** Desktop still depends on `@neko/platform`
- **THEN** current documentation marks it as an existing migration boundary while the proposed ADR owns the target decomposition

### Requirement: Removed hosts and runtimes are not active guidance

Active contributor rules, current architecture, package README files, and validation commands MUST
NOT direct contributors to removed VS Code, TUI, Engine, client, Rust Engine, or Proto paths.
Historical documents that retain those facts MUST be explicitly marked historical or superseded.

#### Scenario: Contributor selects a validation command

- **WHEN** a contributor reads the repository rules
- **THEN** every canonical validation command resolves to an existing Desktop, TypeScript, or Node/FFmpeg path

### Requirement: Roadmap and implementation status remain separate

Roadmap documents SHALL own direction, sequencing, and acceptance gates. Volatile task progress and
temporary implementation blockers MUST remain in OpenSpec artifacts or dated status snapshots.

#### Scenario: A phase implementation progresses

- **WHEN** individual OpenSpec tasks change state
- **THEN** the roadmap remains valid without copying those task-level completion details

### Requirement: Documentation navigation resolves and exposes authority

Current documentation entry points SHALL link to existing local targets and SHALL distinguish current
core documents, proposed decisions, historical decisions, and dated status snapshots.

#### Scenario: OpenSpec change moves to archive

- **WHEN** an active architecture document still links to that implementation change
- **THEN** its link points to the archived location or the document explicitly records that the implementation artifact was retired

### Requirement: Contributor guidance has a canonical detailed source

Human-facing contribution documents SHALL provide concise setup, change, validation, and review
entry points while linking to `AGENTS.md` as the detailed architecture and quality authority.

#### Scenario: New contributor opens the contribution guide

- **WHEN** the contributor needs repository workflow instructions
- **THEN** the guide provides valid commands and links without duplicating or contradicting `AGENTS.md`
