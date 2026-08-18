## Context

`projectWorkspaceCanvasTurnTarget` currently returns `undefined` for the logical Board. `ConversationController` only attaches `canvasTurnTarget` when it is not `undefined`, so Board turns never receive the Board prompt section. Draft selection is stored in controller state while each Conversation Tab keeps its own `workspaceCanvasSelectionId`; nothing copies the selected Draft target into the new Tab store. `ChatWorkspace` loads the Canvas catalog in an effect that depends on the whole `composerWorkspace` object, which DesktopShell recreates on each projection, causing clear/reload churn during streaming.

## Goals / Non-Goals

**Goals:**

- Treat Workspace Board as an explicit canonical target in every Turn layer.
- Preserve exact Draft Canvas selection when the Draft becomes a Conversation Tab.
- Keep Canvas catalogs loaded across streaming re-renders for the same Workspace identity.
- Make Canvas catalog order deterministic.

**Non-Goals:**

- Changing UI appearance, entry points, selectors, or interaction design.
- Changing Developer Mode Bash, which remains an explicit opt-in exception.
- Changing generic Agent file-tool path input or Host filesystem authorization; that is owned by `canonicalize-agent-file-path-input`.
- Migrating persisted user data or adding internal version fields.

## Decisions

### 1. Board is an explicit AgentCanvasTurnIntent

`projectWorkspaceCanvasTurnTarget` returns `{ workspaceId, target: boardTarget }` for the Board option. The existing `AgentCanvasTurnIntent` and `CanvasWorkspaceTurnContext` already support Board without a summary; the controller already resolves Board context and the prompt already has a Board section. This removes the "Board means no target" ambiguity.

### 2. Draft-to-Tab selection handoff is exact and one-shot

The controller records the exact `workspaceCanvasSelectionId` used by a successful Draft submission in a conversation-keyed handoff map. When a Tab runtime for that conversation becomes available, the controller applies that value to the Tab render store exactly once. Board handoff uses `workspace-board`; exact Canvas handoff uses its canonical `canvasId`. There is no active/current/recent fallback.

### 3. Catalog loading is keyed to Workspace identity

Both `ChatWorkspace` and the controller keep a ref to the latest `composerWorkspace` object and run the catalog effect only when the Workspace identity changes. The effect no longer clears an already-loaded catalog on every render. DesktopShell may still create new projection objects, but those do not trigger reloads.

### 4. Canvas index order is deterministic

`CanvasWorkspaceIndexService.readCatalog` sorts exact Canvas identities with a stable locale-aware comparison before reading summaries and building options. The logical Board remains first.

### 5. Selected Canvas narrows the current Turn query contract

`AgentAppHost` derives a model-facing Tool projection from the frozen `CanvasWorkspaceTurnContext`. For the four read-only Canvas query operations, `document_path` is constrained to an exact one-value enum: the canonical Board path or the selected exact `canvasId`. The selected-Canvas prompt names `canvas_list_nodes`, `document_path`, and that exact value, while generic `Read` explicitly excludes `.nkc` and `.otio` project documents.

This projection does not add a handler or execution path: the Canvas capability provider and authoring service remain the only query owner. It does not constrain mutation Tools because Canvas selection is read context, not authoring authority; mutation remains receipt-bound. A Turn without `CanvasWorkspaceTurnContext` keeps the ordinary Canvas query schema and cannot inherit a previous selection.

| Owner / role          | Canonical path                       | Producer                            | Consumer                                        | Runtime boundary           | Replaced path                                                            | User-data impact |
| --------------------- | ------------------------------------ | ----------------------------------- | ----------------------------------------------- | -------------------------- | ------------------------------------------------------------------------ | ---------------- |
| `@neko/agent-webview` | ChatWorkspace/ConversationController | composer selection, Draft submit    | Tab render store, controller Turn request       | Renderer                   | undefined Board projection and Draft/Tab state split                     | none             |
| `@neko/canvas-domain` | canvas-workspace-index-service       | exact Canvas document index         | Canvas catalog consumer                         | host-neutral Node/domain   | filesystem/readdir order                                                 | none             |
| `@neko/agent-runtime` | Turn-bound Canvas Tool projection    | frozen `CanvasWorkspaceTurnContext` | provider-facing Canvas query schemas and prompt | host-neutral Agent runtime | unconstrained selected-Canvas query arguments and generic Read ambiguity | none             |

## Risks / Trade-offs

- [DesktopShell object identity remains unstable] → Webview effects no longer depend on object identity for catalog reload; this is safe because Workspace identity is the actual resource key.
- [Exact Canvas selection may reference a deleted document by the time Tab appears] → Tab receives the exact stored id; the selector will surface unavailable exactly instead of falling back to Board.
- [Canvas selection could be mistaken for write authority] → Only read-only query schemas are narrowed; mutation Tools continue to require the exact authoring receipt and current fingerprint.
