## Why

The current implementation routes Fountain creation and scene replacement through screenplay-specific
Agent Tools and an Agent Conversation-owned `TextDocumentSession`. That makes an ordinary portable
content file depend on an OpenNeko editor/application interface, while the same Agent already has
Workspace-scoped native file Tools. It also leaves the inverse boundary implicit: the generic file
Tools can address Canvas `.nkc` and Cut `.otio` even though those files encode cross-field spatial and
timeline invariants owned by their domains.

OpenNeko needs one explicit classification based on content authority, not file syntax: content-source
documents use native Agent file authoring, while structured, spatial and timeline project documents use
their owning-domain query and revisioned authoring interfaces.

## What Changes

- Make Workspace content-source documents, including Markdown, Fountain and admitted plain text,
  directly readable and writable through the canonical Agent core file path.
- Keep `TextDocumentSession` Window-owned. Agent writes do not open an editor session, apply editor
  commands or require a mounted Text Editor Root.
- Retire the screenplay-specific inspect/create/replace Tools, prompt fragment, Tool names and Agent
  Conversation document-owner shape. Fountain remains a portable text format; its parser provides
  diagnostics and projections after file changes but is not the mutation gate.
- Classify Canvas `.nkc`, Cut `.otio` and future structured/spatial project formats as protected domain
  documents. Generic Agent file read/write MUST reject their contents; Agent access uses the exact
  Canvas/Cut query and revisioned authoring capability instead.
- Preserve headless structured authoring: Canvas/Cut operations do not require an active Webview, and
  capability failure cannot fall back to raw JSON or generic file Tools.
- Update deterministic path tests and the external Agent Evaluation suite so native Fountain file
  authoring is the positive path and generic access to protected project documents is the negative path.

## Capabilities

### New Capabilities

- `agent-native-content-file-authoring`: Workspace-authorized native Agent reads and writes for
  portable content-source documents, with file changes driving editor, parser, Search and Preview
  projections.
- `agent-structured-project-authoring-boundary`: Protected structured/spatial/timeline project
  documents are queried and changed only through exact owning-domain capabilities.

### Modified Capabilities

- `workspace-text-document-authoring`: Text Document sessions remain Window editor state and treat
  Agent file writes as external Workspace changes; they are not an Agent mutation API.

## Impact

- `@neko/agent-runtime` keeps the canonical Workspace-scoped core file Tools and removes the
  screenplay capability provider, prompt fragment and registration path. Its file access policy gains
  an exact protected-project classification with no default/wildcard handler.
- `@neko/agent-contracts` removes the screenplay-specific Tool names after all producers, consumers,
  fixtures and Evaluation assertions switch atomically.
- `@neko/text-editor-domain` removes the Agent Conversation owner and screenplay-specific creation
  service. Window editing, dirty buffers, fingerprint-CAS save and external-change diagnostics remain.
- `@neko/screenplay-domain` remains the sole Fountain parser and source-range projection owner, but
  owns no Agent writer and does not reject or repair Agent-authored bytes before publication.
- `@neko/canvas-domain` and `@neko/cut-domain` remain the only structured project mutation owners;
  their public query/authoring paths stay usable without a Renderer.
- `apps/neko-desktop` continues to bind Workspace authority, file access and package capabilities. It
  does not add a content-editor mutation router or inspect structured project JSON.
- Existing files are not migrated. Native content writes are visible as real file changes; dirty
  editor conflicts preserve the in-memory user buffer. Protected project capability failure cannot
  expose or overwrite raw `.nkc`/`.otio` bytes.
