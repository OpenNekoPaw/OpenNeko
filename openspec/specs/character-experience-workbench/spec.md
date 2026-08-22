# character-experience-workbench Specification

## Purpose
TBD - created by archiving change define-character-dialogue-chatroom-world-foundation. Update Purpose after archive.
## Requirements
### Requirement: Character product surfaces remain unavailable before roadmap promotion

The production Desktop SHALL keep Character Studio, Character Runtime and Agent Entry Roleplay explicitly unavailable until a later promotion change records the required real-user, repeated-behavior and end-to-end-loop evidence. Package-owned records, services, scene contracts and UI roots MAY remain available to isolated prototype fixtures, but their existence MUST NOT make a production route successful.

#### Scenario: User opens Character navigation before promotion

- **WHEN** a user invokes Character navigation from a production Desktop Window
- **THEN** Host returns an owner-qualified unavailable diagnostic and preserves the current scene
- **AND** no Character Root is mounted and no durable Character or Room record is changed

#### Scenario: User invokes Roleplay before promotion

- **WHEN** a user selects Roleplay from Agent Entry
- **THEN** the Webview shows an explicit unavailable diagnostic before any Character search or launch request
- **AND** no CharacterRun, Room, AgentSession or first turn is created

#### Scenario: Desktop restores an old experimental Character scene

- **WHEN** a Window contains a persisted Character Management or Character Interaction presentation
- **THEN** Host replaces only that presentation with a fresh canonical Agent Entry scene and reports a presentation-reset diagnostic
- **AND** Character records, conversations, transcripts and protected background runtime remain owned and unchanged

### Requirement: Character management uses catalog and detail surfaces

The system SHALL expose Character Studio as one Window navigation scene whose approximately 30% Main surface owns a searchable, filterable and collapsible Character catalog and whose approximately 70% Secondary Main surface shows the selected Character detail. Detail navigation SHALL cover overview, background story, origin setting, cognition/behavior, Character storyline, Character/relationship memory, presentation resources, voice, runtime summaries and published versions. It SHALL NOT expose external authoring/runtime domains as peer Chara tabs, retain their hidden Roots or embed writable external editors.

#### Scenario: User selects a Character

- **WHEN** the user selects a valid CharacterProject in the catalog
- **THEN** the exact project detail shows its background story, origin setting, draft, published versions, Character storylines, Character/relationship memory, representations, voice and exact run summaries
- **AND** the catalog and detail surfaces meet edge-to-edge with one Workbench-owned separator and no scene gutter or outer margin
- **AND** no Dialogue, Room or external runtime is created merely by selection

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

- **WHEN** any selected CharacterVersion is unpublished, invalid or duplicated
- **THEN** first submit returns a visible launch diagnostic and creates no partial Run, Room or Conversation
- **AND** it does not reinterpret the Character as an ordinary prompt mention

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
