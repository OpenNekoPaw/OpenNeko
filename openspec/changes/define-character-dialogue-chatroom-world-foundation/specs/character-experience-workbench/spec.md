## ADDED Requirements

### Requirement: Character management uses catalog and detail surfaces

The system SHALL expose Character Management as one Window navigation scene whose Main surface owns a searchable Character catalog and whose Secondary Main surface shows the selected Character detail. It SHALL NOT expose Character, Dialogue, Chatroom and World as peer product tabs or retain their hidden Roots.

#### Scenario: User selects a Character

- **WHEN** the user selects a valid CharacterProject in the catalog
- **THEN** the exact project detail shows its draft, published versions, representations and run summaries
- **AND** the catalog and detail surfaces meet edge-to-edge with one Workbench-owned separator and no scene gutter or outer margin
- **AND** no Dialogue, Room or World runtime is created merely by selection

#### Scenario: One Character record is invalid

- **WHEN** an invalid Character record appears beside valid records
- **THEN** the catalog keeps that record visible with its diagnostic and disables dependent detail actions
- **AND** valid Character details and unrelated scenes remain available

### Requirement: Agent Entry character mentions select the conversation owner

The Agent Entry SHALL treat one or more selected published CharacterVersions as a typed launch selection rather than prompt text or an ordinary context chip. One Character selection SHALL create a Dialogue owner; multiple Character selections SHALL create a Room owner. No selection SHALL retain the ordinary Agent Entry path.

#### Scenario: User mentions one Character on first submit

- **WHEN** the user selects one valid CharacterVersion and submits the first message
- **THEN** Chara atomically creates the exact CharacterRun, DialogueRun and character-owned Agent Conversation before the message is submitted
- **AND** the resulting scene binds that exact Conversation and Run without an active or recent fallback

#### Scenario: User mentions multiple Characters on first submit

- **WHEN** the user selects two or more compatible CharacterVersions and submits the first message
- **THEN** Chara atomically creates a durable CharacterRoom, RoomRun, isolated participant CharacterRuns and room-owned Agent Conversation
- **AND** every agent participant receives its own primary AgentSession identity

#### Scenario: A selected Character cannot launch

- **WHEN** any selected CharacterVersion is unpublished, invalid, duplicated or incompatible with the requested narrative World authority
- **THEN** first submit returns a visible launch diagnostic and creates no partial Run, Room or Conversation
- **AND** it does not reinterpret the Character as an ordinary prompt mention

### Requirement: Character conversations use an exact Workbench composition

A character- or room-owned Conversation SHALL open a Character Interaction Workbench with Agent Interaction, Avatar/Scene Main, Character/World Manager and optional Timeline surfaces bound to the same exact owner identities.

#### Scenario: Character Dialogue opens

- **WHEN** a valid character-owned Conversation is created or restored
- **THEN** Agent Interaction binds its exact Conversation, Main binds its exact CharacterVersion representation and Manager binds its exact CharacterRun and optional World authority
- **AND** adjacent Workbench surfaces compose edge-to-edge without Character-scene margins or gutters
- **AND** unrelated Character, Room or World Roots are not mounted

#### Scenario: User leaves an active Character Workbench

- **WHEN** the user navigates away while a protected Agent turn remains active
- **THEN** all Character Workbench React Roots unmount while the exact Agent/Run runtime remains protected
- **AND** reopening binds the same owner identities and reconstructs presentation from authority plus the minimal snapshot

### Requirement: Avatar representations use an exact renderer

Each CharacterVersion MAY bind stable portrait, Live2D, VRM, MMD or PNGTuber representation references. The Avatar application path SHALL select the exact user-chosen representation and exactly one matching renderer. It SHALL NOT try another format or source after failure.

#### Scenario: A VRM Character appears in Main

- **WHEN** the selected CharacterVersion has a valid user-selected VRM representation and the VRM renderer is available
- **THEN** the Workbench Main mounts one VRM runtime using Host-authorized resource descriptors
- **AND** the Renderer never receives a raw local path or creates a second Character/Agent authority

#### Scenario: The representation renderer is unavailable

- **WHEN** a Character references an unsupported or unavailable representation renderer
- **THEN** only the Avatar Surface shows an exact diagnostic
- **AND** Agent Interaction, Character management and sibling records remain usable without portrait or first-compatible fallback

### Requirement: Runtime management remains a projection over domain owners

Character detail and Workbench Manager SHALL present relationship memory, Dialogue/Room runs, Agent transcript status, narrative story/save/branch and Avatar presentation state as a rebuildable projection over their exact owners. The projection SHALL NOT become a unified Character Session or writable duplicate authority.

#### Scenario: User inspects a narrative Character run

- **WHEN** the user opens one exact narrative CharacterRun
- **THEN** the manager shows its exact Agent Conversation, WorldSave, branch, Room membership and representation state
- **AND** continuing or branching requires an explicit operation against those identities rather than selecting recent state

#### Scenario: A presentation snapshot is invalid

- **WHEN** saved viewport, pose or layout state cannot be decoded
- **THEN** only that Character Workbench surface resets to its canonical fresh presentation with a diagnostic
- **AND** CharacterVersion, relationship memory, transcript, Room timeline and WorldSave remain unchanged
