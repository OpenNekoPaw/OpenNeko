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

The Markdown Text Editor SHALL expose icon controls ordered `Source`, `Rich` and `Split`. Milkdown
SHALL own standalone Rich editing, CodeMirror 6 SHALL own complete source editing, and both SHALL use
the same exact Text Document session and accepted edit-sequence contract.

#### Scenario: User opens a Markdown document with fresh presentation state

- **WHEN** an admitted Markdown document opens without a valid saved presentation snapshot
- **THEN** the Text Editor starts in Rich mode with the source-backed document outline visible beside the content
- **AND** Source and Split remain explicitly available without adding a second command row below the Workbench tabs

#### Scenario: User edits in Rich and switches to Source

- **WHEN** Milkdown serializes a supported Rich transaction and the Text Document session accepts it
- **THEN** CodeMirror reconciles from that accepted source and edit sequence
- **AND** no Milkdown buffer, ProseMirror document or CodeMirror state becomes a second file authority

#### Scenario: User continues typing while a Rich edit is awaiting acceptance

- **WHEN** a newer Rich transaction is entered before an earlier exact edit-sequence command is accepted
- **THEN** the newer ProseMirror content, caret and selection remain stable while commands are serialized against successive accepted projections
- **AND** an intermediate acknowledgement does not replace the newer local document or replay it through another editor path
- **AND** rejection reports a document-local error and reconciles to the last accepted projection instead of presenting pending content as saved

#### Scenario: User enters one paragraph break at the end of Rich content

- **WHEN** one Enter transaction serializes trailing Markdown whitespace that parses without the empty trailing ProseMirror paragraph
- **THEN** acceptance of those exact bytes preserves the visible paragraph break, caret and selection without requiring another Enter
- **AND** subsequent paragraph text is submitted once against the accepted edit sequence and appears identically in Source
- **AND** a rejected command or different authoritative source still reconciles the local document instead of preserving stale presentation state

#### Scenario: Rich editing receives focus

- **WHEN** the user places the caret in the standalone Rich editor
- **THEN** the caret, selection and editable node state communicate focus without a page-sized border around the full document surface
- **AND** keyboard focus on discrete editor controls remains visibly indicated

#### Scenario: User edits in Split

- **WHEN** Source and Rich preview are both visible in Split
- **THEN** CodeMirror appears on the left and is the only mutable projection while the read-only Milkdown preview appears on the right
- **AND** a Source command applies once to the exact observed edit sequence and both projections reconcile from the accepted source
- **AND** stale commands fail visibly without replay, merge or fallback to the other engine

#### Scenario: Source temporarily contains incomplete Markdown

- **WHEN** the accepted source ends inside emphasis, link, fence, list or table syntax
- **THEN** Rich and Split keep the parseable document content visible and update from the same accepted source
- **AND** the unfinished construct may remain literal or locally incomplete without replacing the whole Rich surface with a failure state
- **AND** preview-only presentation never serializes normalized Markdown back to the Text Document session

#### Scenario: Rich mode cannot preserve a construct

- **WHEN** the current Markdown construct cannot round-trip through the declared Milkdown schema
  without semantic loss
- **THEN** the original source remains unchanged and Milkdown keeps a read-only projection visible while Rich mutation is unavailable with a document-local diagnostic and Source action
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
