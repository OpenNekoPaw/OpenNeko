## ADDED Requirements

### Requirement: UI validation applicability

The repository SHOULD use the UI validation Skill for implementation or review work that adds or materially changes user-visible UI behavior. When the workflow is used, it SHALL classify work with no user-visible UI impact as not applicable with an explicit reason.

#### Scenario: New user-visible feature requires validation

- **WHEN** a development task implements a new user-visible control, view, interaction, or presentation state
- **THEN** the repository recommends focused UI functional and visual validation as advisory evidence

#### Scenario: Headless change is excluded explicitly

- **WHEN** a change has no user-visible UI behavior or presentation impact
- **THEN** the Skill records UI validation as not applicable and does not invent graphical checks

### Requirement: Acceptance inventory

The Skill SHALL derive one acceptance inventory from the requested behavior, the affected UI surface, user-operable controls, reachable states and transitions, adjacent regression risk, and intended delivery claims before validation begins.

#### Scenario: Every delivery claim has a check

- **WHEN** the implementation is ready for UI validation
- **THEN** every user-visible behavior intended for delivery maps to an observable functional check and, when appearance matters, a visual state and evidence expectation

#### Scenario: Interactive state cycle is covered

- **WHEN** an affected control changes reversible UI state
- **THEN** the inventory covers its initial state, changed state, and return or cancellation state

### Requirement: Authoritative runtime evidence

The Skill SHALL require the narrowest real runtime that crosses every affected product boundary and SHALL reject supplemental evidence as a substitute for the owning runtime.

#### Scenario: Desktop boundary requires Desktop validation

- **WHEN** affected behavior depends on Desktop trust, preload, IPC, focus, CSP, native resources, window state, persistence, or lifecycle
- **THEN** validation uses the isolated Desktop product runtime and does not accept a browser-only rendering as complete evidence

#### Scenario: Browser-owned behavior uses a narrower runtime

- **WHEN** affected behavior is fully owned by a browser component and does not cross a Desktop boundary
- **THEN** validation may use the focused browser or component runtime and records why it is authoritative for that scope

### Requirement: Functional and visual passes

The Skill SHALL conduct functional, visual, and adjacent regression checks as distinct judgments over the same acceptance inventory.

#### Scenario: Functional behavior is proven through user controls

- **WHEN** a UI workflow is validated
- **THEN** normal user-operable input reaches the expected visible result and verifies relevant state transitions instead of relying only on internal state injection

#### Scenario: Relevant visual states are inspected

- **WHEN** a UI state contributes to the feature's visible behavior
- **THEN** validation inspects fit, clipping, overlap, hierarchy, readability, theme, focus, density, motion, and failure presentation as applicable

#### Scenario: Adjacent behavior is protected

- **WHEN** the changed component, state, or runtime path is shared with an existing workflow
- **THEN** validation exercises the smallest representative adjacent workflow and records its result

### Requirement: Fail-visible signoff

The Skill SHALL classify required checks and the overall result as passed, failed, blocked, or not applicable, and SHALL prohibit a passing signoff when required evidence is failed, blocked, missing, or unexecuted.

#### Scenario: Missing evidence blocks acceptance

- **WHEN** an authoritative runtime is unavailable or a required check cannot be executed
- **THEN** the result is blocked, identifies the missing evidence, and preserves the remaining risk

#### Scenario: Complete evidence permits acceptance

- **WHEN** every required inventory item has passing functional, visual, and applicable regression evidence
- **THEN** the report may declare UI validation passed and cites the checked runtime, states, and evidence

### Requirement: Skill content boundary

The Skill SHALL contain only UI validation methodology, coverage judgment, success criteria, and reporting guidance, while concrete tool tutorials, command names, parameter schemas, polling protocols, package-private contracts, and runtime authoring details remain outside Skill prompt content.

#### Scenario: Content boundary remains deterministic

- **WHEN** repository quality tests inspect the Skill package
- **THEN** they verify the canonical metadata and workflow stages and reject prohibited runtime protocol content

### Requirement: Quality review composition

The repository quality review Skill SHALL delegate focused UI acceptance to the UI validation Skill when user-visible behavior is affected and SHALL preserve a failed or blocked result as an advisory finding or follow-up without changing code-gate status.

#### Scenario: UI change enters repository review

- **WHEN** a non-trivial change affects user-visible UI behavior
- **THEN** repository quality review records the focused UI validation result separately from its blocking architecture and code-quality checks

### Requirement: Development standards integration

The repository's Chinese and English contribution guides and accepted quality-gates ADR SHALL identify the UI validation Skill as the canonical advisory workflow for implemented user-visible UI changes, SHALL preserve the authoritative-runtime boundary, and SHALL prohibit the UI report itself from passing when required evidence is failed, blocked, missing, or unexecuted.

#### Scenario: Contributor follows the development standard

- **WHEN** a contributor implements or changes user-visible UI behavior
- **THEN** the contribution guide recommends the canonical Skill and identifies functional, visual, and adjacent-regression evidence for its affected inventory

#### Scenario: Stable quality policy remains fail-visible

- **WHEN** the accepted quality-gates policy describes UI completion evidence
- **THEN** it references the canonical Skill, requires the owning runtime for affected boundaries when validation runs, and does not allow incomplete evidence to pass within the UI report
