## ADDED Requirements

### Requirement: Creator-visible typed artifacts are delivered to the Workspace Board

The system SHALL automatically deliver a terminal Agent processing batch to the canonical Workspace Board when the batch contains creator-visible typed artifacts that have no explicit owning Canvas document. Eligible artifacts SHALL include durable material references actually consumed by the processing path, reviewable Markdown produced as a named artifact, and generated image, audio, video, storyboard, or file outputs with stable identity.

#### Scenario: Material analysis produces a reviewable processing batch

- **WHEN** an Agent terminal result records one or more actually consumed durable material references and a named reviewable Markdown analysis
- **THEN** the Host SHALL submit one typed delivery batch containing the source references, Markdown artifact, stable provenance, and their source/analysis roles to the canonical Workspace Board

#### Scenario: Native image analysis is finalized as a reviewable artifact

- **WHEN** a successful `ReadImage` result explicitly declares an `analysis` kind, exposes one or more durable perceptual image references to the current native multimodal turn, and that turn completes with non-empty final Markdown
- **THEN** the terminal collector SHALL create one stable named Markdown analysis artifact, classify the actually exposed images as source artifacts, connect the analysis through `sourceArtifactIds`, and submit the batch to the canonical Workspace Board
- **AND** a failed `ReadImage`, a result without explicit `analysis`, an image without stable source identity, or an unrelated ordinary final answer SHALL NOT be promoted through this rule

#### Scenario: Generated media completes in a background task

- **WHEN** a recoverable background task reaches a successful terminal state with a durable generated-output ResourceRef
- **THEN** the owning Host SHALL submit the generated artifact through the same typed delivery contract used by synchronous Agent results

#### Scenario: Agent writes a durable creator-visible file

- **WHEN** an Agent Tool successfully writes a creator-visible file through an authorized Workspace content operation and returns its stable Workspace `ContentLocator`
- **THEN** terminal finalization SHALL classify that file as an output artifact and submit it through the same Workspace Board delivery contract
- **AND** the file-write callback SHALL NOT directly mutate `workspace.nkc` or create a second delivery identity

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

### Requirement: Electron Desktop uses one Board delivery contract

Electron Desktop Agent and recoverable background task owners SHALL submit Workspace Board artifacts through one Host-neutral delivery contract composed by Main. Agent core and session state SHALL expose typed result/provenance facts but SHALL NOT resolve a Canvas destination, import Canvas implementation code, or write `.nkc` files directly.

#### Scenario: Desktop Agent completes a creator-visible artifact batch

- **WHEN** the canonical Desktop Agent session owner completes a typed artifact batch for a workspace
- **THEN** its Desktop Host adapter SHALL persist and deliver the batch without requiring an active Canvas renderer

#### Scenario: Agent Turn terminal finalization produces no eligible artifact

- **WHEN** the canonical Desktop Agent Turn reaches terminal state without a creator-visible typed artifact batch
- **THEN** finalization SHALL complete normally without enqueueing a Board delivery, and this absence SHALL NOT be replaced by file-write, active Canvas, or transcript-text heuristics

#### Scenario: Agent core runs without a writable workspace Host

- **WHEN** Agent core produces a typed artifact but the Host has no resolved writable workspace or supported delivery adapter
- **THEN** the Host SHALL return a structured blocked diagnostic, retain any already durable artifact, and SHALL NOT select another workspace or silently report Board delivery success

### Requirement: Unbound results use the Workspace Board and explicit Canvas authoring does not mirror

The canonical Workspace Board SHALL be the default destination only for creator-visible typed artifacts that do not already have an explicit owning Canvas document. A request with an explicit ordinary `.nkc` identity SHALL write only that document and SHALL NOT duplicate or mirror the same artifact batch into `neko/boards/workspace.nkc`.

#### Scenario: Agent chat result has no explicit Canvas target

- **WHEN** a creator-visible typed result is finalized with a resolved workspace and no explicit Canvas document identity
- **THEN** the Canvas-owned projector SHALL target `neko/boards/workspace.nkc`

#### Scenario: Canvas-originated authoring has an explicit target

- **WHEN** an Agent or Canvas action carries an explicit `.nkc` document identity and authoring intent
- **THEN** the owning authoring service SHALL mutate only that target and SHALL NOT enqueue a Workspace Board mirror delivery

#### Scenario: Only an active or recent Canvas is available

- **WHEN** a delivery has no explicit target but a Canvas editor is active or was recently used
- **THEN** the system SHALL ignore active/recent editor state and deterministically use the canonical Workspace Board

### Requirement: Workspace Board deliveries use a durable local metadata ledger

Each accepted delivery SHALL be recorded in the existing user-level `LocalMetadataStore`, partitioned by stable `workspaceId`, using the existing `tasks` and `task_checkpoints` storage boundary. The system SHALL NOT create a workspace SQLite database, package-local database, JSON fallback ledger, or additional SQLite authority.

#### Scenario: A delivery is accepted before Canvas mutation

- **WHEN** a Host accepts a valid typed artifact batch
- **THEN** it SHALL transactionally persist a Canvas-owned delivery task and resumable checkpoint before reporting the batch as durable for Board delivery

#### Scenario: Electron Desktop restarts with pending deliveries

- **WHEN** Desktop Main opens the workspace or the Workspace Board and the ledger contains pending or recoverable delivery tasks
- **THEN** Main SHALL resume those deliveries through the Canvas-owned projector and preserve their original identity and provenance

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

### Requirement: A delivered batch forms a batch-aware deduplicated creative content graph

The Canvas-owned projector SHALL atomically create or reuse ordinary Document, Text, and Media nodes for creator-visible content and ordinary Canvas connections for proven creative dependencies. Inbox, Task, and Run identities SHALL remain non-visual provenance. When one delivery creates multiple new generated output media nodes, the projector SHALL place those nodes in one batch-scoped Canvas Group used only for editable presentation and layout; that Group SHALL NOT own Job state, delivery state, content identity, or resource lifetime.

#### Scenario: Complete source-analysis-output batch is projected

- **WHEN** a valid delivery contains source references, one Markdown analysis, and generated outputs
- **THEN** the projector SHALL create or reuse ordinary Document/Media/Text nodes and deterministic source-to-derived connections atomically with stable roles and provenance

#### Scenario: One delivery creates multiple generated outputs

- **WHEN** one valid delivery creates at least two new image, audio, or video artifacts with output role
- **THEN** the projector SHALL create one deterministic batch Group and place exactly those newly created output nodes inside it
- **AND** the Group SHALL use a bounded near-square grid with at least two rows and two columns whenever the artifact count permits, rather than forcing every batch into one horizontal row or one vertical column

#### Scenario: A delivery creates one generated output

- **WHEN** one valid delivery creates only one generated output node
- **THEN** the projector SHALL keep that node as ordinary top-level content and SHALL NOT create a one-item batch Group

#### Scenario: The same reference appears in multiple deliveries

- **WHEN** two deliveries contain the same stable resource identity and fingerprint under different run, task, delivery, or artifact observation identities
- **THEN** the Board SHALL contain one content node for that resource content fingerprint and both deliveries SHALL reuse it without changing its user-owned position, size, title, grouping, or annotations

#### Scenario: One portable file is observed without and with a durable fingerprint

- **WHEN** one batch or repeated deliveries observe the same scoped resource kind and locator first with fingerprint strategy `none` and later with a durable fingerprint
- **THEN** the collector and projector SHALL treat both observations as one logical file, prefer the strongest observation for a newly created node, and SHALL NOT create or reposition a second content node
- **AND** when the reused node still stores only the weak observation, the projector SHALL upgrade only its `resourceRef` identity metadata while preserving all user-owned node data and layout so later strong revisions remain distinguishable

#### Scenario: One portable file has two durable revisions

- **WHEN** observations have the same scoped resource kind and locator but two different non-`none` fingerprints
- **THEN** the projector SHALL retain two content nodes as distinct durable revisions rather than merging them through locator identity alone

#### Scenario: A proven creative dependency is delivered repeatedly

- **WHEN** an artifact identifies another artifact in the same batch through `sourceArtifactIds`
- **THEN** the projector SHALL create one deterministic `derived-from` Canvas connection from the canonical source content node to the canonical derived content node and SHALL reuse that connection on equivalent later deliveries

#### Scenario: A creative dependency cannot be resolved

- **WHEN** `sourceArtifactIds` contains an empty, self-referential, duplicate, or batch-unknown artifact identity
- **THEN** validation SHALL block the whole batch before Canvas mutation rather than silently omitting the relationship

#### Scenario: New content is placed beside an edited graph

- **WHEN** a delivery introduces nodes beside existing user-positioned content
- **THEN** the projector SHALL choose deterministic free positions through a bounded multi-column top-level layout that follows source-to-analysis-to-output direction and SHALL NOT move or resize existing nodes

#### Scenario: A later delivery reuses creator-edited content

- **WHEN** an equivalent artifact is delivered after its existing node was moved, resized, regrouped, ungrouped, renamed, or annotated
- **THEN** the projector SHALL reuse that node without moving it into a new batch Group or replacing any creator-owned layout

#### Scenario: A delivered artifact has a creator-facing title and a ResourceRef

- **WHEN** a Media, Text, or Document child carries both a stable resource identity and a non-empty authored title
- **THEN** the visual card SHALL display the authored title and SHALL use the resource or node identity only when no authored title exists

#### Scenario: Delivery contains only a Markdown artifact

- **WHEN** a terminal result contains a named reviewable Markdown artifact and no durable material or media output
- **THEN** the projector SHALL create one top-level Markdown Text node without inventing source, output, Inbox, Run, Task, or processing Group nodes

#### Scenario: An image artifact is rendered on the Workspace Board

- **WHEN** a generated or referenced image is shown as an inline Canvas node preview
- **THEN** the Webview SHALL display the complete image using contain semantics and SHALL NOT crop the image with cover semantics

#### Scenario: A new image artifact carries portable intrinsic dimensions

- **WHEN** a generated image or a `ReadImage` selected-entry attachment is projected for the first time with positive intrinsic width and height
- **THEN** the shared projection path SHALL create the image node with the same aspect ratio while satisfying Canvas minimum dimensions

#### Scenario: An existing image node has creator-owned sizing

- **WHEN** an equivalent image artifact is delivered again after the creator resized its Canvas node
- **THEN** the projector SHALL reuse that node without replacing its stored width or height from intrinsic metadata

#### Scenario: Runtime identity appears in a batch

- **WHEN** a delivery contains a Webview URI, blob/data URL, cache/temp path, token, process handle, active editor identity, or other forbidden runtime value
- **THEN** validation SHALL block the entire batch before any Canvas mutation

### Requirement: Multi-Agent delivery is idempotent and single-writer per Board target

Concurrent Agents and Hosts SHALL coordinate Workspace Board mutation through a target-scoped fenced writer claim stored in the shared user-level metadata boundary. The canonical write path SHALL reload the current authoritative Canvas document, apply one idempotent delivery batch, and atomically save the resulting `.nkc`; stale claim holders, duplicate identities, or conflicting identities SHALL NOT return success.

#### Scenario: Two Agents submit distinct deliveries concurrently

- **WHEN** two Agents submit different valid delivery identities for the same Workspace Board
- **THEN** the coordinator SHALL serialize their load-plan-save mutations and the final Board SHALL contain the union of their deduplicated content nodes and relations without lost updates

#### Scenario: The same delivery is submitted more than once

- **WHEN** multiple Hosts submit the same `deliveryId` and content fingerprint
- **THEN** exactly one mutation SHALL be applied and all equivalent repeats SHALL resolve to the same projected receipt or no-op result

#### Scenario: A stale Host continues after lease takeover

- **WHEN** a writer claim expires or is explicitly taken over and the previous holder attempts to commit with a stale lease identity
- **THEN** the stale commit SHALL fail visibly and SHALL NOT modify the Board or mark the delivery projected

#### Scenario: Board changes during delivery

- **WHEN** the authoritative Board document changes after the writer loaded it
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

- **WHEN** a generated or Markdown artifact is durable and the Board writer returns a permission, integrity, target, lease, or conflict diagnostic
- **THEN** the Host SHALL retain the artifact, record the blocked delivery state and diagnostic, and present artifact durability separately from Board delivery failure

#### Scenario: Failed delivery is retried after its recoverable condition clears

- **WHEN** a blocked or expired-claim delivery remains valid and the owning Host explicitly resumes it
- **THEN** the retry SHALL reuse the original delivery identity and SHALL either project once or return a current typed diagnostic without creating a parallel identity

### Requirement: Stable content references have one authorized display projection

Agent result cards SHALL resolve an authorized transient representation handle through the owning content runtime
when current-Surface representation display is requested. Canvas nodes and creator-visible artifacts SHALL resolve
and persist only `ContentLocator`.
Resulting bytes SHALL reach the exact Renderer only through a short-lived `openneko://resource` URL. Transcript
artifact authority, delivery metadata and Canvas documents SHALL NOT persist a representation handle/locator, URL,
raw bytes, data URL, temporary extraction path or absolute source path.

The system SHALL use one package-owned Preview resource projection service for image, audio and video descriptors,
exact-resource leases and release behavior across Agent cards, Canvas nodes, Resource Browser quick Preview, Asset
Center Preview and the main Preview panel. Lightweight and full Preview SHALL differ only by presentation parameters
and session attachment; they SHALL use the same descriptor contract, resource transport and viewer kernel.

#### Scenario: The same media is presented in lightweight and full Preview

- **WHEN** an authorized image, audio or video locator is shown in Agent, Canvas or Resource Browser and is also
  opened in the main Preview panel
- **THEN** every Surface SHALL receive its own exact-owner lease from the same Preview projection service and render
  the same content through the same viewer kernel
- **AND** only chrome, control density, playback policy and presentation snapshot ownership MAY differ

#### Scenario: A direct media file requires seekable playback

- **WHEN** an authorized audio or video locator resolves to an ordinary file
- **THEN** the canonical Preview projection service SHALL register a seekable file resource that supports the shared
  player rather than buffering the complete file or selecting a Surface-specific player

#### Scenario: A document entry or computed representation is previewed

- **WHEN** an image locator resolves to an archive entry or computed representation
- **THEN** the same Preview projection service SHALL register the authorized bytes and construct the same descriptor
  shape used for direct files

#### Scenario: Preview projection fails

- **WHEN** the canonical source resolver or exact-resource registration rejects one locator
- **THEN** that Surface SHALL display the typed Preview diagnostic and SHALL NOT fall back to a raw path, raw URL,
  direct `<img>`, separately created media element or another descriptor producer

#### Scenario: EPUB image is displayed in Agent and Canvas

- **WHEN** `ReadDocument` or `ReadImage` returns an EPUB image addressed by a canonical file plus entry selector and that stable locator is also projected into a Workspace Board image node
- **THEN** the Agent thumbnail and Canvas node SHALL each display the complete image pixels using contain semantics through an authorized `openneko://resource` URL
- **AND** neither durable projection SHALL replace the canonical locator with an extracted path or runtime URL

#### Scenario: A derived document page is displayed in an Agent result

- **WHEN** a Tool result contains an authorized transient handle for a rasterized document page
- **THEN** Agent display projection SHALL read that exact representation for the current Surface
- **AND** creator-visible artifact collection SHALL NOT persist the handle or create a Board node for it

#### Scenario: A derived document page is explicitly exported

- **WHEN** the user explicitly requests a durable export of a rasterized document page
- **THEN** the owning export operation SHALL commit bytes and return a new `ContentLocator` before Board projection

#### Scenario: One locator in a batch cannot be projected

- **WHEN** one image locator is missing, unauthorized, changed or unsupported while sibling image locators remain readable
- **THEN** only the affected card or node SHALL show an explicit projection diagnostic and the valid siblings SHALL remain rendered and interactive

#### Scenario: The owning Surface is detached

- **WHEN** an Agent projection attachment, connection, Canvas View or renderer session is detached or replaced
- **THEN** all exact-resource leases owned by that Surface SHALL be released without changing durable locator-backed content

### Requirement: Canvas renderer saves preserve authoritative Board content

Desktop Main SHALL validate Canvas renderer save snapshots against the most recently loaded or Host-authored authoritative document. A candidate snapshot SHALL NOT remove an authoritative node unless the renderer reported explicit removal evidence for that node in the same save request.

#### Scenario: Webview state resets after a non-empty Board was loaded

- **WHEN** the authoritative Workspace Board contains nodes and the renderer returns an empty or partial snapshot without matching node-removal evidence
- **THEN** Main SHALL reject the save visibly and SHALL leave the `.nkc` bytes unchanged

#### Scenario: User explicitly clears the Board

- **WHEN** the user deletes all nodes and the renderer reports the exact removed node identities before saving
- **THEN** Main SHALL accept the empty candidate snapshot and persist the intentional deletion

#### Scenario: Host sends an invalid Canvas update

- **WHEN** a Canvas renderer receives an `update` message without a valid Canvas document payload
- **THEN** it SHALL surface a contract error and SHALL NOT replace the current document with a default empty Canvas

#### Scenario: A projected receipt exists after Board content was intentionally deleted

- **WHEN** a creator intentionally deletes projected nodes from the authoritative `.nkc`
- **THEN** the delivery ledger SHALL NOT replay completed receipts or reconstruct those nodes automatically

### Requirement: Open Workspace Board sessions project committed deliveries immediately

Desktop Main SHALL coordinate Workspace Board delivery with every currently attached exact Board session through the
same serialized document mutation boundary. A clean session SHALL receive the committed authoritative Canvas snapshot
without requiring View close/reopen. A dirty session SHALL block the delivery before `.nkc` mutation rather than merge,
overwrite or refresh away unsaved creator changes.

#### Scenario: Agent artifact completes while a clean Workspace Board is open

- **WHEN** an exact `neko/boards/workspace.nkc` session is attached and clean and a typed Agent artifact delivery commits
- **THEN** the Host SHALL emit one updated Canvas projection containing the delivered nodes to that session immediately
- **AND** closing or reopening the View SHALL NOT be required and SHALL NOT create duplicate nodes

#### Scenario: Agent artifact completes while the Workspace Board has unsaved edits

- **WHEN** an exact Workspace Board session contains dirty creator edits when delivery begins
- **THEN** the Host SHALL return a typed conflict before the coordinator mutates `.nkc`
- **AND** it SHALL preserve both the durable Agent artifact and the creator's in-memory edits without last-write-wins,
  filesystem-watcher merge or active/recent Canvas fallback

#### Scenario: Multiple clean Views show the same Workspace Board

- **WHEN** more than one attached exact Board session is clean during a committed delivery
- **THEN** the Host SHALL serialize the mutation against all of them and publish the same authoritative Canvas document
  to every matching session

### Requirement: Canvas shortcuts follow delayed focus ownership and visible labels

The hosted Canvas SHALL enable its keyboard dispatcher after the asynchronously mounted editor Root gains focus or
pointer ownership. Editable, menu and modal boundaries SHALL retain their scoped keys. Every shortcut shown by Canvas
toolbar or context-menu presentation SHALL have one matching dispatcher binding with platform-correct primary modifier
semantics.

#### Scenario: Canvas becomes ready after an initial loading state

- **WHEN** the hosted Canvas first renders loading state, later mounts the editor Root and the user clicks the Canvas
- **THEN** the Root SHALL become the keyboard owner and editor shortcuts SHALL execute without reopening the View

#### Scenario: User invokes an advertised Canvas shortcut

- **WHEN** the Canvas owns keyboard focus and the user invokes Select, Hand, Group, Ungroup, zoom, undo, redo, copy,
  cut, paste, duplicate or delete through its displayed shortcut
- **THEN** exactly the matching Canvas command SHALL execute
- **AND** an active text input, menu, modal or IME composition SHALL prevent editor mutation according to its boundary
