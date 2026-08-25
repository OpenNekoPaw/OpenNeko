# markdown-workspace-references-and-media-embeds Specification

## Purpose
Define portable Workspace references and authorized media embedding across Markdown authoring and presentation surfaces.
## Requirements
### Requirement: Markdown Source provides canonical context-aware assistance

The Text Editor SHALL derive Markdown Source completion ranges and portable insertion text from
`@neko/markdown`. It SHALL offer bounded GFM snippets and Workspace reference triggers without
introducing an LSP, a private Markdown format or a second edit path.

#### Scenario: User requests a GFM snippet

- **WHEN** the caret is in an eligible Markdown source position and the user requests completion
- **THEN** the editor offers syntax-valid GFM snippets with an exact replacement range
- **AND** accepting one snippet submits one edit through the exact Text Document session sequence

#### Scenario: Caret is inside a non-reference source region

- **WHEN** `@`, `[[` or `![[` appears inside inline code, fenced code or raw HTML
- **THEN** semantic Workspace completion is not offered for that token
- **AND** the source remains ordinary editable text without being rewritten

#### Scenario: IME composition is active

- **WHEN** the user is composing CJK text in Markdown Source
- **THEN** completion and semantic replacement wait until the composition commits
- **AND** the committed composition remains one canonical Text Document edit

### Requirement: Mentions and resources resolve through one exact Workspace catalog

Markdown mention and resource candidates SHALL be produced by one Workspace-qualified Text Editor
catalog contract. A result SHALL remain bound to the exact Workspace, document and request identity
and SHALL NOT fall back to active/recent resources or the Agent composer catalog.

#### Scenario: User completes a unique mention

- **WHEN** the user types `@` followed by a query and selects one exact candidate
- **THEN** the editor inserts the declared portable mention text and retains the candidate's stable
  owner reference only in the disposable resolution projection
- **AND** the operation does not attach Agent context or mutate another document

#### Scenario: Trigger selects its owning catalog subset

- **WHEN** the user types `@`, `[[` or `![[` in an eligible source position
- **THEN** `@` offers active Project entities, `[[` offers portable Workspace files and linked Project
  Media Library content, and `![[` offers only embeddable image/audio/video content
- **AND** candidates are grouped and labeled by their declared source without inferring identity from
  a filename or exposing a host path

#### Scenario: Global library content is not Project-portable

- **WHEN** a Global Asset Library item or unlinked Media Library record has no Project-owned portable
  locator
- **THEN** it is not offered as a successful Markdown reference or embed
- **AND** the user must explicitly link or add it to the Project before the canonical catalog can
  return it

#### Scenario: Resource trigger contains an extra opening bracket

- **WHEN** source contains `![[[` at the caret
- **THEN** the editor treats the extra bracket as malformed editable input rather than a fourth
  reference syntax
- **AND** it does not search a fallback catalog or rewrite the source

#### Scenario: Multiple resources have the same label

- **WHEN** an existing token or completion query matches multiple exact candidates
- **THEN** the candidates remain distinguishable and the token projects an ambiguous diagnostic until
  the user selects an exact target
- **AND** display order does not determine the resolved identity

#### Scenario: A completion result becomes stale

- **WHEN** the Workspace, document, query or visible Text Editor Root changes before search completes
- **THEN** the stale result is discarded and cannot insert text or replace the current candidate list

#### Scenario: One catalog contributor fails

- **WHEN** one file, entity or asset contributor returns invalid data or a local diagnostic
- **THEN** that contributor or item fails locally while valid sibling candidates remain available
- **AND** the catalog does not return empty success or try an alternate authority

### Requirement: Markdown stores only portable resource targets

Markdown files SHALL store GFM image targets, Workspace-relative locators or declared stable resource
tokens. OpenNeko SHALL NOT persist absolute filesystem paths, cache paths, `file:` URLs or short-lived
authorized render URLs as successful resource targets.

#### Scenario: User inserts a Workspace image

- **WHEN** the user selects an image candidate for `![alt](...)` or `![[...]]`
- **THEN** the inserted source contains its portable target and the document edit follows the same
  Text Document sequence as ordinary typing
- **AND** no authorized runtime URL or physical linked-library path enters the source

#### Scenario: Source contains a forbidden local target

- **WHEN** Markdown contains an absolute path, `file:` URL or runtime-only resource URL
- **THEN** the resource remains visible as source with a local diagnostic and is not fetched
- **AND** the Renderer does not try a relative, cached or raw filesystem path as fallback

### Requirement: Visible Markdown media uses authorized typed projections

Rich and Split presentation SHALL render a resolved embedded resource only from an exact
document-scoped authorized projection. Image, audio and video SHALL use typed presenters selected by
the owning media classification; unsupported or failed resources SHALL remain locally visible.

#### Scenario: Visible image embed resolves

- **WHEN** a visible CommonMark image or `![[...]]` token resolves to an authorized image descriptor
- **THEN** Rich or Split renders the image with alt text and bounded layout from its opaque URL
- **AND** the URL is presentation state and is never serialized into Markdown

#### Scenario: Visible audio or video embed resolves

- **WHEN** `![[...]]` resolves to an authorized audio or video descriptor
- **THEN** the matching typed presenter renders native user-operated controls without autoplay
- **AND** it uses the canonical resource transport rather than raw HTML or direct file access

#### Scenario: One media embed fails

- **WHEN** one target is missing, ambiguous, unauthorized, unsupported or fails preparation
- **THEN** that node shows its target or alt text with an exact local diagnostic and Source reveal
- **AND** sibling document content and media remain available without a fallback source

### Requirement: Media authorization follows visible surface lifecycle

Every Markdown media projection SHALL be authorized for the exact Window sender, Workspace,
document and visible surface. Its resource lease SHALL be released when the surface unmounts, the
document changes or the token is removed.

#### Scenario: User switches documents during media preparation

- **WHEN** preparation for document A completes after the visible surface has switched to document B
- **THEN** A's result is discarded or revoked and cannot render in B
- **AND** B can independently prepare its own authorized resources

#### Scenario: Embedded media leaves the visible composition

- **WHEN** Rich/Split unmounts or an accepted edit removes the media token
- **THEN** the exact media lease is released and its opaque URL becomes unavailable
- **AND** no document bytes, durable records or sibling leases are modified

### Requirement: Extension presentation preserves Markdown authority

Mention and resource presentation SHALL remain a disposable projection of accepted Markdown source.
Rich mutation SHALL be enabled only when its schema proves declared source-preserving round-trip
behavior for the active extensions.

#### Scenario: Rich cannot preserve an extension token

- **WHEN** the accepted source contains a mention or resource token that the current Milkdown schema
  cannot serialize without semantic loss
- **THEN** Rich keeps a read-only source-backed presentation and directs mutation to Source
- **AND** it does not drop, convert to HTML or normalize the token as success

#### Scenario: An incomplete embed is being typed

- **WHEN** the accepted source temporarily ends inside `[[`, `![[` or a GFM image target
- **THEN** Source and preview keep the parseable document content visible
- **AND** incomplete input cannot replace the whole presentation with a failure state
