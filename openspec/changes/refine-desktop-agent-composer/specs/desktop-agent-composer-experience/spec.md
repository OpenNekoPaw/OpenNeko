## ADDED Requirements

### Requirement: Agent mode uses one compact composer control layer

The Agent Webview SHALL place the Agent session mode, unified model configuration, explicit command/Skill entry, execution mode, and send action in one compact composer control layer. It MUST NOT expose an internal LLM category labelled as a second peer mode beside Agent. Direct image, video, and audio generation modes SHALL continue to expose the parameters required for their current request.

#### Scenario: Open an empty Agent conversation in Desktop

- **WHEN** the package-owned Agent Root renders an empty conversation with `desktop-dock` presentation
- **THEN** the creator sees one compact composer toolbar without a separate persistent `Agent / Dialogue / Understanding / Creativity` rail

#### Scenario: Switch to direct video generation

- **WHEN** the creator selects the direct video generation session mode
- **THEN** the composer still exposes the selected video model, ratio, resolution, and duration controls

### Requirement: One model menu projects exact purpose selections

The Agent composer SHALL provide one model configuration menu organized by chat, image, video, and audio categories. Chat SHALL select exactly one primary LLM. Each media category SHALL distinguish understanding from generation and SHALL select at most one exact provider/model reference for each purpose. The menu MUST NOT provide model-pool multi-selection, select-all, first-compatible routing, or implicit main-model fallback.

#### Scenario: Configure image purposes

- **WHEN** the creator opens the image category and selects an image understanding model and an image generation model
- **THEN** the existing understanding and generation selection callbacks receive their separate exact option identities

#### Scenario: Select automatic understanding

- **WHEN** the creator selects automatic image understanding
- **THEN** the Webview keeps the `auto` presentation selection and leaves exact default-purpose resolution to the existing Host configuration path

#### Scenario: Model configuration is locked during a run

- **WHEN** the foreground Agent conversation is executing
- **THEN** the unified model menu and its model/parameter selections are disabled and cannot mutate the in-flight turn snapshot

### Requirement: Execution modes explain the existing permission contract

The execution-mode menu SHALL expose exactly planning, approval, and automatic modes with concise descriptions of their side-effect behavior. It MUST NOT expose a full-access mode or claim that Webview selection bypasses runtime deny rules, trust, containment, or approval policy.

#### Scenario: Review execution choices

- **WHEN** the creator opens the execution-mode menu
- **THEN** each of planning, approval, and automatic modes displays a distinct description and the current selection is identifiable

#### Scenario: Choose automatic mode

- **WHEN** the creator chooses automatic mode
- **THEN** the existing execution-mode callback receives `auto` and no permission rule or Tool policy is modified by the Webview

### Requirement: Desktop empty state suggests only available Skills

The Desktop Agent empty state SHALL display a bounded set of enabled Skills from the Host-projected Skill catalog when such Skills are available. Selecting a suggestion SHALL prepare an explicit Skill invocation in the entry composer and MUST NOT auto-send, auto-activate, install a file, or fabricate an unavailable Skill.

#### Scenario: Enabled Skills are available

- **WHEN** the Desktop empty state receives more than four enabled Skills
- **THEN** it displays at most four stable suggestions derived from that catalog

#### Scenario: Select a suggested Skill

- **WHEN** the creator selects one suggested Skill
- **THEN** the entry composer receives an explicit `$<skill-name>` invocation and the message remains unsent

#### Scenario: No enabled Skills are available

- **WHEN** the Desktop empty state receives no enabled Skills
- **THEN** it renders the normal creator prompt without placeholder or hard-coded Skill suggestions

### Requirement: Presentation changes do not create another Agent authority

Desktop Dock and any future Home or Focus presentation SHALL remain projections of the same package-owned Agent Root and Host runtime. Presentation state MUST NOT create another conversation store, provider registry, permission policy, model router, or active-conversation fallback.

#### Scenario: Render the Desktop Dock presentation

- **WHEN** Desktop mounts `AgentWebviewRoot` with the existing Host adapter and explicit conversation identity
- **THEN** compact composer presentation consumes the same Host messages, conversation state, model catalog, Skill catalog, and Tool approval lifecycle
