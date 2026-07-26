## ADDED Requirements

### Requirement: Hosts use one base prompt Builder path

Extension and TUI MUST obtain the Agent base prompt from `SystemPromptBuilder`. No Composer, module graph, section cache, template registry, or parallel manager MAY produce an alternative successful base prompt.

#### Scenario: Extension starts an ordinary Pi turn

- **WHEN** Extension starts a Pi turn with an execution mode and locale
- **THEN** the exact Builder output is supplied to the Pi conversation runtime
- **AND** no retired prompt framework or Platform prompt registry participates

#### Scenario: TUI changes execution mode

- **WHEN** TUI starts a later turn after execution mode changes
- **THEN** it builds the base prompt from the current mode for that turn
- **AND** it does not reuse mutable global prompt state from another conversation

### Requirement: Environment instructions augment the base

An available, authorized AGENTS.md input MUST be composed as an environment instruction without replacing the builtin base protocol. Missing or unreadable external files MUST follow the owning Host file-boundary diagnostic contract.

#### Scenario: Workspace AGENTS.md is available

- **WHEN** an isolated workspace provides valid AGENTS.md content
- **THEN** the actual Pi prompt includes both base and environment instructions
- **AND** composition evidence identifies both fragments without exposing their bodies

### Requirement: Pi owns Skill and capability composition

Skill catalog, explicit Skill invocation, capability Tool schemas and domain capability prompts MUST remain owned by their Pi/Skill/capability runtimes. Builder MUST NOT introduce a generic module registration extension point for them.

#### Scenario: A builtin Skill is explicitly invoked

- **WHEN** the Host invokes an installed builtin Skill
- **THEN** the exact Host-resolved Skill participates through the Pi Skill snapshot/invocation path
- **AND** Builder does not inline a second Skill representation

### Requirement: Prompt composition evidence follows execution

Secret-free prompt composition facts MUST be derived from fragments that participated in the actual runtime request. A test-only Composer or reconstructed parallel prompt MUST NOT satisfy evidence.

#### Scenario: Evaluation reads prompt facts

- **WHEN** debug automation captures a completed turn
- **THEN** facts contain ordered ids, sources, versions/hashes for actual base, environment and selected Skill fragments
- **AND** prompt content, credentials and Host-private paths are absent

### Requirement: Retired prompt surfaces stay absent

The repository MUST reject reintroduction of `SystemPromptComposer`, `ModuleOrchestrator`, `PromptModuleRegistry`, `PromptSectionCache`, generic Agent/Platform `PromptManager`, their projection modules, and `Platform.prompts`.

#### Scenario: A retired compatibility adapter is added

- **WHEN** source introduces one of the retired files, symbols or properties
- **THEN** the architecture/source-absence gate fails
- **AND** the adapter cannot return a fallback prompt
