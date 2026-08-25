# repository-documentation-consistency Specification

## Purpose

Keep current repository documentation aligned with executable topology, canonical authorities, and
the product-functional OpenSpec lifecycle.

## Requirements

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

### Requirement: Code owns implementation truth

Repository documents SHALL contain only system architecture, development rules, and core product
design. Code and tests SHALL be the sole source of truth for business logic, feature implementation,
module structure, control flow, and implementation status. Documents and proposals MUST NOT copy
those details or require synchronization after ordinary code changes.

#### Scenario: Internal implementation changes

- **WHEN** code is refactored without changing a system boundary or core product design
- **THEN** no repository document or proposal requires an update

### Requirement: Documentation navigation resolves and exposes authority

Current documentation entry points SHALL link only to current system architecture, development
rules, core product design, and active system/product proposals.

#### Scenario: OpenSpec change is completed

- **WHEN** an active architecture document still links to that implementation change
- **THEN** the stable conclusion is promoted to a canonical spec or architecture document and the link is updated before the completed proposal is deleted

### Requirement: Contributor guidance has a canonical detailed source

Human-facing contribution documents SHALL provide concise setup, change, validation, and review
entry points while linking to `AGENTS.md` as the detailed architecture and quality authority.

#### Scenario: New contributor opens the contribution guide

- **WHEN** the contributor needs repository workflow instructions
- **THEN** the guide provides valid commands and links without duplicating or contradicting `AGENTS.md`
