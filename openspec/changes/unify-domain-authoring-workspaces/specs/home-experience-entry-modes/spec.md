## MODIFIED Requirements

### Requirement: Home modes configure the Agent Entry Draft

Desktop SHALL expose Assistant, Authoring, Character Dialogue, and World Experience in a segmented selector only inside the canonical Agent Entry Draft. Selecting a mode SHALL configure that Draft's intended interaction and required owner-qualified target configuration. It MUST NOT navigate to Creative Management, Project Management, Character Management, or World Management; create a Conversation, CharacterRun, Room, WorldRun, or WorldSave; infer an active record; or retain a hidden business Root.

#### Scenario: Fresh entry selects Assistant

- **WHEN** a Window opens the canonical unbound Agent Entry Draft
- **THEN** the selector projects Assistant as selected
- **AND** the user remains in the same Agent Entry Scene

#### Scenario: Authoring selection stays in the entry

- **WHEN** the user selects Authoring
- **THEN** the same Agent Entry displays exact Workspace and authoring-target configuration
- **AND** no management Scene intent or domain runtime materialization is emitted

#### Scenario: Character Dialogue selection stays in the entry

- **WHEN** the user selects Character Dialogue
- **THEN** the same Agent Entry displays Chara-owned published Character and optional storyline target configuration
- **AND** no Character Management or Character Studio Scene intent is emitted

#### Scenario: World Experience selection stays in the entry

- **WHEN** the user selects World Experience
- **THEN** the same Agent Entry displays World-owned published Experience, new/continue, participant, Save, and branch configuration supported by the exact owner
- **AND** no World Management or World Studio Scene intent is emitted

#### Scenario: Management and business Scenes have no entry selector

- **WHEN** Creative Management, a domain Studio, a Conversation, an Authoring Workspace, Character Interaction, or World Runtime is visible
- **THEN** the Agent Entry mode selector is not rendered
- **AND** that Scene keeps its own domain ownership and controls

### Requirement: Workspace requires explicit Project authority

Authoring mode SHALL expose an entry-composer chooser for an exact authorized Workspace and exact owner-qualified Content, Character, or World authoring target. The Workspace SHALL be selected through the canonical Host authorization path, and the target SHALL be selected or explicitly created through its owning domain port. Submit SHALL require binding receipts matching the current Draft, connection, Workspace identity/grant, target kind, and target identity.

#### Scenario: Authoring has no selected Workspace

- **GIVEN** Authoring mode is selected
- **WHEN** no existing Workspace or directory has been authorized
- **THEN** the input remains editable but submit is blocked with a Workspace-required diagnostic
- **AND** no Workspace, target, Conversation, or authority is inferred

#### Scenario: User selects a Content Project target

- **WHEN** the user selects an existing Content Project from the Authoring chooser
- **THEN** Host returns its exact Workspace identity/grant and the owning projection returns the exact Content authoring target
- **AND** the Draft receives matching receipts without leaving Agent Entry

#### Scenario: User selects a Character or World target

- **WHEN** the user selects an existing standalone or project-local CharacterProject or WorldProject
- **THEN** Host validates its exact Workspace authority and the owning domain validates its exact authoring target
- **AND** the Draft does not treat a Character/World target as a formal runtime binding

#### Scenario: User explicitly creates a target

- **WHEN** the user chooses new Content Project, standalone Character, standalone World, project-local Character, or project-local World from an authorized creation context
- **THEN** the owning application service creates the one canonical target and returns its exact binding only after the durable commit succeeds
- **AND** input text, model configuration, and unrelated records remain unchanged if creation fails

#### Scenario: Target selection is cancelled or fails

- **WHEN** Workspace or target selection is cancelled, stale, invalid, denied, or unavailable
- **THEN** the failure or incomplete state remains local and visible in Agent Entry
- **AND** other Workspaces, navigation, layout, input, and running tasks remain operable

### Requirement: Character and World remain owner-qualified

Character Dialogue SHALL use Chara-owned exact published CharacterVersion selection and launch configuration; one Character SHALL create a Dialogue and multiple Characters SHALL create a Room only when the canonical first-submit transaction commits. World Experience SHALL use World-owned exact published WorldExperienceVersion or exact existing Run/Save/branch launch configuration. Until the corresponding owner provider is qualified and composed, the affected mode MUST remain visibly unavailable and MUST NOT navigate to management, emit an ordinary Assistant/Authoring submit, encode a prompt, create a generic runtime, or invoke a fallback handler.

#### Scenario: Character provider is available

- **WHEN** the user selects one or more eligible published CharacterVersions and submits the first Character Dialogue input
- **THEN** the canonical transaction delegates exact Dialogue/Room and CharacterRun materialization to Chara before the first Agent turn
- **AND** it does not create an Assistant or Workspace Conversation for the same launch

#### Scenario: Character target provider is unavailable

- **WHEN** the user selects Character Dialogue before Chara launch configuration is composed
- **THEN** Character Dialogue remains selected in the same entry and submit is blocked with an owner-qualified diagnostic
- **AND** no Character search, management navigation, or durable mutation occurs

#### Scenario: World provider is available

- **WHEN** the user starts a new eligible World Experience or continues an exact Save/branch
- **THEN** the canonical transaction delegates Run/Save/participant materialization or restoration to the World owner and hands off to the exact runtime Scene
- **AND** no Assistant, Authoring Workspace, or Character fallback is created

#### Scenario: World provider is unavailable

- **WHEN** the entry selector is rendered before qualified World launch composition exists
- **THEN** World Experience is visibly unavailable with an owner-qualified description
- **AND** Assistant, Authoring, and qualified Character Dialogue selection remain available

## ADDED Requirements

### Requirement: Authoring and runtime modes use distinct target contracts

Authoring target configuration SHALL accept mutable Content, CharacterProject, and WorldProject identities under an exact Workspace authority. Character Dialogue and World Experience target configuration SHALL accept only their eligible published-version and runtime identities. Switching modes MUST clear incompatible authority receipts and references while preserving valid unsent text and model/execution presentation, and no target contract may be reinterpreted as another mode's authority.

#### Scenario: User switches from Character authoring to Character Dialogue

- **GIVEN** an Authoring Draft is bound to a CharacterProject and contains unsent text
- **WHEN** the user selects Character Dialogue
- **THEN** the text remains editable while the CharacterProject authoring receipt and writable references are cleared
- **AND** submit remains blocked until Chara supplies an exact eligible CharacterVersion launch target

#### Scenario: User switches from World Experience to Authoring

- **GIVEN** a Draft contains WorldExperienceVersion or Save launch configuration
- **WHEN** the user selects Authoring
- **THEN** runtime launch identities are cleared and an exact Workspace plus mutable authoring target is required
- **AND** the system does not open or mutate the WorldProject inferred from the Experience
