## MODIFIED Requirements

### Requirement: Skill Creator is an ordinary DSH Skill

The system SHALL expose one builtin `skill-creator` through the same DSH discovery, invocation and prompt-injection path as every other Skill. The system SHALL NOT introduce a Skill-name-specific target, receipt, selector, command alias, Tool grant or runtime branch. Any eligible Agent turn MAY use the Host-owned `CreateSkill` Tool when it is present and approved.

#### Scenario: Skill Creator is loaded

- **WHEN** the exact DSH catalog selects the builtin `skill-creator`
- **THEN** its ordinary DSH identity and body SHALL be loaded
- **AND** no authoring target or Tool permission SHALL be derived from its name or content

### Requirement: CreateSkill uses Conversation authority

The system SHALL expose one approval-gated `CreateSkill` Host operation whose destination is fixed by the exact Conversation owner. Tool arguments SHALL NOT contain a destination, Workspace identity or filesystem root.

#### Scenario: Assistant creates a personal DSH Skill

- **WHEN** an approved `CreateSkill` call executes in the Assistant space
- **THEN** the Host SHALL create the package only under the configured DSH personal Skill root

#### Scenario: Workspace creates a Workspace DSH Skill

- **WHEN** an approved `CreateSkill` call executes in a Workspace Conversation
- **THEN** the Host SHALL create the package only under that exact Workspace's configured DSH project Skill root
- **AND** SHALL NOT consult active, recent or first-available Workspace state

### Requirement: Skill package creation is canonical and non-destructive

The Agent authoring application service SHALL stage candidate bytes, use the precisely locked DSH filesystem provider as the format authority, and ask the Host to atomically publish one new package. It SHALL NOT use the retired Pi SkillHost or a copied OpenNeko Skill parser.

#### Scenario: Package is valid

- **WHEN** isolated DSH provider validation returns the requested complete Skill definition
- **THEN** the Host SHALL atomically publish exactly one package under the bound root
- **AND** readiness SHALL be observed through the normal DSH registry

#### Scenario: Resource path is unsafe

- **WHEN** a resource is absolute, traverses a parent, is a symlink, is duplicated or targets the main Skill file
- **THEN** creation SHALL fail visibly
- **AND** SHALL leave the target root unchanged

#### Scenario: Same-name package exists

- **WHEN** the bound root already contains the proposed target
- **THEN** creation SHALL fail visibly
- **AND** SHALL preserve the existing package byte-for-byte
