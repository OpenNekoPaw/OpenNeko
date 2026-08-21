## ADDED Requirements

### Requirement: DSH creator-visible artifacts synchronize only at successful turn completion

The system SHALL collect creator-visible candidates while a DSH turn runs and SHALL submit at most one Workspace
Board delivery after the canonical `turn/end` projection completes successfully. The model and individual Tool calls
SHALL NOT decide or directly perform Board synchronization.

#### Scenario: Document analysis completes

- **WHEN** a DSH turn successfully consumes one or more exact `ContentLocator` sources through a supported content
  Tool and completes with non-empty final assistant Markdown
- **THEN** the Host SHALL submit one batch containing the deduplicated source artifacts, one Markdown analysis
  artifact, and deterministic source-to-analysis relations to the configured Workspace Board

#### Scenario: Tool calls are still running

- **WHEN** one or more content Tools are pending or in progress
- **THEN** no Canvas delivery SHALL be persisted or applied

#### Scenario: Turn does not produce a reviewable batch

- **WHEN** the turn is interrupted, reaches max tokens, contains a failed content Tool, contains only source reads,
  or contains ordinary assistant text without a successfully consumed stable source
- **THEN** the system SHALL NOT create a Workspace Board delivery

### Requirement: DSH Workspace Board delivery is idempotent and locator canonical

The system SHALL keep `ContentLocator` as a pure location contract and SHALL deduplicate delivery at collector,
ledger, and Canvas projection boundaries without adding content fingerprints or runtime values to the locator.

#### Scenario: One source is read repeatedly within a turn

- **WHEN** multiple successful Tool calls use the same canonical `ContentLocator`
- **THEN** the terminal batch SHALL contain one source artifact for that locator

#### Scenario: The same terminal event is handled repeatedly

- **WHEN** Desktop observes or retries the same DSH session turn completion more than once
- **THEN** every attempt SHALL use the same `deliveryId` and request digest, exactly one Canvas mutation SHALL be
  committed, and equivalent attempts SHALL resolve through the existing task or receipt

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
