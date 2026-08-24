# skill-authoring-targets Specification

## Purpose
TBD - created by archiving change unify-skill-creator-authoring-targets. Update Purpose after archive.
## Requirements
### Requirement: Skill Creator is an ordinary portable Skill

The system SHALL expose one builtin `skill-creator` Skill through the same DSH discovery, invocation and prompt-injection path as every other Skill. The system SHALL NOT introduce a Skill-name-specific target, receipt, selector, command alias, Tool grant or runtime branch.

#### Scenario: Same ordinary Skill is discovered in eligible catalogs

- **WHEN** Agent projects an Assistant or Workspace catalog containing the builtin package
- **THEN** each catalog SHALL reference the same `skill-creator` package identity
- **AND** its input entry SHALL require no authoring target

#### Scenario: Another Skill needs Skill creation

- **WHEN** any eligible Skill or Agent turn calls the registered `CreateSkill` Tool
- **THEN** the Host SHALL apply the same capability and approval policy
- **AND** SHALL NOT require the active Skill name to equal `skill-creator`

### Requirement: CreateSkill uses Conversation authority

The system SHALL expose one confirmation-gated `CreateSkill` Host operation whose destination is fixed by the exact Conversation owner. Tool arguments SHALL NOT contain a destination, Workspace identity or filesystem root.

#### Scenario: Assistant creates a personal Skill

- **WHEN** an approved `CreateSkill` call executes in the Assistant space
- **THEN** the Host SHALL create the package only under the configured personal Skill root

#### Scenario: Workspace creates a Workspace Skill

- **WHEN** an approved `CreateSkill` call executes in a Workspace Conversation
- **THEN** the Host SHALL create the package only under that runtime's exact `.agents/skills` root
- **AND** SHALL NOT consult an active, recent or first available Workspace

### Requirement: Skill package creation is canonical and non-destructive

The Agent-owned package service SHALL stage the supplied DSH Markdown and relative resources, validate them through the locked DSH filesystem provider, and ask the Host to publish one new package without replacement. It SHALL NOT restore Pi SkillHost or copy the DSH parser.

#### Scenario: Package is valid

- **WHEN** the bound provider receives an approved valid package request
- **THEN** the service SHALL stage and validate it
- **AND** SHALL atomically publish exactly one package under the bound root

#### Scenario: Resource path is unsafe

- **WHEN** a resource is absolute, traverses a parent or targets a reserved package file
- **THEN** creation SHALL fail visibly
- **AND** SHALL leave the target root unchanged

#### Scenario: Same-name package exists

- **WHEN** the bound root already contains the proposed Skill name
- **THEN** creation SHALL fail visibly
- **AND** SHALL preserve the existing package byte-for-byte

### Requirement: Portable Skill content remains Host-independent

Builtin and third-party Skill bodies SHALL contain portable methodology rather than concrete Tool tutorials, command flow, filesystem permission protocol or internal schema. Tool identities and dependency declarations MAY appear only in machine-readable capability metadata owned by the Host contract.

#### Scenario: Skill content passes anti-protocol validation

- **WHEN** repository validation inspects `skill-creator`
- **THEN** its body SHALL contain no dedicated target-selection or Host authorization procedure
- **AND** it SHALL declare no Skill-specific authoring target metadata
