## ADDED Requirements

### Requirement: DSH sources synchronize at successful Tool completion and analysis at successful turn completion

The system SHALL submit a source-only Workspace Board delivery when each supported content Tool reaches a canonically
decoded completed projection and SHALL submit final analysis only after canonical `turn/end` completes successfully.
The model and Tool implementation SHALL NOT decide or directly perform Board synchronization.

#### Scenario: Content Tool completes before the turn

- **WHEN** a supported content Tool reaches `completed` with a canonical consumed `ContentLocator`
- **THEN** the Host SHALL immediately submit a source-only delivery for that exact Tool call without waiting for
  assistant Markdown or `turn/end`

#### Scenario: Document analysis completes

- **WHEN** a DSH turn successfully consumes one or more exact `ContentLocator` sources through a supported content
  Tool and completes with non-empty final assistant Markdown
- **THEN** the Host SHALL submit one batch containing the deduplicated source artifacts, one Markdown analysis
  artifact, and deterministic source-to-analysis relations to the configured Workspace Board

#### Scenario: Tool call is not completed

- **WHEN** a content Tool is pending, in progress, failed, or cancelled
- **THEN** no delivery SHALL be created for that Tool call
- **AND** already completed sibling Tool sources SHALL remain visible

#### Scenario: Turn does not produce a reviewable batch

- **WHEN** the turn is interrupted, reaches max tokens, has no successfully consumed stable source, or contains
  ordinary assistant text without a successfully consumed stable source
- **THEN** the system SHALL NOT create a final analysis delivery
- **AND** source-only deliveries from already completed content Tools SHALL remain visible

#### Scenario: One sibling content Tool fails after another source succeeds

- **WHEN** the turn completes with non-empty final assistant Markdown, at least one content Tool successfully consumed
  a stable source, and another content Tool failed
- **THEN** the terminal batch SHALL exclude the failed Tool and still project the successful deduplicated sources and
  analysis to the configured Workspace Board
- **AND** the failed Tool SHALL remain visible in the transcript without blocking or being represented as a successful
  Canvas source

#### Scenario: A completed sibling exposes a non-canonical result

- **WHEN** one completed content Tool has invalid arguments, non-JSON output, no canonical result source, or a result
  source that differs from its requested `ContentLocator`
- **THEN** the collector SHALL reject only that tool-call and emit a diagnostic containing its exact tool-call identity
- **AND** another successfully decoded source plus final assistant Markdown SHALL still reach the configured Workspace
  Board

### Requirement: DSH Workspace Board delivery is idempotent and locator canonical

The system SHALL keep `ContentLocator` as a pure location contract and SHALL deduplicate delivery at collector,
ledger, and Canvas projection boundaries without adding content fingerprints or runtime values to the locator.

#### Scenario: Completed Tool exposes one canonical source

- **WHEN** DSH projects a completed Document Tool with a canonical `source` in its successful result
- **THEN** the collector SHALL use that result locator and verify that the Content-owned argument decoder produces
  the same requested `ContentLocator`
- **AND** it SHALL NOT require an internal ACP `input` envelope or pass raw paths between applications

#### Scenario: Source is a document entry

- **WHEN** a completed Content Tool consumes a canonical locator with an entry selector inside EPUB or another
  supported document container
- **THEN** Desktop SHALL resolve freshness through the canonical document-entry Content reader
- **AND** it SHALL NOT reject the delivery merely because a workspace-file-only reader lacks that selector capability

#### Scenario: One source is read repeatedly within a turn

- **WHEN** multiple successful Tool calls use the same canonical `ContentLocator`
- **THEN** Canvas SHALL contain one source node for that locator across completed-tool and terminal deliveries

#### Scenario: One analysis consumes multiple locations in the same document container

- **WHEN** a turn successfully consumes multiple different selectors from the same EPUB, PDF, DOCX, CBZ, or other
  document container, or also consumes that container's root locator
- **THEN** the terminal batch SHALL retain one source for every distinct complete `ContentLocator`
- **AND** repeated reads of an identical locator SHALL still produce only one source
- **AND** sharing the same `ContentLocator.file` SHALL NOT erase a page, entry, or text-range selector
- **AND** a root locator SHALL remain a separate source when it was itself consumed

#### Scenario: An image-only document entry resolves directly to image sources

- **WHEN** a completed Document Tool result identifies an exact entry as image-only and exposes one or more embedded
  image `ContentLocator` values
- **THEN** its completed-tool delivery SHALL project the embedded images as the user-visible sources
- **AND** it SHALL NOT also project the XHTML or HTML wrapper as a generic file-reference node
- **AND** the decision SHALL use Content-owned result semantics rather than entry filenames
- **AND** a later completed Content Image Tool for the same locator SHALL reuse the existing image node

#### Scenario: A document entry has independent text semantics

- **WHEN** a completed Document Tool result is text or mixed content
- **THEN** the exact document source SHALL remain a distinct source artifact
- **AND** the collector SHALL NOT infer replacement from `page`, `moe`, extension, or basename patterns

#### Scenario: The same terminal event is handled repeatedly

- **WHEN** Desktop observes or retries the same DSH session turn completion more than once
- **THEN** every attempt SHALL use the same `deliveryId` and request digest, exactly one Canvas mutation SHALL be
  committed, and equivalent attempts SHALL resolve through the existing task or receipt

#### Scenario: The same completed Tool update is handled repeatedly

- **WHEN** Desktop observes or retries the same completed content Tool more than once
- **THEN** every attempt SHALL use the same tool-scoped `deliveryId` and request digest, exactly one source mutation
  SHALL be committed, and the terminal delivery SHALL later reuse that source node

#### Scenario: The same locator is analyzed in later turns

- **WHEN** a later successful turn uses the same source locator
- **THEN** Canvas SHALL reuse the existing resource node without changing user-owned layout
- **AND** it SHALL reuse an equivalent Markdown analysis or create a distinct analysis node only when the analysis
  artifact content identity differs

#### Scenario: Content at an existing locator changes

- **WHEN** a later successful turn consumes the same locator with a different Host-observed content fingerprint
- **THEN** Canvas SHALL retain the existing resource node identity, locator, position, size, and creator edits
- **AND** it SHALL update only the source freshness provenance and cause an open text or media preview to read the
  current content again

#### Scenario: A historical terminal turn is replayed after source content changes

- **WHEN** the delivery already has a receipt or a pending ledger request and the source at its locator has since
  changed
- **THEN** Desktop SHALL reuse the receipt or resume the stored request before reading current source freshness
- **AND** it SHALL NOT reuse the historical delivery identity with a newly computed request digest

### Requirement: DSH delivery uses the exact configured Workspace Board authority

The system SHALL resolve delivery from the Conversation's authoritative Workspace binding and configured Canvas turn
target. It SHALL NOT infer an active/recent Workspace or Canvas and SHALL NOT mirror an explicit Canvas-authoring
mutation into the Workspace Board.

#### Scenario: Workspace Conversation completes a reviewable batch

- **WHEN** the Conversation has an exact authorized Workspace binding and the configured target is Workspace Board
- **THEN** the delivery SHALL target that Workspace's `neko/boards/workspace.nkc`

#### Scenario: Conversation has no Workspace authority

- **WHEN** an assistant, Character, Room, invalid, or missing Conversation binding produces terminal text
- **THEN** Workspace Board delivery SHALL remain absent or fail locally with a typed diagnostic and SHALL NOT select
  another Workspace

### Requirement: Canvas remains the only Board content and layout authority

The DSH synchronization path SHALL use the existing Canvas delivery ledger, fenced writer, projection planner, and
atomic mutation port. Desktop and Agent Runtime SHALL NOT write `.nkc` directly, and renderer UI SHALL remain
presentation-only.

#### Scenario: Equivalent content already exists

- **WHEN** the configured Board already contains the source node, analysis node, or their deterministic relation
- **THEN** projection SHALL reuse the existing graph without moving, resizing, renaming, or duplicating it

#### Scenario: Board delivery is blocked

- **WHEN** the ledger, exact Workspace, writer claim, Canvas document, or atomic mutation rejects the delivery
- **THEN** the failure SHALL be recorded and reported for that delivery while transcript, source content, sibling
  deliveries, other Workspaces, and the application remain available
