## ADDED Requirements

### Requirement: Workspace Board is an explicit canonical Canvas turn target

When a Workspace Canvas presentation selects the logical Workspace Board, the renderer SHALL produce an `AgentCanvasTurnIntent` whose target is the Board target. The controller SHALL resolve Board turn context and SHALL include the Board prompt section for the Turn. No active/current/recent fallback is allowed.

#### Scenario: Draft is sent with Board selected

- **WHEN** a Workspace Draft is submitted with `selectedId` equal to `workspace-board`
- **THEN** the Draft submit request contains `canvasTurnTarget` with `target.kind` equal to `workspace-board`
- **AND** the controller resolves that exact Board context before composing the Turn prompt

#### Scenario: Exact Canvas is sent

- **WHEN** a Workspace Draft or Conversation message is sent with an exact Canvas selected
- **THEN** the request contains the exact Canvas target and light summary
- **AND** the controller resolves that exact Canvas context without falling back to Board

### Requirement: Selected Canvas queries are bound to the exact Turn target

For a Turn with `CanvasWorkspaceTurnContext`, the Agent runtime SHALL project every read-only Canvas query Tool with `document_path` constrained to the exact selected Workspace-relative Canvas identity. The Turn prompt SHALL name `canvas_list_nodes`, `document_path`, and the same exact identity. Generic file Tools SHALL NOT be presented as a valid `.nkc` query path. Canvas selection SHALL NOT grant mutation authority.

#### Scenario: Board query contract is projected

- **WHEN** the Turn context selects the logical Workspace Board
- **THEN** the provider-facing `canvas_list_nodes.document_path` enum contains only `neko/boards/workspace.nkc`
- **AND** the Turn prompt instructs `canvas_list_nodes` with that exact `document_path`

#### Scenario: Exact Canvas query contract is projected

- **WHEN** the Turn context selects exact Canvas `test.nkc`
- **THEN** the provider-facing read-only Canvas query Tools accept only `document_path` equal to `test.nkc`
- **AND** generic `Read` remains available for ordinary UTF-8 text but excludes `.nkc` and `.otio`

#### Scenario: No Canvas context is selected

- **WHEN** a later Turn has no `CanvasWorkspaceTurnContext`
- **THEN** its Canvas query schema has no exact-path enum from a prior Turn
- **AND** the system prompt has no selected-Canvas section

### Requirement: Draft Canvas selection hands off to the exact new Conversation Tab

When a Draft submission creates a Conversation Tab, the controller SHALL copy the exact Draft-time `workspaceCanvasSelectionId` into that Tab render store exactly once.

#### Scenario: Draft creates a Conversation Tab

- **WHEN** a Draft submit succeeds and a Tab runtime is registered for the returned Conversation
- **THEN** the Tab store `workspaceCanvasSelectionId` equals the selection used by the Draft submit
- **AND** no subsequent ordinary render resets that selection to Board

#### Scenario: No handoff exists

- **WHEN** a Conversation Tab is opened from history or another source
- **THEN** the Tab store retains its existing per-Tab selection
- **AND** the controller does not inject a stale Draft selection

### Requirement: Canvas catalog loads are stable across streaming re-renders

Canvas catalog loading SHALL key on Workspace identity, not on the projection object identity. A re-render with a new `composerWorkspace` object for the same Workspace SHALL NOT clear or reload an already loaded catalog.

#### Scenario: Streaming message re-renders the conversation

- **WHEN** a conversation receives streaming render updates while the Workspace identity is unchanged
- **THEN** the Canvas catalog stays loaded
- **AND** `loadCanvasCatalog` is not called again

#### Scenario: Workspace identity changes

- **WHEN** the Workspace identity changes
- **THEN** the previous catalog is cleared and the new Workspace catalog is loaded
- **AND** selection resets only for the exact Workspace change
