## MODIFIED Requirements

### Requirement: Product entry exposes Conversation and Creation only

Desktop SHALL expose Conversation and Creation as the two product-level Window navigation intents. Conversation SHALL show the canonical unbound Assistant Draft when no exact durable lifecycle is selected and MUST NOT create a durable Agent Conversation merely because the user navigates there. Creation SHALL show the exact Project catalog and MUST NOT materialize a Creative Workspace until the user selects or creates one exact Project. Character Dialogue, Room, World Experience, installed Character/World management, Settings, and Activity SHALL remain owner-qualified subordinate destinations rather than peer authoring modes.

#### Scenario: User enters Conversation

- **WHEN** the user chooses Conversation without an exact Assistant Conversation, Dialogue, Room, Run, or Save selection
- **THEN** Desktop renders the canonical Assistant Draft
- **AND** no durable Conversation, Project, runtime, or authoring authority is inferred or created

#### Scenario: User enters Creation

- **WHEN** the user chooses Creation without an exact Project selection
- **THEN** Desktop renders the Project catalog and canonical new-Project action
- **AND** no Workspace, domain target, Conversation, or runtime is created

### Requirement: Conversation delegates exact runtime launch without owning it

Conversation MAY configure or continue one exact Assistant Conversation, Character Dialogue, Room, or World Experience lifecycle through the applicable Agent, Chara, or World owner. Runtime selection SHALL accept only exact eligible immutable releases or exact existing lifecycle identities. Conversation navigation, installed-library selection, recent state, active Window state, mutable drafts, and current Creative Workspace MUST NOT become runtime authority.

#### Scenario: User launches Character Dialogue

- **WHEN** the user confirms one exact eligible CharacterVersion from Conversation
- **THEN** Chara and Agent create or continue the exact Dialogue lifecycle through their canonical transaction
- **AND** Desktop does not create an Assistant Conversation, Project, CharacterProject, or fallback runtime

#### Scenario: User opens installed-library management

- **WHEN** the user chooses Character or World library management under Conversation
- **THEN** Desktop mounts the exact owner management Root as the current Window scene
- **AND** the surface does not expose blank creation, a standalone Studio, or retained runtime Root

### Requirement: Creation binds one exact Project to a generic Creative Workspace

Creation SHALL materialize one generic Creative Workspace only after Host authorizes one exact Project identity and Workspace grant. The Workspace MAY expose zero or more Content, CharacterProject, WorldProject, and future owner-qualified targets at the same time without requiring a Content root or primary domain. Project SHALL own membership and output composition; each domain owner SHALL retain facts, validation, mutation, publication, and diagnostics.

#### Scenario: Project contains no Content target

- **WHEN** the selected Project contains one WorldProject and no Content or Character target
- **THEN** Creation opens the same generic Creative Workspace and exposes that exact World target
- **AND** it does not fabricate Content or reinterpret the Project as a World-specific Project kind

#### Scenario: One target is invalid

- **WHEN** one CharacterProject cannot be decoded while sibling Content and World targets remain valid
- **THEN** only the affected Character row and operations show an owner-qualified diagnostic
- **AND** sibling targets, Project navigation, and unrelated durable runtimes remain usable

<!-- SUCCESSOR: simplify-project-authoring-and-installed-libraries -->
> **Successor disposition (2026-08-15):** This capability now delegates its canonical product-entry semantics to the successor: Conversation/Creation navigation, non-durable default Assistant Draft, exact owner runtime launch, and Project-bound mixed-domain Creation.
