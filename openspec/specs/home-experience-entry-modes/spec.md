# home-experience-entry-modes Specification

## Purpose
TBD - created by archiving change add-home-experience-entry-modes. Update Purpose after archive.
## Requirements
### Requirement: Home modes configure the Agent Entry Draft

Desktop SHALL expose Assistant, Workspace, Character, and World in a top-centered segmented selector only
inside the canonical Agent Entry Draft. Selecting a mode SHALL configure that Draft's intended domain binding
and entry presentation. It MUST NOT navigate to Project Management or Character Management, create a
Conversation or Run, infer an active record, or retain a hidden business Root.

#### Scenario: Fresh entry selects Assistant

- **WHEN** a Window opens the canonical unbound Agent Entry Draft
- **THEN** the selector projects Assistant as selected
- **AND** the user remains in the same Agent Entry Scene

#### Scenario: Workspace selection stays in the entry

- **WHEN** the user selects Workspace
- **THEN** the same Agent Entry displays Workspace target configuration
- **AND** no `open-project-management` Scene intent is emitted

#### Scenario: Character selection stays in the entry

- **WHEN** the user selects Character
- **THEN** the same Agent Entry displays Character availability or target configuration
- **AND** no `open-character-management` Scene intent is emitted

#### Scenario: Management and business Scenes have no entry selector

- **WHEN** Project Management, Character Management, a Conversation, Project Workspace, or Character Interaction is visible
- **THEN** the Agent Entry mode selector is not rendered
- **AND** that Scene keeps its own domain ownership and controls

### Requirement: Mode presentation and executable binding stay consistent

The Agent Entry mode MAY be restored as package-owned Draft presentation state, but executable authority SHALL
come only from the current launch catalog interaction binding and exact binding receipt. A mode/binding mismatch
MUST block submit with a visible local diagnostic. Invalid restored mode state SHALL reset only the affected Draft
to Assistant presentation and MUST NOT alter durable records.

#### Scenario: Restored Workspace presentation has no valid receipt

- **WHEN** a Workspace-mode Draft is restored without an exact current Workspace binding receipt
- **THEN** submit is blocked and the Workspace chooser remains available
- **AND** the system does not use an active or recent Workspace

#### Scenario: Invalid presentation mode is restored

- **WHEN** the entry snapshot contains an unsupported mode
- **THEN** only that Draft mode resets to Assistant with a diagnostic
- **AND** its valid input text and unrelated durable data remain unchanged

#### Scenario: Entry media model configuration is restored

- **WHEN** the Agent Entry Draft is rebuilt after a Scene or presentation remount
- **THEN** the launch catalog projects the configured default image, video, and audio generation model identities
- **AND** any valid Draft-local media model selections are restored with the unsent input instead of resetting to `none`
- **AND** an unavailable or stale media model remains visibly unselected without changing Provider configuration or another Draft

#### Scenario: Configured media models remain available without LLM token metadata

- **GIVEN** `config.toml` declares enabled image, video, and audio generation models with matching purpose capabilities and explicit defaults
- **WHEN** those media models omit LLM-only context-window or maximum-output-token metadata
- **THEN** the Agent Entry model catalog still exposes them as available generation choices
- **AND** the explicit image, video, and audio defaults are selected without an inferred fallback

#### Scenario: Media configuration does not expose a perception-model selector

- **GIVEN** the selected Agent model declares its native input capabilities
- **WHEN** the Agent Entry configuration menu opens
- **THEN** media categories expose only their Generation model choices and parameters
- **AND** no image, video, audio or generic perception-model selector is rendered
- **AND** Renderer does not read the config file, infer another provider/model or create a fallback purpose binding

### Requirement: Workspace requires explicit Project authority

Workspace mode SHALL expose an entry-composer chooser for exact Project selection or directory authorization.
The selected target SHALL be bound through the canonical launch `bind-target` operation. Submit SHALL require a
binding receipt matching the current Draft, connection, `workspaceId`, and `workspaceGrantId`.

#### Scenario: Workspace has no selected target

- **GIVEN** Workspace mode is selected
- **WHEN** no Project or directory has been authorized
- **THEN** the input remains editable but submit is blocked with a Workspace-required diagnostic
- **AND** no Draft authority or Conversation is inferred

#### Scenario: User selects a valid Project

- **WHEN** the user selects a Project from the entry chooser
- **THEN** Host returns its exact Workspace identity and grant
- **AND** the Draft receives a matching binding receipt without leaving Agent Entry
- **AND** the selected Project is presented in the composer's binding-context bar instead of a duplicate current-target card below the composer

#### Scenario: User authorizes a directory

- **WHEN** the user chooses a directory from the entry chooser
- **THEN** Host returns an opaque Workspace identity and grant
- **AND** raw filesystem path is not stored in Agent presentation state
- **AND** the authorized directory label is presented in the same composer binding-context bar

### Requirement: Entry binding context is consolidated below the composer

The Agent Entry composer SHALL present the directory-selection action together with selected Project,
directory, Character, and World bindings in one compact horizontal binding-context bar attached to the
bottom of the composer. Binding items SHALL be a read-only projection of the current Draft selection and
exact binding receipt. The bar MUST NOT become a second authority, retain a selection after its owner is
cleared, or duplicate the selected target in the chooser panel.

The same bar SHALL expose the exact selection entry for Authoring and Character Dialogue. World Experience
SHALL expose its World entry in a disabled, owner-qualified unavailable state until the World launch owner is
composed; it MUST NOT fabricate a World selection or successful binding.

Character Dialogue SHALL expose an explicit `Daily | Narrative` mode switch for both single-Character
Dialogue and multi-participant Room selection. The switch SHALL configure the strict Chara-owned mode
selection supplied by `character-conversation-modes`; it MUST NOT infer mode from Storyline, prompt,
active/recent state or external Composition availability. Until the Character product promotion gate is
removed by a later qualified change, both modes MAY remain visibly unavailable for production submit, but
their owner-qualified diagnostics MUST preserve the selected intent and MUST NOT downgrade Narrative to Daily.

#### Scenario: User selects Narrative in the entry draft

- **WHEN** the user selects Narrative for an exact Character or Room draft
- **THEN** the Draft keeps Narrative intent and exposes exact optional Storyline/Node configuration supplied by Chara
- **AND** no external Composition is required or inferred
- **AND** a closed product promotion gate blocks submit visibly without changing the selection to Daily

#### Scenario: Selected bindings share one composer bar

- **WHEN** an Entry Draft has one or more selected authoring or Character bindings
- **THEN** the composer bar shows each selected item with its owner-qualified label and kind
- **AND** clearing an item invokes the owning Draft configuration operation
- **AND** the chooser remains responsible only for browsing, selecting, and showing the selected option state

#### Scenario: Entry Draft has no selected binding

- **WHEN** the current Authoring Entry Draft has no selected Project, directory, Character, or World binding
- **THEN** the binding-context bar renders only the directory-selection action
- **AND** it does not reserve empty binding-item space

#### Scenario: Target selection is cancelled or fails

- **WHEN** target selection is cancelled, invalid, or denied
- **THEN** the failure or unbound state remains local and visible in Agent Entry
- **AND** other projects, navigation, layout, and input remain operable

### Requirement: Mode changes preserve text and isolate authority

Changing entry mode or Workspace target SHALL preserve the unsent input text and model/execution configuration.
References and chooser results that belong to the previous authority SHALL be cleared. Only the selector and target
chooser MAY be pending during binding; unrelated Window navigation and layout controls MUST remain enabled.

#### Scenario: User changes from Workspace to Assistant

- **GIVEN** a Workspace target and unsent text exist
- **WHEN** the user selects Assistant
- **THEN** the same text remains editable and the Draft becomes unbound/Assistant-compatible
- **AND** Workspace-only references and mention results are removed

### Requirement: Assistant preserves the canonical first-submit transaction

Assistant mode SHALL submit without Project or directory authority when input and model configuration are valid.
Every enabled mode SHALL use the single validation, exact binding receipt, Conversation commit, Scene handoff,
and provider execution transaction. No direct runtime call or alternate submit handler is allowed.

#### Scenario: Assistant submits without Workspace

- **GIVEN** Assistant mode has valid input and effective model configuration
- **WHEN** the user submits
- **THEN** the canonical transaction creates and attaches the configured Assistant Conversation
- **AND** no Project, active Workspace, or recent Workspace is required

#### Scenario: Submit validation fails

- **WHEN** mode, binding, input, resource, or model validation fails
- **THEN** no Conversation or Scene handoff is committed
- **AND** the textarea, Window navigation, and layout remain operable

### Requirement: Character and World remain owner-qualified

Until exact owner-provided target configuration exists, Character SHALL expose an unavailable diagnostic after
selection and World SHALL remain visibly disabled. Neither path may navigate to management, emit ordinary Agent
submit, create a generic Room/Run, encode a prompt, or use a fallback handler.

#### Scenario: Character target provider is unavailable

- **WHEN** the user selects Character before Chara target configuration is composed
- **THEN** Character remains selected in the same entry and submit is blocked with an owner-qualified diagnostic

#### Scenario: World provider is unavailable

- **WHEN** the entry selector is rendered before World composition exists
- **THEN** World is visibly disabled with an owner-qualified description
- **AND** Assistant, Workspace, and Character selection remain available

### Requirement: Replaced navigation paths are absent

Production code SHALL have no Desktop Home mode presenter that maps modes to management Scene intents and no
mode selector on management Scenes. The removed `start-chat | roleplay` Home action, `bind-agent-assistant`
Window intent, and `bind-assistant` launch operation SHALL remain absent.

#### Scenario: Entry mode does not use a management navigation path

- **WHEN** the user changes Assistant, Workspace, or Character mode in Agent Entry
- **THEN** the current Draft configuration is updated through the canonical launch binding path
- **AND** no Project Management or Character Management Scene intent is emitted
