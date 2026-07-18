## ADDED Requirements

### Requirement: Creator-visible typed artifacts are delivered to the Workspace Board

The system SHALL automatically deliver a terminal Agent processing batch to the canonical Workspace Board when the batch contains creator-visible typed artifacts that have no explicit owning Canvas document. Eligible artifacts SHALL include durable material references actually consumed by the processing path, reviewable Markdown produced as a named artifact, and generated image, audio, video, storyboard, or file outputs with stable identity.

#### Scenario: Material analysis produces a reviewable processing batch

- **WHEN** an Agent terminal result records one or more actually consumed durable material references and a named reviewable Markdown analysis
- **THEN** the Host SHALL submit one typed delivery batch containing the source references, Markdown artifact, stable provenance, and their source/analysis roles to the canonical Workspace Board

#### Scenario: Generated media completes in a background task

- **WHEN** a recoverable background task reaches a successful terminal state with a durable generated-output ResourceRef
- **THEN** the owning Host SHALL submit the generated artifact through the same typed delivery contract used by synchronous Agent results

#### Scenario: Non-reviewable runtime content is produced

- **WHEN** a turn contains ordinary conversational text, hidden reasoning, logs, provider scratch data, unselected search results, runtime handles, temporary paths, or a failure without a reviewable artifact
- **THEN** the system SHALL NOT create a Workspace Board delivery for that content

### Requirement: Material usage is proven by runtime evidence

The system SHALL derive delivered source materials from stable content-access, Tool-result, task-result, or perception evidence that proves the material participated in the completed processing path. The system SHALL NOT treat every attachment, open file, search candidate, or mentioned path as used material.

#### Scenario: Attached material is actually read

- **WHEN** an attached document or media source is successfully consumed through an owning content-access or Tool path and contributes to a terminal artifact batch
- **THEN** the delivery SHALL include its durable `ResourceRef` or `DocumentArchiveResourceRef` and source role

#### Scenario: Attached material is never consumed

- **WHEN** a user attaches or mentions a material but the completed processing path has no evidence that the material was read or selected
- **THEN** the delivery SHALL omit that material rather than inferring usage from attachment or mention state

### Requirement: All supported local Agent Hosts share one delivery contract

VS Code Agent, Terminal TUI, pure Node/Bun Agent Hosts, and recoverable background task owners SHALL submit Workspace Board artifacts through one Host-neutral delivery contract. Agent core and session state SHALL expose typed result/provenance facts but SHALL NOT resolve a Canvas destination, import Canvas implementation code, or write `.nkc` files directly.

#### Scenario: TUI completes a creator-visible artifact batch

- **WHEN** the canonical TUI session owner completes a typed artifact batch for a workspace
- **THEN** its Host adapter SHALL persist and deliver the batch without requiring an active VS Code Extension or Webview

#### Scenario: Agent core runs without a writable workspace Host

- **WHEN** Agent core produces a typed artifact but the Host has no resolved writable workspace or supported delivery adapter
- **THEN** the Host SHALL return a structured blocked diagnostic, retain any already durable artifact, and SHALL NOT select another workspace or silently report Board delivery success

### Requirement: Unbound results use the Workspace Board and explicit Canvas authoring does not mirror

The canonical Workspace Board SHALL be the default destination only for creator-visible typed artifacts that do not already have an explicit owning Canvas document. A request with an explicit ordinary `.nkc` identity SHALL write only that document and SHALL NOT duplicate or mirror the same artifact batch into `neko/boards/workspace.nkc`.

#### Scenario: Agent chat result has no explicit Canvas target

- **WHEN** a creator-visible typed result is finalized with a resolved workspace and no explicit Canvas document identity
- **THEN** the Canvas-owned projector SHALL target `neko/boards/workspace.nkc`

#### Scenario: Canvas-originated authoring has an explicit target

- **WHEN** an Agent or Canvas action carries an explicit `.nkc` document identity and expected revision
- **THEN** the owning authoring service SHALL mutate only that target and SHALL NOT enqueue a Workspace Board mirror delivery

#### Scenario: Only an active or recent Canvas is available

- **WHEN** a delivery has no explicit target but a Canvas editor is active or was recently used
- **THEN** the system SHALL ignore active/recent editor state and deterministically use the canonical Workspace Board

### Requirement: Workspace Board deliveries use a durable local metadata ledger

Each accepted delivery SHALL be recorded in the existing user-level `LocalMetadataStore`, partitioned by stable `workspaceId`, using the existing `tasks` and `task_checkpoints` storage boundary. The system SHALL NOT create a workspace SQLite database, package-local database, JSON fallback ledger, or additional SQLite authority.

#### Scenario: A delivery is accepted before Canvas mutation

- **WHEN** a Host accepts a valid typed artifact batch
- **THEN** it SHALL transactionally persist a Canvas-owned delivery task and resumable checkpoint before reporting the batch as durable for Board delivery

#### Scenario: Extension or TUI restarts with pending deliveries

- **WHEN** a supported Host opens the workspace or the Workspace Board and the ledger contains pending or recoverable delivery tasks
- **THEN** the Host SHALL resume those deliveries through the Canvas-owned projector and preserve their original identity and provenance

#### Scenario: Local metadata is unavailable or corrupt

- **WHEN** the user-level `LocalMetadataStore` cannot open, migrate, transact, or pass the required integrity boundary
- **THEN** Board delivery SHALL fail visibly and SHALL NOT bypass the ledger by writing `.nkc` directly or falling back to workspace JSON/SQLite

### Requirement: The Canvas document remains the Board fact and layout authority

`neko/boards/workspace.nkc` SHALL remain the authority for Board nodes, connections, positions, groups, titles, annotations, deletions, and user movement. SQLite SHALL store delivery state and receipts only and SHALL NOT automatically reconstruct, overwrite, or resurrect an existing Board from historical delivery rows.

#### Scenario: User edits delivered content nodes or relations

- **WHEN** the user moves, annotates, regroups, renames, disconnects, or deletes delivered Board nodes or connections
- **THEN** those edits SHALL persist only through the Canvas document and a completed delivery receipt SHALL NOT restore the prior projected layout or deleted content

#### Scenario: Board opens with pending and completed ledger rows

- **WHEN** the Workspace Board opens and the ledger contains both pending and already projected deliveries
- **THEN** the projector SHALL apply only eligible pending deliveries and SHALL treat completed receipts as non-replayable

#### Scenario: Workspace Board file is missing

- **WHEN** the canonical Board file does not exist but valid pending deliveries remain
- **THEN** the Canvas-owned service MAY create a new empty Board and apply only those pending deliveries, while historical recovery of previously projected content SHALL require an explicit recovery operation

### Requirement: A delivered batch forms a flat deduplicated creative content graph

The Canvas-owned projector SHALL atomically create or reuse top-level ordinary Document, Text, and Media nodes for creator-visible content and ordinary Canvas connections for proven creative dependencies. The Workspace Board document itself SHALL be the delivery surface; Inbox, Task, Run, and delivery identities SHALL remain non-visual provenance and SHALL NOT create Canvas Group nodes.

#### Scenario: Complete source-analysis-output batch is projected

- **WHEN** a valid delivery contains source references, one Markdown analysis, and generated outputs
- **THEN** the projector SHALL create or reuse ordinary top-level Document/Media/Text nodes and deterministic source-to-derived connections atomically with stable roles and provenance

#### Scenario: The same reference appears in multiple deliveries

- **WHEN** two deliveries contain the same stable resource identity and fingerprint under different run, task, delivery, or artifact observation identities
- **THEN** the Board SHALL contain one content node for that resource revision and both deliveries SHALL reuse it without changing its user-owned position, size, title, grouping, or annotations

#### Scenario: A proven creative dependency is delivered repeatedly

- **WHEN** an artifact identifies another artifact in the same batch through `sourceArtifactIds`
- **THEN** the projector SHALL create one deterministic `derived-from` Canvas connection from the canonical source content node to the canonical derived content node and SHALL reuse that connection on equivalent later deliveries

#### Scenario: A creative dependency cannot be resolved

- **WHEN** `sourceArtifactIds` contains an empty, self-referential, duplicate, or batch-unknown artifact identity
- **THEN** validation SHALL block the whole batch before Canvas mutation rather than silently omitting the relationship

#### Scenario: New flat content is placed beside an edited graph

- **WHEN** a delivery introduces nodes beside existing user-positioned content
- **THEN** the projector SHALL choose deterministic free positions that follow source-to-analysis-to-output direction and SHALL NOT move or resize existing nodes

#### Scenario: A delivered artifact has a creator-facing title and a ResourceRef

- **WHEN** a Media, Text, or Document child carries both a stable resource identity and a non-empty authored title
- **THEN** the visual card SHALL display the authored title and SHALL use the resource or node identity only when no authored title exists

#### Scenario: Delivery contains only a Markdown artifact

- **WHEN** a terminal result contains a named reviewable Markdown artifact and no durable material or media output
- **THEN** the projector SHALL create one top-level Markdown Text node without inventing source, output, Inbox, Run, Task, or processing Group nodes

#### Scenario: An image artifact is rendered on the Workspace Board

- **WHEN** a generated or referenced image is shown as an inline Canvas node preview
- **THEN** the Webview SHALL display the complete image using contain semantics, MAY preserve a uniform card frame with letterboxing, and SHALL NOT crop the image with cover semantics

#### Scenario: Runtime identity appears in a batch

- **WHEN** a delivery contains a Webview URI, blob/data URL, cache/temp path, token, process handle, active editor identity, or other forbidden runtime value
- **THEN** validation SHALL block the entire batch before any Canvas mutation

### Requirement: Multi-Agent delivery is idempotent and single-writer per Board target

Concurrent Agents and Hosts SHALL coordinate Workspace Board mutation through a target-scoped fenced writer claim stored in the shared user-level metadata boundary. The canonical write path SHALL reload the latest Canvas revision, apply one idempotent delivery batch, and atomically save the resulting `.nkc`; stale claim holders, stale revisions, duplicate identities, or conflicting identities SHALL NOT return success.

#### Scenario: Two Agents submit distinct deliveries concurrently

- **WHEN** two Agents submit different valid delivery identities for the same Workspace Board
- **THEN** the coordinator SHALL serialize their load-plan-save mutations and the final Board SHALL contain the union of their deduplicated content nodes and relations without lost updates

#### Scenario: The same delivery is submitted more than once

- **WHEN** multiple Hosts submit the same `projectionId` and revision
- **THEN** exactly one mutation SHALL be applied and all equivalent repeats SHALL resolve to the same projected receipt or no-op result

#### Scenario: A stale Host continues after lease takeover

- **WHEN** a writer claim expires or is explicitly taken over and the previous holder attempts to commit with an older fencing epoch
- **THEN** the stale commit SHALL fail visibly and SHALL NOT modify the Board or mark the delivery projected

#### Scenario: Board revision changes during delivery

- **WHEN** the Board revision no longer matches the revision loaded by the writer
- **THEN** the coordinator SHALL reload and re-plan the append-only delivery under the current fenced claim or return a typed conflict; it SHALL NOT overwrite user edits, use last-write-wins, or route to another Canvas

### Requirement: Historical handoff remains explicit and current typed results avoid Send to Canvas

Historical conversation content, external content not participating in the current typed delivery, and professional semantic authoring SHALL continue to require an explicit Agent authoring handoff. Current creator-visible typed results SHALL use automatic Board delivery and SHALL NOT depend on a generic `Send to Canvas` action or legacy generated-draft path.

#### Scenario: User imports historical conversation content

- **WHEN** the user explicitly chooses to add historical or external content to Canvas
- **THEN** the existing authoring handoff SHALL create an Agent-visible request for semantic authoring rather than inserting a delivery ledger row as if it were a current result

#### Scenario: Current typed result is successfully delivered

- **WHEN** a current creator-visible artifact batch reaches a projected terminal state
- **THEN** the result presentation SHALL expose its Board delivery status and SHALL NOT require or display a generic `Send to Canvas` success path for the same batch

### Requirement: Delivery diagnostics remain visible without changing artifact durability

Board delivery status SHALL distinguish queued, claimed, projected, no-op, blocked, and conflict outcomes. Projection failure SHALL not delete or invalidate an already durable generated file, Markdown artifact, or stable source reference, and successful artifact creation SHALL not be reported as successful Board delivery when projection is blocked.

#### Scenario: Artifact is durable but Board write is blocked

- **WHEN** a generated or Markdown artifact is durable and the Board writer returns a permission, integrity, target, lease, or revision diagnostic
- **THEN** the Host SHALL retain the artifact, record the blocked delivery state and diagnostic, and present artifact durability separately from Board delivery failure

#### Scenario: Failed delivery is retried after its recoverable condition clears

- **WHEN** a blocked or expired-claim delivery remains valid and the owning Host explicitly resumes it
- **THEN** the retry SHALL reuse the original delivery identity and SHALL either project once or return a current typed diagnostic without creating a parallel identity
