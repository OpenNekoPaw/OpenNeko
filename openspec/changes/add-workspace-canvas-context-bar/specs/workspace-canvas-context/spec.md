# Spec: Workspace Canvas Context

## ADDED Requirements

### Requirement: Workspace Canvas composer context bar

Workspace Agent composer SHALL render its own context rail as a sibling above the composer shell.

- The rail SHALL display only the stable Workspace label and current Canvas index.
- The rail SHALL NOT display read/write status, scope, or permission information.
- File, material, Canvas node references, and attachments SHALL remain inside the composer shell.
- The logical default Canvas option SHALL be the canonical Workspace Board.

#### Scenario: Conversation context rail above composer

- **WHEN** a Workspace Conversation is active
- **THEN** its context rail appears above the composer shell
- **AND** the rail shows Workspace label and current Canvas index (default Board).

#### Scenario: references stay inside composer

- **WHEN** file, material, Canvas node references, or attachments are present
- **THEN** they remain inside the composer shell
- **AND** they are not merged into the Workspace Canvas context rail.

#### Scenario: context rail matches the Entry visual treatment

- **WHEN** the Workspace Canvas rail is visible
- **THEN** it matches the established Entry context rail width, spacing, background, shadow, and radius
- **AND** it does not render as a rectangular edge-attached region.
- **AND** it does not share the Entry component, functional class, state, or event handlers.

#### Scenario: exact Canvas keeps its file extension

- **WHEN** an exact Canvas appears in the selector
- **THEN** its visible label is the workspace-relative file name including `.nkc`
- **AND** its internal Canvas name remains summary metadata rather than replacing file identity.

#### Scenario: double-click opens selected Canvas

- **WHEN** the user double-clicks the currently selected exact Canvas
- **THEN** Desktop opens or focuses the exact Canvas Workbench View through the existing creative-document authority
- **AND** double-clicking the logical Board default does not eagerly create `workspace.nkc`.

#### Scenario: Workspace initial input shows context before first turn

- **WHEN** a Workspace-bound Agent interaction has not created its Conversation yet
- **THEN** the composer shows the Workspace Canvas context rail before any Conversation exists
- **AND** it loads the exact Workspace Canvas catalog through the same Workspace authority used after Conversation creation
- **AND** the first submitted turn preserves the selected Canvas target.
- **AND** it does not read, persist, configure, or submit Entry Draft state or an Entry target receipt.

#### Scenario: Workspace rail width and radius do not change Entry binding rail

- **WHEN** the Workspace Canvas rail adopts its full-width rounded presentation and the Canvas selector fits its content
- **THEN** the Entry binding rail remains unchanged
- **AND** the Workspace rail remains aligned to the composer width rather than shrinking to its content
- **AND** Workspace-specific radius rules do not apply to the Entry rail.

### Requirement: Canvas selection is composer/turn state

Canvas selection SHALL be composer presentation state or exact turn intent.

- Canvas selection SHALL NOT be written into `AgentDomainBinding`.
- Canvas selection SHALL NOT become a message reference.
- Switching Canvas SHALL affect only subsequent turns.
- Existing Workspace Conversation binding SHALL remain fixed when Canvas index changes.

#### Scenario: Conversation Canvas switch does not change owner

- **WHEN** a user changes Canvas index before sending in an existing Workspace Conversation
- **THEN** the conversation owner and Workspace binding remain unchanged
- **AND** only the next turn uses the newly selected Canvas.

#### Scenario: turn captures exact selection

- **WHEN** a turn is submitted with a selected Canvas
- **THEN** that turn uses the selected Canvas
- **AND** a later Canvas switch does not re-route the already submitted turn.

### Requirement: Canonical Board default without eager creation

The logical default Canvas SHALL be the canonical Workspace Board.

- Selecting or entering a Workspace Conversation SHALL NOT create `workspace.nkc`.
- The canonical Board identity SHALL be the primary Canvas index for the turn.
- When the request relates to Canvas content or may be answered by it, the Agent SHALL query the
  canonical Board before exploring unrelated Workspace files or directories.
- A missing Board query SHALL remain read-only, SHALL NOT create the Board, and SHALL NOT treat the
  missing Board as an empty successful result.
- An empty Board SHALL only be lazy-created when an existing eligible creator-visible typed artifact delivery occurs.
- Ordinary conversation, reasoning, and logs SHALL NOT write to the Board.

#### Scenario: default display does not create board

- **WHEN** the composer displays the Board as the default Canvas option
- **THEN** no `workspace.nkc` file is created.

#### Scenario: canonical Board index is queried first

- **WHEN** the logical Board is selected and the user asks a request that relates to or may be answered by Canvas content
- **THEN** the turn prompt identifies the canonical Board identity as the primary Canvas index
- **AND** the Agent queries that exact Board through the registered Canvas capability before exploring unrelated Workspace files or directories
- **AND** a missing Board remains absent and does not become an empty successful result.

#### Scenario: lazy create only for typed artifact

- **WHEN** a turn produces an eligible creator-visible typed artifact and no Board exists
- **THEN** the Canvas owner lazy-creates `workspace.nkc`
- **AND** the artifact is written to the Board.

#### Scenario: no board write for text-only turns

- **WHEN** a turn produces only ordinary conversation, reasoning, or logs
- **THEN** no Board or Canvas file is created or written.

### Requirement: Selected Canvas precise read and write

When a specific Canvas is selected, the turn SHALL use that Canvas as the exclusive delivery target.

- The turn boundary SHALL read only the light index/summary of the selected Canvas.
- Full Canvas content SHALL only be read when the Agent task actually needs it.
- The selected exact Canvas SHALL be the primary creative context for the turn.
- When the request relates to Canvas content or may be answered by it, the Agent SHALL query the
  selected exact Canvas before exploring unrelated Workspace files or directories.
- The Agent SHALL NOT use generic file, directory, or shell operations to rediscover or read the
  selected `.nkc` document.
- Eligible typed artifacts SHALL be written precisely to the selected Canvas.
- The system SHALL NOT mirror the canonical Board to the selected Canvas.
- The system SHALL NOT infer a Canvas from active/recent Canvas.

#### Scenario: light summary only at turn boundary

- **WHEN** a turn starts with a selected Canvas
- **THEN** only that Canvas light index/summary is read for turn context
- **AND** the full Canvas document is not injected into every turn.

#### Scenario: selected Canvas is queried before Workspace exploration

- **WHEN** an exact Canvas is selected and the user asks a request that relates to or may be answered by its content
- **THEN** the turn prompt identifies that exact Canvas as the primary creative context
- **AND** the Agent queries that exact Canvas through the registered Canvas capability before exploring unrelated Workspace files or directories
- **AND** an unrelated request does not force the full Canvas document to load.

#### Scenario: precise artifact delivery

- **WHEN** a turn with a selected Canvas produces an eligible typed artifact
- **THEN** the artifact is written to the selected Canvas
- **AND** no Board mirror write occurs.

### Requirement: Fail-visible and fail-local Canvas handling

Invalid or missing Canvas SHALL be rejected at the owning boundary with a clear diagnostic.

- The rejection SHALL apply only to the current selection/request.
- The system SHALL NOT fall back to Board, active Canvas, recent Canvas, or empty success.
- Unrelated records, instances, capabilities, and workspaces SHALL remain usable.

#### Scenario: invalid Canvas selection

- **WHEN** a user selects a Canvas identity that is invalid or no longer exists
- **THEN** the composer shows a diagnostic and disables send for that selection
- **AND** the system does not route to the Board or another Canvas.

#### Scenario: sibling isolation

- **WHEN** one Canvas selection fails
- **THEN** other conversations, workspaces, and composer functions remain usable.

### Requirement: Renderer sandbox and typed host boundary

Canvas catalog/read/turn-target SHALL be exposed only through a minimal typed Desktop IPC projection.

- Renderer SHALL NOT scan files or access Node/Electron.
- Desktop Main SHALL authorize by exact workspace grant.
- The path SHALL have a single canonical contract/owner/handler/projection.

#### Scenario: typed projection only

- **WHEN** the Renderer needs Canvas catalog or summary
- **THEN** it calls the package-owned typed port
- **AND** no filesystem or Node API is available to the Renderer.

### Requirement: Single canonical path

The change SHALL maintain one canonical contract/owner/handler/projection path.

- No active/recent fallback, implicit workspace, version field, multi-path, or compatibility branch SHALL be introduced.
- No alternative success path SHALL exist for the same Canvas intent.

#### Scenario: no fallback path

- **WHEN** Canvas index catalog read fails
- **THEN** the owning boundary returns a diagnostic
- **AND** no second provider/source/canvas is attempted.
