## ADDED Requirements

### Requirement: Fountain has one canonical source-positioned parser

`@neko/screenplay-domain` SHALL expose the only Fountain grammar and normalized screenplay contract
used by production Editor, Preview projection and Search consumers. The parser SHALL preserve the
original source, associate every source-backed element with an exact range and return stable typed
diagnostics without producing a second authoritative screenplay representation.

#### Scenario: Fountain source parses successfully

- **WHEN** bounded Fountain 1.1 source is submitted to the canonical parser
- **THEN** it returns one immutable normalized document with source-backed title, element, scene, character and dialogue projections
- **AND** every projection is associated with the input source and parser session rather than a durable alternate file

#### Scenario: Parser cannot associate a token with source

- **WHEN** grammar output cannot be mapped unambiguously to an exact source range
- **THEN** the parser returns an explicit failure diagnostic for that document
- **AND** it does not invoke the retired Search classifier, return partial success or switch parsers

#### Scenario: Fountain source exceeds its policy

- **WHEN** source exceeds the deterministic screenplay parser limit
- **THEN** only that parse is rejected with a source-limit diagnostic
- **AND** valid sibling documents, Search sources and editor sessions remain usable

### Requirement: Fountain grammar uses a reviewed open-source engine

The canonical parser SHALL use the pinned MIT `fountain-js` 1.2.4 Fountain 1.1 grammar engine behind
the OpenNeko normalized contract. The system MUST NOT consume its generated HTML as domain or Preview
authority and MUST NOT add a competing regular-expression grammar in Editor, Search or Desktop.

#### Scenario: Parser processes standard Fountain constructs

- **WHEN** conformance fixtures include title pages, scenes, dialogue, parentheticals, dual dialogue, transitions, sections, notes, boneyards, emphasis, escapes and page breaks
- **THEN** the normalized result preserves their ordered semantics and source ranges
- **AND** the result is produced through the one pinned grammar adapter

#### Scenario: Preview renders a screenplay

- **WHEN** a normalized Fountain document is shown in Preview or Split mode
- **THEN** the Webview renders inert React text from normalized elements with shared theme tokens
- **AND** parser-generated HTML, raw HTML injection and a second Preview parser do not participate

### Requirement: Standard Fountain supports Chinese and international text

The parser and editor SHALL preserve Unicode source exactly and SHALL recognize standard forced
syntax for scripts whose writing system has no uppercase convention. CJK character cues SHALL use
`@角色名`; localized scene headings SHALL use the standard leading-dot forced heading or portable
`INT./EXT.` structural tokens. The system MUST NOT persist proprietary localized screenplay aliases.

#### Scenario: Chinese character cue is forced

- **WHEN** Fountain contains `@小橘` followed by dialogue
- **THEN** the normalized document identifies `小橘` as the dialogue owner while preserving the original source range
- **AND** Preview omits the forcing marker from the displayed character label

#### Scenario: Chinese scene heading is forced

- **WHEN** Fountain contains `.内景 客厅 - 夜`
- **THEN** the normalized document identifies it as a scene heading and includes it in the scene outline
- **AND** the source remains standard Fountain rather than being rewritten to a private localized keyword

#### Scenario: CJK line is structurally ambiguous

- **WHEN** a likely CJK character cue or scene-like line lacks standard forcing and parses as action
- **THEN** the editor displays a localized ambiguity diagnostic and a standard-syntax completion action
- **AND** it does not silently reclassify or rewrite the source

#### Scenario: Mixed-language screenplay is rendered

- **WHEN** a screenplay contains Simplified Chinese, Traditional Chinese, Japanese, Korean and Latin text
- **THEN** Editor and Preview preserve the characters, apply CJK-capable font fallback and wrap without text overlap
- **AND** UI locale does not alter screenplay source semantics

### Requirement: Fountain projections drive editor assistance

The Fountain editor mode SHALL derive syntax decoration, scene outline, character index, completion
and context-aware newline behavior from the current canonical normalized document. Assistance SHALL
not create a second parser or mutate source outside the revisioned text command path.

#### Scenario: User requests character completion

- **WHEN** the cursor is in a character-cue position outside IME composition
- **THEN** completion offers characters from the current normalized screenplay and inserts standard Fountain syntax through one edit command
- **AND** accepting completion preserves exact session revision semantics

#### Scenario: User navigates from the scene outline

- **WHEN** the user selects a scene in the package-owned outline
- **THEN** the editor moves selection and scroll to that scene's exact source range
- **AND** the outline does not own another document copy or persistent scene identity

#### Scenario: Source changes during composition

- **WHEN** an IME composition is active in Fountain mode
- **THEN** outline, completion and semantic diagnostics wait for the committed edit before replacing their projection
- **AND** the composing range is not reformatted or overwritten

### Requirement: Search consumes the canonical Fountain projection

Search SHALL build Fountain semantic segments and screenplay indexes only from
`@neko/screenplay-domain` normalized output. The existing Search-owned Fountain classifier and
Content-owned simplified Fountain DTO SHALL be removed in the same change.

#### Scenario: Search indexes a valid Fountain document

- **WHEN** Search receives canonical normalized output for a Fountain source
- **THEN** it projects scene, character, dialogue and action segments with exact source locations
- **AND** no Search regular expression reclassifies the Fountain source

#### Scenario: One Fountain source is invalid

- **WHEN** canonical Fountain parsing fails for one indexed file
- **THEN** Search records a source-qualified diagnostic and excludes only that invalid projection
- **AND** valid sibling source projections and Workspace search remain available

#### Scenario: Retired parser path is poisoned

- **WHEN** production Editor, Preview projection or Search parses Fountain after migration
- **THEN** tests prove the canonical screenplay parser is invoked exactly once for the source revision
- **AND** the removed Search classifier and Content Fountain DTO cannot produce a successful path

### Requirement: Fountain diagnostics are visible but do not invent success

The screenplay domain SHALL emit stable diagnostic codes, severity, source ranges and parameters for
source limits, parser failures, ambiguous forcing and structural issues. Hosts SHALL localize those
diagnostics and SHALL preserve the source even when the screenplay remains editable.

#### Scenario: Fountain contains a recoverable ambiguity

- **WHEN** the parser produces a warning for ambiguous but preserved source
- **THEN** the editor shows the warning at the exact range while keeping the document editable and dirty state unchanged
- **AND** Preview and Search use only the semantics actually returned by the parser

#### Scenario: Fountain parsing fails fatally

- **WHEN** the canonical parser returns a fatal diagnostic
- **THEN** the editor preserves raw source editing and disables only derived screenplay Preview, outline and Search projection
- **AND** it does not display stale projections, empty successful screenplay output or a Markdown interpretation

### Requirement: Fountain remains the future AI screenplay authority

Future AI screenplay generation and editing SHALL target Fountain source or bounded edits applied by
the canonical Text Document authoring port. Markdown MAY provide outline and character context but
MUST NOT become a parallel authoritative screenplay or be synchronized bidirectionally with
Fountain.

#### Scenario: Future AI generates a new draft

- **WHEN** a separately approved Agent capability later generates Fountain source
- **THEN** the source is parsed by the canonical screenplay parser before an authorized save is offered
- **AND** parse diagnostics remain visible rather than triggering a hidden Markdown or parser fallback

#### Scenario: Future AI changes an existing screenplay

- **WHEN** a separately approved Agent capability later proposes changes to an existing screenplay
- **THEN** it uses exact scene/source context and revisioned bounded edits against the Fountain session
- **AND** it does not replace the workspace file through an Agent-owned writer or maintain a second screenplay AST authority
