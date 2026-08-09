## ADDED Requirements

### Requirement: Home exposes explicit product experience modes

The Home launch surface SHALL expose Assistant, Workspace, Character, and World as four product
experience modes that are distinct from Agent execution mode. Each Window SHALL retain exactly one
Entry Draft, and changing experience mode SHALL update only that Draft's presentation and exact
target binding without creating a Conversation or domain Run.

#### Scenario: Fresh Home defaults to Assistant

- **WHEN** a Window opens Home without a valid saved experience mode
- **THEN** the Entry Draft selects Assistant as the canonical fresh presentation state
- **AND** the same Draft identity remains authoritative

#### Scenario: Mode switch does not create a business instance

- **WHEN** the user switches among Assistant, Workspace, Character, and World before first submit
- **THEN** no Conversation, CharacterRun, RoomRun, or WorldRun is created
- **AND** existing background tasks and previously created instances remain unchanged

#### Scenario: Experience and execution modes remain distinct

- **WHEN** the Home Entry Draft is visible
- **THEN** the experience selector and canonical Plan, Approve, and Auto execution selector are both available
- **AND** changing either selector does not silently change the other

### Requirement: Assistant submission does not require Workspace authority

The Assistant experience SHALL allow first submit from an unbound or exact Assistant-compatible
Launch Draft when the selected model configuration and input are valid. It MUST NOT require or infer
a Project, directory, active Workspace, or recent Workspace.

#### Scenario: Assistant submits without a Project

- **GIVEN** the Entry Draft is in Assistant mode with valid input and effective model configuration
- **AND** no Workspace target is selected
- **WHEN** the user submits
- **THEN** the canonical Agent Draft submit path materializes the configured Assistant Conversation
- **AND** no active, current, or recent Workspace is consulted

#### Scenario: Stale Workspace binding blocks Assistant submit

- **GIVEN** the presentation selects Assistant but the authoritative Draft remains bound to Workspace
- **WHEN** the user attempts to submit
- **THEN** the current submit is rejected with a local binding diagnostic
- **AND** no Conversation is created through an unbound or Assistant fallback

### Requirement: Workspace submission requires an exact authorized target

The Workspace experience SHALL require an exact Project/Workspace target selected through the
existing Project or directory authorization path. First submit MUST validate the target's
`workspaceId`, `workspaceGrantId`, current Draft binding receipt, and effective model configuration
before creating a Conversation.

#### Scenario: Workspace has no selected Project or directory

- **GIVEN** the Entry Draft is in Workspace mode
- **AND** no exact Workspace target is selected
- **THEN** the composer keeps the input editable
- **AND** the send action is disabled with a diagnostic that asks the user to choose a Project or directory

#### Scenario: Authorized Project or directory is ready

- **GIVEN** the user selected a Project or directory through the Host-authorized chooser
- **AND** the authoritative Draft binding and receipt exactly match its Workspace identity and grant
- **AND** input and model configuration are valid
- **WHEN** the user submits
- **THEN** the canonical Workspace Draft submit path materializes the exact Workspace Conversation
- **AND** the raw filesystem path is not stored in Renderer presentation

#### Scenario: Workspace binding is stale or mismatched

- **GIVEN** the selected target and authoritative Draft binding differ by identity, grant, or receipt
- **WHEN** the user attempts to submit
- **THEN** the submit is rejected before Conversation materialization
- **AND** the system does not retry with an active Project, another grant, or an unbound Conversation

#### Scenario: Directory authorization is denied

- **WHEN** the user denies or fails the current directory authorization request
- **THEN** only the current Workspace Draft remains blocked with a visible diagnostic
- **AND** the Window Shell, input editor, sibling Conversations, and unrelated Workspace records remain usable

### Requirement: Validation blocks only the consequential submit action

Missing target, pending binding, unavailable owner, or invalid model configuration SHALL disable the
send action while preserving input editing, mode selection, navigation, and layout interaction. The
composer SHALL expose the same concise reason visually and through the send control's accessible
description.

#### Scenario: User edits while Workspace is incomplete

- **GIVEN** Workspace mode lacks an authorized target
- **WHEN** the user types, edits, or changes execution mode
- **THEN** those presentation actions remain available
- **AND** only submit is blocked

#### Scenario: Binding update is pending

- **WHEN** an exact Workspace binding update is in progress
- **THEN** send remains disabled until the authoritative binding projection matches
- **AND** the textarea and Window layout are not disabled

### Requirement: Character and World remain owner-qualified unavailable

Until their authoritative launch providers are composed, Character and World modes SHALL present an
owner-qualified unavailable state and MUST NOT call ordinary Agent Draft submit, synthesize a domain
binding, or encode the requested experience as prompt text.

#### Scenario: Character mode is selected before Chara launch is available

- **WHEN** the user selects Character
- **THEN** the surface identifies the required Chara-owned published CharacterVersion and Dialogue or Room launch path
- **AND** submit cannot create an Assistant or Workspace Conversation

#### Scenario: World mode is selected before World launch is available

- **WHEN** the user selects World
- **THEN** the surface identifies the required World-owned WorldExperienceVersion and Run launch path
- **AND** submit cannot create a generic chatroom or prompt-template fallback

### Requirement: Entry presentation restores without becoming authority

The Agent Webview SHALL persist the selected experience mode only as package-owned Entry Draft
presentation. Invalid or missing presentation state SHALL reset locally to Assistant while preserving
the same Draft, valid unsent input, and durable records. Workspace authority SHALL always be rebuilt
from the canonical Draft binding and current Host grant.

#### Scenario: Existing snapshot has no experience mode

- **GIVEN** a valid Entry Draft snapshot contains unsent input but no experience mode
- **WHEN** Home is restored
- **THEN** Assistant is selected as the canonical default
- **AND** the unsent input remains available

#### Scenario: Persisted Workspace label has no valid binding

- **GIVEN** presentation remembers a Workspace label or target reference
- **AND** the current authoritative Draft has no matching binding receipt
- **WHEN** Home is restored
- **THEN** Workspace submit remains blocked until the exact target is rebound
- **AND** the remembered presentation cannot authorize content or submission
