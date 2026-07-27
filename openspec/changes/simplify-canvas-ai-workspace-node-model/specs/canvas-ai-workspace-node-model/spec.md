## ADDED Requirements

### Requirement: Canvas exposes one minimal canonical node model

Canvas MUST persist and author only Markdown, Media, Group, Job, File, and CanvasEmbed node types. It MUST NOT register Storyboard, Narrative, Behavior, Entity, Memory, Scene, Shot, Artboard, Gallery, GeneratedAsset, Model, Script, Document, or Project as parallel production node types.

#### Scenario: Create content from an add surface

- **WHEN** a user selects Markdown, Image, Audio, Video, Group, File, or Subcanvas
- **THEN** Canvas creates or binds exactly one matching canonical node
- **AND** Image, Audio, and Video persist as Media with an explicit media kind
- **AND** Job is absent because Job nodes are projections of owned Jobs

#### Scenario: Open a new-format Canvas

- **WHEN** Canvas loads a current `.nkc`
- **THEN** every node discriminator belongs to the six-type canonical model
- **AND** an unknown or removed type fails validation instead of loading a legacy renderer

### Requirement: Canvas exposes one contextual add action catalog

Canvas SHALL expose Create, Import, and Reference action groups from one catalog shared by the left-toolbar add popover and Canvas context menu. Canvas MUST NOT keep a persistent right-side node-library Dock and MUST NOT expose Basic/Professional or subsystem loading modes.

#### Scenario: Render current catalog

- **WHEN** the user opens the left-toolbar add popover
- **THEN** Create contains Markdown and Group
- **AND** Import contains Image, Audio, and Video
- **AND** Reference contains File and Subcanvas
- **AND** no empty JobCard action is present
- **AND** Character is absent until a Character domain capability is registered

#### Scenario: Create an empty node

- **WHEN** a user selects Markdown or Group
- **THEN** Canvas creates the node at the visible viewport center
- **AND** no source picker is required

#### Scenario: Bind a source-backed node

- **WHEN** a user selects Image, Audio, Video, File, or Subcanvas
- **THEN** Canvas asks the Extension Host to select a real source
- **AND** it creates no node until source binding succeeds

#### Scenario: Open the Canvas context menu

- **WHEN** a user opens the background context menu
- **THEN** its add actions are projected from the same action catalog
- **AND** direct nodes are created at the pointer position

### Requirement: JobCard is a projection of an owned Job

A Job node MUST carry explicit Job identity and revision. Canvas MUST NOT own the Job queue, Agent session, provider runtime, cancellation lifecycle, or recovery state.

#### Scenario: Job state changes

- **WHEN** the owning Job service publishes a newer projection for the same job identity
- **THEN** Canvas updates the JobCard projection by revision
- **AND** stale, missing, or mismatched identity fails visibly

#### Scenario: User opens an add surface

- **WHEN** Canvas renders user-creatable actions
- **THEN** no action creates an unowned empty Job node

### Requirement: Connections use a minimal explicit relation set

Every persisted connection MUST have one of `sequence`, `reference`, or `derived-from`. Group membership MUST be represented only by Group `childIds`.

#### Scenario: Connect two nodes

- **WHEN** a user draws a connection without selecting a specialized action
- **THEN** Canvas creates a `reference` connection
- **AND** the connection remains selectable, labelled, directional, and editable

#### Scenario: Persist provenance

- **WHEN** a Job output is projected from stable input artifacts
- **THEN** Canvas creates deterministic `derived-from` connections
- **AND** it does not encode provenance as an association weight or free-form condition

### Requirement: Legacy Canvas data migrates once at the load boundary

Canvas MUST protect valuable local `.nkc` data through a deterministic, versioned migration into the canonical node model. Production authoring and rendering MUST NOT accept legacy types after migration.

#### Scenario: Load a legacy Canvas with convertible content

- **WHEN** a legacy node contains human-readable Markdown/text or a stable media/file reference
- **THEN** migration creates deterministic canonical nodes preserving that content and layout as far as possible
- **AND** subsequent saves contain only the current schema

#### Scenario: Load unsupported runtime-only legacy state

- **WHEN** a removed Narrative, Behavior, Entity, or Memory node cannot be represented without inventing semantics
- **THEN** migration returns an explicit diagnostic identifying the lost unsupported state
- **AND** Canvas does not activate a legacy subsystem or silently return success

### Requirement: Generic playback input preserves the full Preview workspace

Canvas Preview SHALL render Markdown, playable Media, and explicitly ordered Group content through the existing Preview workspace. The stage, route tabs, route/storyboard matrix, resize behavior, focus model, playback controls, progress state, and media surface handoff MUST remain available. Canvas MUST NOT infer Storyboard, branching narrative, Character runtime, or Job execution from arbitrary Markdown or node positions.

#### Scenario: Preview a Group

- **WHEN** a Group contains playable Media and Markdown children
- **THEN** the generic adapter builds an ordered `CanvasPlaybackPlan` from explicit child order and sequence relations
- **AND** the existing Preview stage and route/storyboard matrix consume that plan
- **AND** Job/File nodes are omitted with an explanatory diagnostic when selected as playable content

#### Scenario: Play audio or video in a VS Code Webview

- **WHEN** a Preview media surface starts playback
- **THEN** the Webview requests an Extension-authorized `@neko/media` session
- **AND** `NodeMediaRuntime` owns probe, native-video preparation, PCM creation, seek replacement, and disposal
- **AND** the Webview consumes the returned native `<video>` and PCM descriptors
- **AND** no Engine client, route, DTO, or fallback participates

### Requirement: Canvas add surfaces are localized

Canvas MUST localize add groups, action labels, dynamic status labels, tooltips, and accessibility names from stable message keys. English and Simplified Chinese bundles MUST have identical key sets.

#### Scenario: Switch the VS Code display language

- **WHEN** the Webview receives an English or Simplified Chinese locale
- **THEN** the add popover and Canvas context menu render in that locale
- **AND** persisted node data remains locale-neutral

#### Scenario: Translation key is missing

- **WHEN** a locale bundle omits a Canvas message key
- **THEN** localization parity validation fails
- **AND** the missing key is not accepted as a successful localized UI

### Requirement: Node simplification preserves generic authoring capabilities

Canvas MUST retain node transforms, lock state, property and port editing, connection selection/editing, Markdown source editing/rendering, media provenance presentation, and quick generation. Removing a specialized node discriminator MUST NOT remove these generic capabilities from canonical nodes.

#### Scenario: Edit canonical content

- **WHEN** a user selects a canonical node or connection
- **THEN** Canvas retains the applicable transform, property, port, label, type, copy, delete, Group, and Markdown editing actions
- **AND** non-editing Markdown uses the shared Markdown renderer

#### Scenario: Start quick generation

- **WHEN** a user invokes quick generation for one or more selected canonical nodes
- **THEN** Canvas sends explicit node identities and optional generation provenance to Agent
- **AND** Agent creates and runs the Job and owns provider, task, status, and output lifecycle
- **AND** Canvas does not invoke a Shot/Scene-specific executor or directly call a provider
