## ADDED Requirements

### Requirement: Pi owns the canonical Skill runtime
The Agent runtime SHALL use Pi as the only parser, discovery implementation, progressive-disclosure mechanism and invocation formatter for Portable Skills. OpenNeko MUST NOT maintain a second Skill body parser, executable workflow model or prompt-formatting path.

#### Scenario: A valid Skill is discovered
- **WHEN** a builtin, personal, project or plugin root contains a valid Pi-compatible Skill
- **THEN** the executable catalog derives its canonical name, description and content locator from the Pi discovery result
- **AND** activation loads the full body through the same Pi snapshot rather than an OpenNeko copy

#### Scenario: One Skill is invalid
- **WHEN** Pi reports an invalid Skill beside valid Skills in the same discovery generation
- **THEN** only the invalid item is excluded or diagnosed
- **AND** valid sibling Skills, Commands, Conversations and Workspaces remain available

### Requirement: Every Skill uses one ordinary invocation path
Builtin, personal, project, plugin and third-party Skills SHALL use the same exact activation contract. Runtime capability exposure, Conversation ownership, target selection and navigation MUST NOT branch on Skill name, source-specific implementation or builtin status.

#### Scenario: A builtin creation Skill is invoked
- **WHEN** the user invokes `character-creator`, `skill-creator` or another builtin Skill
- **THEN** the Agent submits the same typed Skill activation shape used for a third-party Skill
- **AND** no dedicated Session, target receipt, page navigation or Skill-specific handler is created

#### Scenario: A third-party Skill shares a builtin use case
- **WHEN** a trusted third-party Skill provides instructions for the same domain as a builtin Skill
- **THEN** it can consume the current Conversation's available capabilities under the same permission rules
- **AND** builtin identity does not grant additional Tool or target authority

### Requirement: Skill activation is bound to an exact discovery snapshot
An executable Skill SHALL carry exact Host-owned source provenance, fingerprint, activation identity and opaque locator. Invocation MUST fail locally when that identity is stale or mismatched and MUST NOT retry another same-named source.

#### Scenario: Same-named Skills exist in multiple sources
- **WHEN** project, personal, plugin and builtin roots contain the same Skill name
- **THEN** the Host selects the canonical source by `project > personal > plugin > builtin` and stable plugin identity
- **AND** it records duplicate diagnostics without making shadowed records executable

#### Scenario: Skill bytes change after catalog projection
- **WHEN** a submitted activation id no longer belongs to the current exact fingerprint and source snapshot
- **THEN** only that invocation fails with a stale or unknown diagnostic
- **AND** the runtime does not execute by display name or fall back to another source

### Requirement: OpenNeko Skill metadata cannot grant runtime authority
Skill author metadata, including portable `metadata` and experimental `allowed-tools`, MUST NOT register Tools, select models/providers, grant permission, choose a Workspace/domain target or alter Conversation ownership. Tool schema, approval and mutation authority SHALL come from the current registered Capability snapshot.

#### Scenario: Skill requests an unavailable capability
- **WHEN** activated Skill instructions describe an operation whose Tool is absent from the current turn snapshot
- **THEN** the Agent reports the missing capability without claiming execution
- **AND** the Host does not install, synthesize or switch a provider because of Skill metadata

#### Scenario: Character instructions run outside a Character authoring context
- **WHEN** a Character-oriented Skill is activated in a Conversation without an authorized Character mutation Tool
- **THEN** it may produce a reviewable proposal using available context
- **AND** it cannot create, select, switch or mutate a Character target

### Requirement: Skill resources remain contained and lazily readable
OpenNeko SHALL expose Skill files through opaque locators bound to the exact package fingerprint. Relative resource resolution MUST remain inside the canonical package root and MUST reject traversal, symlink escape and locators from another Host snapshot.

#### Scenario: A Skill reads a bundled reference
- **WHEN** an activated Skill requests a valid relative reference from its own package
- **THEN** the Host resolves it through the exact opaque locator and returns the authorized content
- **AND** it does not project the physical package path to Renderer state

#### Scenario: A bundled path escapes the package
- **WHEN** a resource path or symlink resolves outside the exact Skill package root
- **THEN** that resource request fails before external bytes are read
- **AND** other resources and Skills remain usable

### Requirement: Skill scripts use ordinary Tool authorization
SkillHost MUST NOT own a separate external-processor executor, permission protocol or run lifecycle. Executable resources SHALL be invoked only through an ordinary registered Host Tool with its standard trust, approval, cancellation and result semantics.

#### Scenario: A Skill contains a helper script
- **WHEN** the Agent needs to execute the script and an eligible process Tool exists
- **THEN** it resolves the contained script resource and requests the ordinary Tool
- **AND** Tool policy decides authorization independently of Skill identity

#### Scenario: No process Tool is available
- **WHEN** Skill instructions reference a script but the current Tool snapshot provides no eligible executor
- **THEN** execution is visibly unavailable
- **AND** SkillHost does not use a hidden processor path

### Requirement: Commands and Skills have separate owners
`/command` artifacts SHALL be discovered, identified and invoked by a Command owner distinct from Pi SkillHost. Skill and Command implementations MAY share low-level Markdown and source utilities, but MUST NOT share executable records, collision namespaces, handler identities or invocation formatters.

#### Scenario: A Skill and Command share a name
- **WHEN** `$review` and `/review` both exist
- **THEN** each resolves within its own exact catalog and invocation contract
- **AND** neither shadows or executes the other

#### Scenario: Composer lists both entry types
- **WHEN** the unified Agent input catalog combines currently available Skills and Commands
- **THEN** it preserves each contributor's typed identity and source
- **AND** the presentation composition does not make SkillHost the Command authority
### Requirement: Portable Skill content remains capability-neutral
Builtin Skill content SHALL contain reusable methods, task judgment, domain semantics and output standards. OpenNeko-specific Tool names, argument schemas, approval/polling protocols, Desktop UI flows, provider handles, cache/Webview paths and package-private lifecycle instructions MUST remain in system prompts, Capability prompts or Tool contracts rather than Skill bodies.

#### Scenario: A builtin Skill is changed
- **WHEN** a contributor adds or modifies builtin Skill instructions
- **THEN** deterministic content tests reject OpenNeko runtime protocols and private Tool tutorials
- **AND** legitimate domain methodology and portable relative references remain allowed
