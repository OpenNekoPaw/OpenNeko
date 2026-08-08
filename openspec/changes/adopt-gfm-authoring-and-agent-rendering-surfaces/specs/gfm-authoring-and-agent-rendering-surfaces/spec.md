## ADDED Requirements

### Requirement: OpenNeko exposes one portable GFM profile

OpenNeko SHALL define one package-owned GFM profile based on CommonMark and GFM 0.29-gfm for Markdown
files, Rich editing, source semantics and Agent text presentation. The profile SHALL NOT introduce a
user-visible Neko Markdown file format, and non-GFM extensions SHALL be declared separately.

#### Scenario: Standard GFM source is consumed across surfaces

- **WHEN** a source contains autolink literals, one- or two-tilde strikethrough, tables, task-list
  items, reference links and fenced code
- **THEN** the canonical semantic parser, Rich editor and Agent text renderer satisfy the same
  conformance fixture expectations
- **AND** no surface rewrites the source into MDX or a private Markdown dialect

#### Scenario: Source contains a product extension

- **WHEN** Markdown contains Mermaid, Math, footnote, mention or Workspace resource syntax
- **THEN** OpenNeko treats it as an explicitly registered extension with declared render and
  round-trip behavior
- **AND** absence or failure of that extension is visible and does not change the GFM profile

### Requirement: Workspace Markdown has one editor authority and two editing projections

The Markdown Text Editor SHALL expose `Rich`, `Source` and `Split` modes. Milkdown SHALL own Rich
editing, CodeMirror 6 SHALL own complete source editing, and both SHALL submit through the same exact
Text Document session and accepted edit-sequence contract.

#### Scenario: User edits in Rich and switches to Source

- **WHEN** Milkdown serializes a supported Rich transaction and the Text Document session accepts it
- **THEN** CodeMirror reconciles from that accepted source and edit sequence
- **AND** no Milkdown buffer, ProseMirror document or CodeMirror state becomes a second file authority

#### Scenario: User edits in Split

- **WHEN** either visible projection submits a change while both projections are mounted
- **THEN** the command applies once to the exact observed edit sequence and both projections reconcile
  from the accepted source
- **AND** stale commands fail visibly without replay, merge or fallback to the other engine

#### Scenario: Rich mode cannot preserve a construct

- **WHEN** the current Markdown construct cannot round-trip through the declared Milkdown schema
  without semantic loss
- **THEN** the original source remains unchanged and the affected Rich mutation is unavailable with a
  document-local diagnostic and Source action
- **AND** the editor does not drop, convert or normalize the unsupported content as success

### Requirement: CodeMirror remains the complete source and general text editor

Milkdown's CodeMirror-backed fenced-code component SHALL remain scoped to one code block. The Text
Editor SHALL retain its independent CodeMirror 6 surface for complete Markdown source and every
admitted non-Markdown text mode.

#### Scenario: User edits a fenced code block in Rich mode

- **WHEN** the Milkdown code-block component uses CodeMirror for syntax-aware block editing
- **THEN** only that fenced node is edited through the Rich transaction path
- **AND** the component does not replace the top-level Source editor or acquire document authority

#### Scenario: User opens another text format

- **WHEN** the user opens JSON, YAML, Fountain, TXT or HTML admitted by the Text Editor
- **THEN** the document uses the canonical CodeMirror source surface
- **AND** Milkdown and Agent presentation do not mount for that editing intent

### Requirement: Agent text uses one renderer from partial delta through finalization

The Agent Webview SHALL render an exact Timeline text content block through one package-owned
canonical surface from its first partial delta through its final state. Finalization SHALL NOT switch
to another Markdown renderer, and a failed presentation SHALL NOT invoke a candidate or alternate
renderer.

#### Scenario: Agent streams incomplete GFM

- **WHEN** a message ends temporarily inside emphasis, link, fenced code, table or list syntax
- **THEN** the same canonical surface renders a bounded mutable suffix while preserving stable block
  identity and visible content
- **AND** completion finalizes that surface without changing content-block identity or renderer path

#### Scenario: Historical final message is reopened

- **WHEN** the Agent Webview projects a persisted final text content block
- **THEN** it uses the same canonical component and GFM/extension policy as streaming text
- **AND** no static-only Markdown renderer participates

#### Scenario: Message rendering fails

- **WHEN** the canonical Agent text renderer cannot parse or present the current content block
- **THEN** the Webview displays a block-local diagnostic and preserves sibling Timeline blocks
- **AND** it MUST NOT return empty success or try the retired renderer, raw HTML path or alternate
  parser

### Requirement: Typed Agent blocks remain outside Markdown

Tool calls, approvals, artifacts, media and owning-domain results SHALL use their exact typed
presenters as siblings of text content blocks. The text renderer SHALL NOT infer these records from Markdown
or become their authority.

#### Scenario: Text streams beside a Tool call

- **WHEN** a Timeline contains an incomplete text block and a typed Tool/Approval/Artifact block
- **THEN** the canonical text renderer updates only the exact text block and the typed presenter retains its own
  identity and lifecycle
- **AND** failure in either block remains local and cannot reclassify the sibling

### Requirement: Markdown presentation is secure and source-backed semantics remain reusable

Raw HTML SHALL be inert by default, unsafe URL protocols SHALL be rejected, and Desktop resource
access SHALL require the existing authorized projection. Outline, references, diagnostics and Neko
extension semantics SHALL derive from `@neko/markdown` source-backed projections rather than renderer
DOM.

#### Scenario: Model output contains hostile markup or URL

- **WHEN** Agent text contains raw HTML, event attributes, scriptable URLs or an unauthorized local
  resource target
- **THEN** the exact presentation rejects or renders the content inert with a visible local diagnostic
- **AND** Electron, Node, filesystem and unapproved external navigation capabilities remain
  unavailable

#### Scenario: User navigates a Markdown outline

- **WHEN** the editor displays headings, references or diagnostics for the accepted source
- **THEN** navigation resolves through source ranges from the canonical semantic projection
- **AND** Milkdown DOM positions, Agent renderer elements and visual display columns are not persisted as
  document identity

### Requirement: Agent file authoring remains independent from presentation engines

An Agent SHALL create or change `.md` through the canonical Workspace-native file path with freshness
protection. Agent presentation, Milkdown and CodeMirror SHALL NOT publish the Agent artifact or convert its
Timeline output into a file mutation.

#### Scenario: Agent writes a Markdown artifact while the editor is open

- **WHEN** the native file Tool publishes a fresh `.md` change
- **THEN** a clean Text Document session reloads from authoritative bytes and a dirty session preserves
  its working source with an external-change conflict
- **AND** the Agent write is not represented as a Milkdown, ProseMirror or CodeMirror transaction
