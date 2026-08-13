## ADDED Requirements

### Requirement: Character management detail does not host Character Studio

Desktop Creative Management SHALL compose a responsive Character card catalog in Main and a lightweight Chara-owned Character detail in Secondary Main. The catalog SHALL use one card presentation rather than expose a redundant list/grid mode. The detail SHALL prioritize placement, identity, summary, draft/finalization status, usable-version count and Start Conversation/Edit actions. Complete version graph, Storyline and reference inventory belong to Workspace Character Authoring and MUST NOT appear as default management-detail sections. The detail MUST NOT mount the complete mutable Character definition editor, Storyline editor, version finalization form, Agent authoring Root or hidden Character Studio provider.

#### Scenario: User selects and deselects a Character

- **WHEN** the user selects one CharacterProject and then closes its management detail
- **THEN** Desktop mounts and unmounts only the exact lightweight Secondary Main detail while the Character catalog remains in Main
- **AND** no authoring Root, directory grant consumer, draft state or Studio subscription remains mounted

### Requirement: Character authoring is an exact Workspace authoring target

Desktop SHALL compose the Chara-owned Character authoring surface as a Secondary Main target only when canonical Workspace Authoring selects an exact CharacterProject after Host validates the sender-bound directory Workspace grant and owner-qualified target. The primary Main SHALL remain the Content Project's canonical Board or the standalone Workspace's explicit empty state. Standalone and project-local Characters SHALL reuse the same target switching, Workbench slots, Agent/resources composition and Character surface; only the authorized Workspace authority, Project membership requirement and exact binding differ. Desktop MUST NOT expose a raw path to Renderer, wrap standalone Character in a fake Content Project, create an independent Character Studio Scene/Workbench/controller, replace the default Board/empty Main or retain a previous Character surface after target switching.

#### Scenario: User opens a standalone Character from management

- **WHEN** the user invokes “Open Studio” and Host validates the exact standalone library target
- **THEN** Desktop transitions from Creative Management to the controlled Workspace authoring composition, preserves the Board/empty primary Main and mounts the Chara-owned Character surface in Secondary Main
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
