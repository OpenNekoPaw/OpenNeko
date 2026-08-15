## ADDED Requirements

### Requirement: Agent Entry exposes only Conversation and Creation

OpenNeko SHALL present Conversation and Creation as the only visible choices in the existing Agent Entry selector while preserving the existing primary Desktop sidebar. Conversation SHALL configure interaction from exact global Character and World versions. Creation SHALL select one exact Project and add it to the Composer context bar without navigating to the Project Workspace or creating a durable Conversation.

#### Scenario: User selects a Project for Creation

- **WHEN** the user chooses one exact accessible Project from Creation
- **THEN** Agent Entry retains that Project in the Composer context bar and remains in the Agent scene
- **AND** it does not open the Project Workspace, infer a domain target or create another Project

#### Scenario: User enters Conversation without selections

- **WHEN** the user chooses Conversation without a Character, World or durable Assistant Conversation
- **THEN** Agent Entry presents the canonical unbound Assistant Draft
- **AND** it does not infer a recent Project, Character, World, Room or Run

### Requirement: Conversation composes global Character and World selections

Conversation SHALL allow zero or more exact global Character versions and at most one exact global World version to be selected at the same time. One Character SHALL launch Character Dialogue, multiple Characters SHALL launch Room, and any selected World SHALL launch World Experience with the selected Characters as exact participants. Workspace-local objects, invalid global versions and display-name/current/latest inference MUST NOT launch runtime.

#### Scenario: User selects multiple Characters and a World

- **WHEN** the user confirms one exact World version and multiple exact Character versions
- **THEN** World Runtime launches one World Experience with those exact participants
- **AND** Character selection remains multi-select while World selection remains single-select

#### Scenario: Selected global version is invalid

- **WHEN** one selected Character or World version fails owner eligibility or dependency validation
- **THEN** only the requested launch is rejected with an owner-qualified diagnostic
- **AND** no alternate version, workspace object, empty runtime or default participant is substituted

### Requirement: Assistant supports direct global Character and World creation

The unbound Assistant SHALL expose `character-creator` and `world-creator` through ordinary `$` Skill invocation. After standard Tool approval, Chara or World SHALL atomically create one global object and its first immutable version. The Assistant MUST NOT require or infer a Project, create a hidden workspace object, run workspace synchronization, or display Skill cards in the entry selector.

#### Scenario: Assistant creates a global Character

- **WHEN** the user invokes `character-creator` in an Assistant Conversation and approves one valid proposal
- **THEN** Chara creates one global Character and its first immutable version
- **AND** the response identifies it as a global Character by user-visible name without exposing internal identities, lifecycle labels or field counts

#### Scenario: Assistant creates a global World without Project authority

- **WHEN** the user invokes `world-creator` in an Assistant Conversation without a Project context and approves one valid proposal
- **THEN** World creates one global World and its first immutable version
- **AND** no Project, workspace object, synchronization record or recent/active Project fallback is created

### Requirement: Interaction panels remain bound to the current owner

Character Dialogue, Room and World Experience SHALL expose Agent interaction, owner presentation and a searchable manager list as independently visible regions. The manager SHALL show only exact participants or branches from the current lifecycle owner and MUST NOT open or switch Conversations. It SHALL remain an auxiliary dock and MUST NOT replace the primary region. Visibility SHALL be disposable presentation state; at least one region SHALL remain visible.

#### Scenario: Character has no configured visual representation

- **WHEN** the current Dialogue or Room has no configured visual representation
- **THEN** the initial layout shows Agent as the primary region beside the Character manager dock
- **AND** it does not mount an empty presentation region or expand the manager into Main

#### Scenario: User toggles panel visibility

- **WHEN** the user activates an accessible pressed-state visibility button
- **THEN** Desktop recomposes only the current scene and rejects hiding its final visible region
- **AND** the exact Dialogue, Room, Run, Save and participant identities remain unchanged
