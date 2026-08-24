## ADDED Requirements

### Requirement: Character Interaction Workbench composes exact owner surfaces

A Character- or Room-owned Conversation SHALL render one Character Interaction Workbench with an Agent Interaction surface, one Main Presentation surface, one Character Context/Participant Manager and an optional bottom Timeline surface, all bound to the exact Conversation owner. Desktop SHALL compose only public owner-qualified surface refs and MUST NOT retain unrelated Roots, duplicate AgentSession state or copy domain facts into Window layout.

#### Scenario: Companion Dialogue opens

- **WHEN** an exact Companion Dialogue Conversation is created or restored
- **THEN** Workbench binds the character Agent Interaction, selected Presentation Main and Companion context manager to the same CharacterRun/Conversation owner
- **AND** Narrative Timeline, unrelated Character Roots and external business editors are not mounted

### Requirement: Main Presentation is exact and extensible by owning providers

Main SHALL consume one explicitly selected Character Presentation surface such as Avatar, authorized Web presentation, dynamic scene or Gameplay presentation when its owning provider supplies a qualified public ref. Failure or absence SHALL produce a local diagnostic and MUST NOT try another renderer, source, provider or active surface. Chara SHALL own Character representation selection and semantic refs but SHALL NOT own Web content, World state, Gameplay rules, engine runtime or external resource bytes.

#### Scenario: Selected VRM presentation opens

- **WHEN** the exact Character representation selects a qualified VRM surface
- **THEN** Desktop authorizes and mounts one VRM runtime in Main for the exact owner
- **AND** it does not also mount Live2D, portrait fallback or a second Avatar runtime in the interaction surface

#### Scenario: Gameplay presentation is unavailable

- **WHEN** a selected Gameplay presentation provider cannot resolve its exact surface ref
- **THEN** Main shows the provider-qualified unavailable diagnostic while Conversation and sibling Workbench surfaces remain usable
- **AND** Chara does not create gameplay state or switch to Avatar as a hidden success path

### Requirement: Companion Workbench exposes one Character lane and exact runtime context

Companion Workbench SHALL expose one Character submission lane with the exact CharacterVersion, effective Agent provider/model/configuration receipt and Agent-owned attached references. Its role manager SHALL configure provider/model and permitted standard Agent Skills/Tools for that exact CharacterRun Conversation through Agent public ports. It MUST NOT render a native/Assistant lane, create a second Conversation identity or read/write a global Character model setting. Standard Agent Skill/Tool/Approval projections MAY appear when enabled for that exact Conversation, without being reimplemented by Chara Webview. External materials SHALL remain removable per-turn context chips or an owner-qualified context list and MUST NOT become persistent Character authority by remaining mounted. Model output SHALL offer only explicit candidate/promotion actions owned by Chara authoring or memory services.

#### Scenario: User removes an attached source before submit

- **WHEN** the user removes one external-material ref from a Companion draft
- **THEN** that ref is absent from the next Character turn context while the Character/model selection and other refs remain unchanged
- **AND** no source record, memory or conversation history is deleted

#### Scenario: User selects another model for comparison

- **WHEN** the user chooses another exact provider/model in the role manager for a Character Conversation
- **THEN** later turns for that exact Conversation visibly use and freeze the selected Agent configuration
- **AND** existing turn receipts, sibling participants, CharacterVersion and unrelated Character Conversations remain unchanged

### Requirement: Narrative Workbench exposes bounded authored background

Narrative Workbench SHALL show the exact CharacterVersion, Storyline identity, StorylineVersion and selected StorylineNode plus its user-visible situation, time/location, Character/relationship state and knowledge boundary. Its role manager MAY configure provider/model for the exact participant through Agent public ports, but SHALL omit or disable Skill/Tool activation together with external-material attachment and CompanionMemory management. Model-hidden forbidden facts and author-only notes MUST NOT be rendered on a consumer surface unless an explicit authoring role projection permits them.

#### Scenario: Narrative node context is visible

- **WHEN** a consumer opens a Narrative Conversation at an exact node
- **THEN** the right manager identifies the frozen node/version and shows only its consumer-visible background constraints
- **AND** it offers no control that mutates the Storyline, imports daily long-term memory or successfully enables an Agent Skill/Tool

### Requirement: Timeline separates authored Storyline from Room events

Narrative SHALL expose a read-only Storyline Timeline for the exact selected StorylineVersion. Room MAY additionally expose its ordered RoomEvent Timeline. The UI SHALL label and render them as separate projections with separate owner identities; neither Timeline SHALL infer the other's progress, facts or completion.

#### Scenario: Narrative Room shows both timelines

- **WHEN** a Narrative Room has personal StorylineNode selections and committed RoomEvents
- **THEN** Workbench lets the user inspect per-Character Storyline structure separately from shared RoomEvent order
- **AND** clicking either projection does not write the other owner

### Requirement: Room participant manager projects independent runtime state

Room Context/Participant Manager SHALL identify every participant, controller, exact CharacterVersion, optional StorylineNode, primary AgentSession status, provider/model/TTS receipt, representation and scheduling eligibility using read-only projections or exact owner commands. It SHALL configure each participant's provider/model through the Agent public configuration port and SHALL expose Skill/Tool configuration only for Companion participants. A command affecting one participant SHALL NOT update siblings unless the user explicitly invokes a bounded batch operation, and no control SHALL write a global Character model or Chara-owned copy of Agent configuration.

#### Scenario: User pauses one Room participant

- **WHEN** the user invokes an authorized pause or takeover operation for one exact participant
- **THEN** the owning runtime applies it only to that participant and projects the new status
- **AND** sibling AgentSessions, messages, contexts and presentation configs remain unchanged

#### Scenario: User configures one Room participant

- **WHEN** the user changes one participant's exact provider/model or permitted Companion capability selection
- **THEN** the owning Agent configuration service applies it only to that participant's later turns and the manager projects the new receipt
- **AND** sibling participants, CharacterVersion, TTS/representation facts and existing turn receipts remain unchanged

#### Scenario: Dialogue participant manager avoids catalog chrome and raw identities

- **WHEN** the exact owner is one Character Dialogue
- **THEN** the manager renders one expanded Character participant with display name, immutable version label, mode, controller binding, Presentation summary and availability state
- **AND** it omits Room-only search/count chrome and never renders CharacterRun, CharacterVersion, participant or AgentSession identity as a user-facing label

#### Scenario: Room participant manager selects an exact participant

- **WHEN** the exact owner is a Room containing Character, human or system participants
- **THEN** the manager renders every participant, allows search and local detail selection, and joins Character details only through that participant's exact CharacterRun and CharacterVersion
- **AND** selection changes no runtime fact, missing exact authority fails visibly, and sibling details are not substituted

#### Scenario: Dialogue message renders its exact Character identity

- **WHEN** an assistant message is rendered for an exact Character Dialogue owner
- **THEN** the message lane renders the selected Character portrait and bounded profile facts from that owner's exact participant projection
- **AND** the Agent transcript event remains role-based, the user lane remains the local user, and no raw identity, path or resource ref is shown

#### Scenario: Room message avatar selects its exact participant

- **WHEN** a user activates the avatar of a Room message authored by one exact `authorParticipantId`
- **THEN** the right participant manager selects and reveals that same participant
- **AND** hover or keyboard focus alone changes no selection, Room fact, AgentSession, scheduling state or transcript event

#### Scenario: Selected portrait resource is unavailable

- **WHEN** the exact selected portrait representation is missing, stale or cannot be authorized for the active Character Scene
- **THEN** the affected avatar renders a neutral fallback and its profile card reports the portrait as unavailable
- **AND** sibling messages and participants remain usable without trying another representation, exposing a raw resource ref or reading a local path in Renderer

### Requirement: Workbench lifetime does not own business runtime

Leaving Character Interaction SHALL unmount its React Roots and release unprotected Presentation/Web/Game resources. Protected Agent turns, approvals and explicit external operations MAY continue under their exact runtime owners without retaining hidden UI. Reopen SHALL reconstruct surfaces from exact Conversation, Character/Room and provider refs rather than active/recent identities.

#### Scenario: User leaves while a Character turn is running

- **WHEN** navigation unmounts the Workbench during a protected Character Agent turn
- **THEN** visual Roots and unprotected presentation resources are released while the exact AgentSession remains active
- **AND** reopening the Conversation attaches to that owner without creating another CharacterRun or turn

### Requirement: Experimental implementation does not bypass product promotion

Package services, Workbench refs, deterministic fixtures and isolated Electron scenarios introduced by this capability SHALL remain behind the existing Character product promotion boundary until a later change records qualified real-provider, visible UI, repeated-behavior and user-data evidence. No feature flag, test-only route or persisted experimental scene may make production Character/Room entry successful.

#### Scenario: Package implementation is complete before promotion

- **WHEN** all deterministic Workbench tests pass but the production promotion gate remains active
- **THEN** production Character navigation and Entry launch continue to return the owner-qualified unavailable diagnostic
- **AND** prototype records and protected runtime remain preserved without mounting the Character Workbench
