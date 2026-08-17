## ADDED Requirements

### Requirement: Streamdown is the only Agent Markdown renderer

The Agent Webview SHALL render every production `assistant_text` and `thinking` Markdown block with the
pinned `streamdown` 2.5.0 component. Streaming text SHALL use `mode="streaming"`; final text SHALL use
`mode="static"`. The Agent Webview SHALL NOT instantiate `MarkdownStreamingSession`, register an
`AgentMarkdownSessionRegistry`, render a package-local normalized Markdown node tree, or switch between
an old and new renderer.

#### Scenario: Streaming and final text use the same renderer

- **WHEN** an Agent text block streams incomplete Markdown and later reaches final content
- **THEN** both the streaming and final renders are produced by the same `Streamdown` component
- **AND** no fallback renderer, feature flag, old/new registration, or static-final alternate path is
  consulted.

#### Scenario: Long and continued lists across many appends

- **WHEN** a streaming Markdown list is extended through many small appends
- **THEN** Streamdown keeps completed list blocks stable and continues the active list suffix
- **AND** the renderer does not reparse source through a package-local streaming session.

#### Scenario: Incomplete constructs remain visible

- **WHEN** streaming Markdown ends inside incomplete emphasis, link, fence, table, list, or CJK text
- **THEN** Streamdown renders a visible partial block or caret suffix
- **AND** the renderer does not drop the incomplete suffix or replace it with a failure document.

#### Scenario: Old Agent Markdown session path is absent

- **WHEN** production Agent Webview code is searched for `MarkdownStreamingSession`,
  `AgentMarkdownSessionRegistry`, `stableEndOffset`, or `agent-markdown-session`
- **THEN** no production import, registration, export, or test target for the old path remains.

### Requirement: Streamdown defaults and security hardening are preserved

The Agent Webview SHALL compose Streamdown's default remark/rehype plugins, default sanitize, and
default harden behavior with Neko custom plugins. Custom plugins SHALL NOT remove or weaken the default
GFM, sanitize, or harden pipeline. URLs SHALL be rendered only when they are `http`, `https`, `mailto`,
same-page fragments, or already-authorized Workspace render URIs. Raw paths, `blob:`, cache keys, and
private handles SHALL NOT become stable resource identities.

#### Scenario: Malicious HTML and unsafe URLs are inert

- **WHEN** Markdown contains raw HTML such as scripts/event handlers and URLs such as `javascript:` or
  `data:text/html`
- **THEN** the rendered output does not execute the HTML or create an unsafe navigation target
- **AND** sanitize/harden defaults remain active with the custom Neko plugins present.

#### Scenario: Authorized Workspace resources are projected

- **WHEN** final Agent Markdown references an authorized image, audio, or video Workspace resource
- **THEN** the existing authorized projection supplies the display URI
- **AND** the Markdown renderer preserves the exact Markdown source while rendering only the
  authorized URI.

#### Scenario: Desktop cold start resolves Streamdown dependencies

- **WHEN** Desktop starts with a cold Vite dependency cache and loads the Agent Webview root
- **THEN** Streamdown and its raw HTML parser dependencies resolve through their package-owned graph
- **AND** the Agent Webview root loads without a dynamic-import or dependency-prebundle failure.

### Requirement: Markdown presentation failures are block-local

A Markdown presentation failure in one Agent text block SHALL be caught at the block boundary and SHALL
render a compact block-local diagnostic. It SHALL NOT fail sibling Timeline blocks, other
conversations, or projection attachment protocol. The renderer SHALL NOT silently recover by switching
renderer, retrying, or falling back to raw text.

#### Scenario: One Markdown block throws during render

- **WHEN** one Markdown block throws while a sibling Markdown block and a typed sibling block are valid
- **THEN** only the failing block is replaced by a block-local diagnostic
- **AND** the sibling blocks remain visible
- **AND** no projection attachment protocol fatal is emitted for the presentation failure.

### Requirement: Typed siblings stay outside Markdown

Typed artifacts, tools, approvals, creative tables when typed, and domain results SHALL remain typed
sibling Timeline blocks rendered by their owning presenters. The Markdown renderer SHALL NOT infer
structured composite fences, Mermaid diagrams, or creative table semantics from Markdown text.
Agent contracts and runtime collection SHALL NOT infer typed artifacts from NEKO or JSON fenced blocks
inside assistant Markdown. Mermaid fences SHALL remain ordinary code blocks and SHALL NOT activate a
Mermaid feedback, retry, or SVG-download protocol.

#### Scenario: Structured content arrives as a typed sibling

- **WHEN** an Agent turn contains a typed composite artifact, tool result, approval, or typed creative
  table in addition to Markdown text
- **THEN** the typed block renders through its typed sibling presenter
- **AND** the Markdown renderer does not parse or project that typed content from the Markdown source.

#### Scenario: Fenced JSON remains ordinary Markdown

- **WHEN** assistant Markdown contains a NEKO or JSON fenced block resembling a composite artifact
- **THEN** it remains ordinary Markdown code content
- **AND** neither runtime collection nor Webview presentation promotes it into a typed artifact
- **AND** typed artifact validators continue to validate only artifacts received through the typed
  contract.

#### Scenario: Mermaid fence has no hidden protocol

- **WHEN** assistant Markdown contains a Mermaid fenced block
- **THEN** Streamdown presents it as a standard fenced code block
- **AND** no Mermaid error feedback, retry turn, or SVG-download message can be sent or handled.
