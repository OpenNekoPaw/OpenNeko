## ADDED Requirements

### Requirement: Character management detail does not host Character Studio

Desktop Creative Management SHALL compose the Character catalog in Main and a lightweight Chara-owned Character detail in Secondary Main. The detail MAY show placement, identity, summary, draft/finalization status, version graph summary, Storyline/reference counts and explicit navigation or lifecycle actions, but it MUST NOT mount the complete mutable Character definition editor, Storyline editor, version finalization form, Agent authoring Root or hidden Character Studio provider.

#### Scenario: User selects and deselects a Character

- **WHEN** the user selects one CharacterProject and then closes its management detail
- **THEN** Desktop mounts and unmounts only the exact lightweight Secondary Main detail while the Character catalog remains in Main
- **AND** no authoring Root, directory grant consumer, draft state or Studio subscription remains mounted

### Requirement: Character authoring is an exact Workspace Main capability

Desktop SHALL compose the Chara-owned Character authoring surface in Main only when canonical Workspace Authoring selects an exact CharacterProject after Host validates the sender-bound directory Workspace grant and owner-qualified target. Standalone and project-local Characters SHALL reuse the same target switching, Workbench slots, Agent/resources composition and Character surface; only the authorized Workspace authority, Project membership requirement and exact binding differ. Desktop MUST NOT expose a raw path to Renderer, wrap standalone Character in a fake Content Project, create an independent Character Studio Scene/Workbench/controller or retain a previous Character surface after target switching.

#### Scenario: User opens a standalone Character from management

- **WHEN** the user invokes “Open Studio” and Host validates the exact standalone library target
- **THEN** Desktop transitions from Creative Management to the controlled Workspace authoring composition and mounts the Chara-owned Character surface in Main
- **AND** the previous management Secondary Main is unmounted rather than promoted into an editor

#### Scenario: User switches between project-local authoring targets

- **WHEN** one Project Workspace switches from Content to Character to another Character target
- **THEN** Main replaces the owner Root after outgoing snapshot commit and incoming exact authority validation
- **AND** no hidden Character surface, independent Studio controller, current-target fallback or cross-target draft state is retained

### Requirement: Quick Character creation uses an exact Agent Entry handoff

Desktop SHALL route the Character Management quick-generation action through one typed transition to the canonical Agent Entry/Composer with the exact `character-creator` activation and an explicit management return identity. Destination selection, Agent invocation, fresh-target authorization and Chara mutation SHALL continue through their canonical public ports. Desktop MUST NOT embed a second Composer in Character Management, create a management-owned Agent runtime, turn Secondary Main into an authoring Root or create a second Character Studio.

#### Scenario: Quick creation completes without Studio

- **WHEN** the exact Character draft operation succeeds from Character Management
- **THEN** the canonical Agent result exposes an exact “View Character” handoff that returns to and selects the created CharacterProject in Character Management
- **AND** Desktop does not create or retain a Studio View unless the user separately invokes “Open Studio”
