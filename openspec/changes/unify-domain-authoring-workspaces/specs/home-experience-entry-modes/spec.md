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

### Requirement: Entry contextual selection is distinct from global navigation and message references

The application sidebar SHALL remain the Window-level navigation catalog for Projects, Conversations, Characters, and Worlds. The global Draft Entry SHALL retain its existing segmented mode selector. One collapsible current-mode resource/action component below the Composer SHALL expose only content and operations qualified for the selected mode and SHALL NOT duplicate or replace mode switching. The component SHALL be expanded by default whenever the selected mode has qualified content and SHALL remain user-collapsible. Its collapsed header SHALL remain lightweight and MAY show an exact selected-target summary, but SHALL NOT show submit-blocked, empty-library, or unavailable-mode prose. Its expanded body SHALL use a responsive card grid for executable Agent catalog Skills, owner-qualified materials, Projects, and direct candidate selection. Each card SHALL retain a stable media/title/metadata/action structure so a future owner-projected authorized thumbnail can be added without changing interaction layout; absent thumbnail data SHALL use only a neutral type icon or empty media slot and MUST NOT infer or expose a raw path. The grid MUST NOT infer records from active/sidebar/recent/mounted state. Authoring SHALL expose directory authorization as a separate Composer-toolbar action that calls only the Host authorization port; its default-expanded body SHALL load and display all currently accessible Content Projects, every project-local CharacterProject and WorldProject in those Projects, and all standalone CharacterProject and WorldProject records together in one horizontal-first card grid. It MUST NOT require a Project/card click to fetch or reveal child candidates, render Project/Character/World category buttons that open a second candidate menu, or render an inline creation form. The aggregate catalog read MUST preserve exact owner and Workspace identities without creating a writable Draft binding for unselected resources, and one Project/owner read failure MUST leave sibling cards visible with a local diagnostic. New target creation SHALL remain in the owning management or Workbench flow. New Room configuration SHALL remain a Character-version multi-selection rather than an inferred existing Room. Authoring and Character Dialogue SHALL mount their owner target chooser only while the current-mode component is expanded; selecting either mode is explicit demand and MAY open it by default. When a mode has no qualified content, its empty body MAY collapse, disable, or be omitted without a prose prompt. An Authoring Workspace, Assistant Conversation, Character Dialogue/Room, or World Runtime SHALL NOT inherit the global Entry component and SHALL render only owner-defined mode information or local operations, omitting that surface when the owner provides none. The Entry component SHALL configure only the current Draft and MUST NOT duplicate the full management catalog, navigate as a side effect of target selection, create a retained Workbench, or become a cross-domain writable catalog. Per-message file, asset, and entity references SHALL remain removable chips above the Composer and MUST NOT be reinterpreted as persistent Draft authority.

#### Scenario: Authoring opens contextual target selection

- **WHEN** the user activates the Authoring target control in Agent Entry
- **THEN** the Composer toolbar exposes directory authorization while an inline detail below it simultaneously shows every currently accessible exact Project, project-local Character/World, and standalone Character/World resource card without a category submenu or a Project-first reveal step
- **AND** selecting one configures the current Draft without changing the Window navigation Scene

#### Scenario: Character Dialogue opens contextual target selection

- **WHEN** the user activates the Character Dialogue target control in Agent Entry
- **THEN** the same inline quick-action frame shows the Chara-owned eligible published Characters, optional storyline, and new Dialogue/Room configuration
- **AND** it does not reinterpret Character management rows or message references as launch authority

#### Scenario: Sidebar navigation remains independent

- **WHEN** an Entry quick-action detail is open while the sidebar projects global domain records
- **THEN** the sidebar continues to navigate exact durable records and Scenes
- **AND** closing or switching the quick-action detail does not mutate, duplicate, archive, or remove those records

#### Scenario: A materialized business instance omits global Entry actions

- **WHEN** the Draft becomes an Assistant Conversation, Authoring Workspace flow, Character Dialogue/Room, or World Runtime
- **THEN** the global Entry quick actions and any expanded owner body are unmounted
- **AND** the resulting Scene shows only its exact owner's mode information and local operations, or no auxiliary surface when none is defined

#### Scenario: Assistant Entry shows only catalog-qualified global actions

- **WHEN** the global Draft Entry is in Assistant mode and the Agent catalog exposes executable Skills
- **THEN** up to the presentation limit are shown as global quick actions below the Composer
- **AND** selecting one only prefills its explicit invocation without sending or creating a Conversation

#### Scenario: Existing runtime continuation requires an exact owner catalog

- **WHEN** the owner exposes an existing Dialogue, Room, Run, Save, or branch as a continuation target
- **THEN** the quick-action detail may offer `continue` and an explicit secondary Workbench navigation action using that exact identity
- **AND** no continuation or Workbench action is inferred from a project, publication, recent row, mounted Scene, or active identity

### Requirement: Entry quick actions adapt in normal flow without changing authority

The global Draft Entry SHALL keep its existing mode selector plus one centered current-mode title above the Composer. The title SHALL use a prominent 28px welcome-heading scale comparable to the Codex Entry hierarchy while remaining below an oversized page-level Hero scale. The mode selector SHALL use the compact shared-control density, a 480px maximum width, and the same 12px type scale as adjacent interface controls. It SHALL NOT render an explanatory subtitle, status paragraph, bordered introduction card, or Skill suggestion bubble above the Composer. The Composer SHALL remain minimal and SHALL NOT visibly embed target catalogs, selected-project summaries, Character/World choices, materials, or submit-blocked diagnostic copy; it MAY expose the one Authoring-only directory authorization action. Submit MAY remain disabled when canonical validation fails, but Entry SHALL NOT repeat that validation as visible prose in the Composer, title area, or collapsed component header. Authoring catalog loading SHALL keep the stable Project/Character/World action row without inserting transient loading prose that changes the component height; owner failures SHALL remain explicit diagnostics. The centered Entry composition SHALL account for the title, Composer, and visible current-mode component as one normal-flow group so the Composer is not displaced toward the lower viewport by an asymmetric flexible row. The component below SHALL use the same content track, default to expanded when qualified content exists, expose one accessible expand/collapse trigger, and let its body wrap and grow naturally for every available width without consulting presentation breakpoints. The component MUST NOT create a right Overlay, drawer, sheet, backdrop, or reserved side column, and MUST NOT resize or horizontally reposition the Composer. Resizing or folding SHALL NOT clear or replace the selected target, exact receipt, unsent Draft text, model/execution presentation, or owner facts. Switching to an incompatible mode or leaving the global Draft Entry SHALL unmount the current owner body without retaining a hidden business Root.

#### Scenario: Resize preserves the configured Draft

- **GIVEN** an exact Authoring or Character Dialogue target is selected
- **WHEN** the Entry container changes between narrow and wide widths
- **THEN** the target summary and exact receipt remain unchanged
- **AND** only the quick actions and inline detail reflow naturally

#### Scenario: Expanding the resource component preserves Composer geometry

- **GIVEN** the mode selector, empty-state content, and Composer have been laid out in Agent Entry
- **WHEN** the current-mode resource/action component opens, closes, or reflows
- **THEN** the Composer keeps its content track, width, and internal layout
- **AND** the detail extends below the action row without reserving a right column or covering the input

#### Scenario: Inline detail height follows its visible content

- **WHEN** the current owner body contains less content than the Entry's available height
- **THEN** the inline detail ends after that content instead of stretching to a viewport or Entry edge
- **AND** the Entry scroll container exposes denser content without introducing a nested full-height panel

#### Scenario: Mode change unloads the previous owner body

- **WHEN** the user changes from Authoring to Character Dialogue or another incompatible mode
- **THEN** the previous contextual body and pending query are unmounted or cancelled locally
- **AND** the canonical mode-switch rules preserve unsent text while clearing only incompatible receipts and references

#### Scenario: Runtime workbench keeps its own right manager

- **WHEN** Character Interaction, World Runtime, or another non-Entry Scene with an owner-defined right manager is visible
- **THEN** the Agent Entry quick-action frame is absent
- **AND** the Scene's owner-defined right manager remains the only right-side domain surface

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
