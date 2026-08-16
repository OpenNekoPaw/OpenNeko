## ADDED Requirements

### Requirement: Pi SHALL be the only Skill execution path

The system MUST expose Skill catalog metadata and load complete Skill content only through the Pi SkillHost `read_skill` path. System Prompt and user help MUST NOT instruct the model or user to invoke `GetContext`, `ActivateSkill`, `DeactivateSkill`, activation slots, active records, clearability, locks, or expiry.

#### Scenario: Explicit Skill selection

- **WHEN** a user includes an exact `$skill` identity in Agent input
- **THEN** the immutable turn snapshot MUST resolve that Skill through the Host-owned catalog and Pi MUST read its content through `read_skill`
- **AND** no legacy activation Tool or lifecycle slot participates

#### Scenario: Natural-language Skill match

- **WHEN** the model selects a catalog Skill from a natural-language request
- **THEN** Pi MUST request the matching opaque locator through `read_skill`
- **AND** the transcript MUST retain the canonical Skill receipt

### Requirement: Legacy activation progress SHALL have no runtime path

The system MUST NOT publish, allow, handle, store, present, or export the legacy `agentCapabilityActivationProgress` message or its activation DTOs. Unknown legacy messages MUST fail under the existing strict message contract rather than enter an ignored compatibility handler.

#### Scenario: Public contract convergence

- **WHEN** Agent contract, Desktop allowlist, and Webview handler public surfaces are inspected or typechecked
- **THEN** no legacy activation progress type, builder, message member, registration, presenter, state, prop, style, test fixture, or export SHALL remain

#### Scenario: Real capability lifecycle remains available

- **WHEN** a domain surface invokes its supported capability lifecycle command
- **THEN** `invokeAgentCapabilityLifecycle` and `agentCapabilityLifecycleResult` MUST continue through their canonical Host and Webview consumer
- **AND** the removed Skill activation protocol MUST NOT be used as a fallback

### Requirement: Turn Tool visibility SHALL have one owner

The system MUST construct immutable turn Tool snapshots from `ToolRegistry` and `CapabilityRegistryRuntime`. It MUST NOT expose an activatable ToolSet, injection layer, Tool category registry, loading tier, category synchronization bridge, or perception ToolGroup as a parallel owner.

#### Scenario: Capability provider registration

- **WHEN** a capability provider contributes a Tool
- **THEN** `CapabilityRegistryRuntime` MUST register the Tool directly with `ToolRegistry`
- **AND** no category registry or ToolSet activation controls whether the Tool enters the canonical snapshot

#### Scenario: Descriptive and presentation types are preserved

- **WHEN** Tool metadata or Webview Tool-call presentation is built
- **THEN** the stable descriptive `Tool.category`, `ToolGroupContentBlockProjection`, and local `ContentReadToolSet` union MAY remain
- **AND** none of them SHALL implement activation, injection, priority dispatch, or fallback semantics

### Requirement: Legacy names SHALL be rejected by verification

The repository MUST maintain deterministic absence/poison checks for removed Tool names, activation messages, lifecycle slot terminology, dead public exports, fake Evaluation Tool calls, and stable architecture documents that prescribe the retired protocol. The canonical `activationId` contract field MAY remain as the exact immutable Skill selection identity, but user-facing diagnostics MUST describe selection or invocation rather than a mutable activation lifecycle.

#### Scenario: Removed path is reintroduced

- **WHEN** production Prompt, contracts, runtime, Webview, Chara policy, i18n, or Evaluation fixtures reintroduce a forbidden legacy symbol
- **THEN** a focused test or repository gate MUST fail visibly

#### Scenario: Stable architecture prescribes a removed Tool

- **WHEN** a stable Agent architecture document instructs maintainers or Prompt authors to invoke `GetContext`, `ActivateSkill`, or `DeactivateSkill`
- **THEN** the repository architecture gate MUST fail visibly
- **AND** historical research, migration evidence, and poison tests MAY retain those names only as explicit retired-path evidence

#### Scenario: Canonical owner is accidentally removed

- **WHEN** Pi SkillHost, `ToolRegistry`, `CapabilityRegistryRuntime`, Conversation/Turn/Job lifecycle, or real Agent capability lifecycle loses its producer-consumer path
- **THEN** focused owner tests or public-surface checks MUST fail visibly

### Requirement: Evaluation SHALL distinguish harness readiness from Agent behavior

The owning Agent Evaluation suite MUST use only currently executable Tool/capability identities and MUST prove the canonical path plus forbidden fallback. Key-free validation MUST NOT be reported as real model or Desktop behavior acceptance.

#### Scenario: Real provider execution is unavailable

- **WHEN** credentials, network, model access, configuration, visible Desktop path, or cost authorization is unavailable
- **THEN** implementation evidence MUST record the exact `infrastructure-blocked` condition and the behavior left unverified
- **AND** dry-run, mock, direct runtime, or final-text evidence MUST NOT substitute for the missing run
