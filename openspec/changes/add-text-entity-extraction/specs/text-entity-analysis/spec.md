## ADDED Requirements

### Requirement: Transient bounded text extraction

The system SHALL extract text through `@neko/content` into bounded transient analysis segments. Every segment MUST preserve portable source provenance, a document unit locator, and a stable range or structured path. Complete segment text MUST remain analyzer input or session-only data and MUST NOT be part of the persistent semantic evidence contract.

#### Scenario: Markdown source is extracted

- **WHEN** an eligible UTF-8 Markdown source is analyzed
- **THEN** visible headings, paragraphs, lists, and table text become ordered transient segments with source ranges and Markdown structure metadata

#### Scenario: Fountain source is extracted

- **WHEN** an eligible Fountain source is analyzed
- **THEN** scene headings, character cues, dialogue, and action become typed transient segments with source ranges

#### Scenario: Analysis batch completes

- **WHEN** mentions and occurrences have been derived from a transient segment batch
- **THEN** the complete batch text is released and only compact evidence eligible for source-scoped replacement remains

### Requirement: Document containers use stable unit locators

PDF, EPUB, and DOCX analysis SHALL reuse `DocumentAccessService` manifest, cursor, and range-read contracts rather than introducing another parser authority. PDF evidence MUST use page locators, EPUB evidence MUST use chapter locators, and DOCX evidence MUST use section or paragraph locators that can be resolved for later context reads.

#### Scenario: PDF text layer is analyzed

- **WHEN** an eligible PDF has a readable text layer
- **THEN** the analyzer reads bounded page units and projects evidence that can navigate back to the originating page and range

#### Scenario: EPUB chapters are analyzed

- **WHEN** an eligible DRM-free EPUB is analyzed
- **THEN** the analyzer reads bounded chapter units in manifest order and preserves chapter locators in projected evidence

#### Scenario: DOCX paragraphs are analyzed

- **WHEN** an eligible DOCX is analyzed
- **THEN** the analyzer reads bounded section or paragraph units and preserves resolvable locators instead of persisting the extracted document body

### Requirement: Creative schema adapters gate structured text

JSON and YAML SHALL be analyzed only when an owning-domain adapter recognizes a supported creative schema ID and version. The adapter SHALL expose only schema-defined creative text/entity fields with stable structured paths. Invalid, unknown, or unregistered schemas MUST NOT fall back to generic string-scalar or plain-text analysis.

#### Scenario: Known Story schema is analyzed

- **WHEN** a registered Story JSON or YAML source declares a supported schema version
- **THEN** only the adapter-defined creative fields become transient segments with schema paths and entity-kind hints

#### Scenario: Unknown structured schema is encountered

- **WHEN** a JSON or YAML source has no registered adapter or declares an unsupported schema version
- **THEN** analysis is rejected or excluded with a typed schema diagnostic and does not scan arbitrary string values

### Requirement: Document extraction failures are explicit

Unsupported, unreadable, invalidly encoded, structurally invalid, DRM-protected, scanned-only, stale, or over-budget sources SHALL fail visibly with typed diagnostics. The analyzer MUST NOT reinterpret them as another format, call OCR automatically, or commit partial/empty success.

#### Scenario: Scanned PDF has no usable text

- **WHEN** a PDF page set contains no usable text layer under the extraction policy
- **THEN** the source receives an `ocr-required` diagnostic and no text evidence replacement is committed

#### Scenario: DRM-protected document is opened

- **WHEN** PDF or EPUB access detects DRM or encrypted content that cannot be read
- **THEN** analysis returns a DRM diagnostic and does not bypass protection or retain extracted bytes

#### Scenario: Analysis exceeds source budget

- **WHEN** unit count, extracted characters, elapsed time, or cancellation ends analysis before a complete replacement is available
- **THEN** no partial projection becomes fresh and the source reports the corresponding diagnostic

### Requirement: Analysis mode controls candidate discovery

The analyzer SHALL respect each source scope's analysis mode. `link-existing` SHALL permit mentions of confirmed entities but MUST NOT create new entity candidates; `discover-candidates` SHALL additionally permit structurally supported new candidate mentions; `off` SHALL produce no semantic entity analysis.

#### Scenario: Generic Markdown uses link-existing mode

- **WHEN** a generic workspace Markdown source in `link-existing` mode names a confirmed entity and an unknown proper name
- **THEN** the confirmed entity occurrence is projected and no new candidate is created for the unknown name

#### Scenario: Creative source enables candidate discovery

- **WHEN** a Fountain, NKS/Story, or registered creative-schema source in `discover-candidates` mode contains a supported new character cue or entity field
- **THEN** the analyzer creates or updates a candidate projection with its structural evidence

### Requirement: Deterministic confirmed-entity linking

The analyzer SHALL link a mention automatically only when it carries a valid stable entity reference or when boundary-aware canonical-name/alias matching yields one kind-compatible confirmed entity. It MUST return an ambiguous projection instead of selecting among multiple possible entities.

#### Scenario: Stable entity reference is present

- **WHEN** a supported source contains a valid reference to an existing confirmed entity ID
- **THEN** the mention is linked to that entity and records reference provenance

#### Scenario: Unique exact alias matches

- **WHEN** a boundary-aware normalized alias maps to exactly one compatible confirmed entity
- **THEN** the occurrence is automatically linked without entering the review queue

#### Scenario: Exact name is ambiguous

- **WHEN** the normalized name maps to multiple confirmed entities or incompatible kinds
- **THEN** no entity is selected and one aggregated ambiguous review item is projected

### Requirement: Candidate aggregation by semantic identity key

New candidate mentions SHALL be aggregated by compatible entity kind and normalized name within a workspace partition. Repeated mentions MUST accumulate compact evidence references, distinct source count, occurrence count, provenance, and freshness instead of creating one review item per mention.

#### Scenario: Candidate appears repeatedly

- **WHEN** the same normalized character name appears in multiple eligible sources
- **THEN** one candidate projection references all non-duplicate occurrence locators and distinct source counts

#### Scenario: Same name has incompatible kinds

- **WHEN** structural evidence classifies the same normalized label as incompatible entity kinds
- **THEN** the system preserves separate kind clusters and emits an ambiguity diagnostic rather than merging them

### Requirement: Automatic candidate triage

The system SHALL classify automatic candidate projections as `observed`, `matched`, `suggested`, or `ambiguous`. A new candidate SHALL become `suggested` only when it has evidence from at least two distinct logical sources or at least three explicit structural mentions in one source. Confidence alone MUST NOT confirm or promote a candidate.

#### Scenario: Single weak mention remains silent

- **WHEN** a new candidate has one eligible mention and no ambiguity
- **THEN** it remains `observed` in SQLite and is omitted from the default review view

#### Scenario: Repeated structural evidence creates a suggestion

- **WHEN** a candidate reaches the distinct-source or structural-occurrence threshold
- **THEN** it becomes one `suggested` review item ordered by accumulated evidence

#### Scenario: Candidate links to a confirmed entity

- **WHEN** later entity facts make an observed candidate a unique exact match
- **THEN** the projection becomes `matched`, its occurrences link to the confirmed entity, and it leaves the default review view

### Requirement: Compact SQLite evidence excludes source bodies

Source fingerprint, unit locator/range, content hash, entity mention, candidate match, occurrence, provider/schema metadata, freshness, and diagnostics SHALL be stored as cache-owned projections in user-level `~/.neko/neko.db`. Complete page, chapter, section, paragraph, segment, document binary, embedded media, or a payload that reconstructs the source body MUST NOT be persisted in semantic evidence, search projections, or entity projections.

#### Scenario: Automatic analysis completes

- **WHEN** a source produces new mentions and candidates
- **THEN** the system atomically replaces compact SQLite evidence/projections and does not persist the analyzed segment text or write `neko/entities/candidates.json`

#### Scenario: SQLite rows are inspected

- **WHEN** all semantic evidence and related projection payloads for a source are decoded
- **THEN** they contain locators, hashes, entity relations, versions, freshness, and diagnostics but no complete extracted source text

#### Scenario: Existing text-segment cache is upgraded

- **WHEN** the Host opens a semantic cache written with the legacy persistent `MediaTextSegment.text` contract
- **THEN** affected cache rows are marked incompatible and cleared for rebuild without modifying source documents, confirmed facts, Asset facts, or user candidate decisions

### Requirement: Entity and record queries are bidirectional

The query service SHALL support Entity-to-occurrence lookup and occurrence/mention/locator-to-Entity-or-Candidate lookup. Query results MUST carry source identity, unit locator, range, freshness, and provenance and MUST NOT require persisted source body text.

#### Scenario: User searches from an Entity

- **WHEN** a consumer queries a confirmed Entity ID
- **THEN** the service returns its related occurrences across eligible sources with navigable locators and freshness

#### Scenario: User searches from a record

- **WHEN** a consumer selects an occurrence, mention, or supported source locator
- **THEN** the service returns linked confirmed Entities, Candidate clusters, or ambiguity diagnostics for that record

#### Scenario: Consumer requests visible context

- **WHEN** a consumer needs text surrounding a query result
- **THEN** it calls `DocumentAccessService.readRange()` with the stored locator and verifies the source fingerprint before using session-only context

#### Scenario: Source changed after indexing

- **WHEN** a context read detects that the stored fingerprint or locator is stale
- **THEN** the service returns a stale diagnostic and schedules reanalysis rather than returning mismatched text

### Requirement: Exception-oriented review projection

The default candidate review surface SHALL show aggregated `suggested` and `ambiguous` clusters rather than every mention. It SHALL prioritize ambiguity, distinct source count, occurrence count, and recent changes and SHALL expose navigable supporting locators.

#### Scenario: Many mentions form one review item

- **WHEN** ten mentions belong to one candidate cluster
- **THEN** the user sees one review item with ten occurrences and navigable evidence rather than ten approval rows

#### Scenario: Matched and low-signal candidates are hidden by default

- **WHEN** candidates are `matched` or `observed`
- **THEN** they remain queryable for diagnostics but do not interrupt the user in the default review queue

### Requirement: Explicit candidate decisions are durable

Saving a candidate for project review, dismissing it, rejecting a merge, or promoting it SHALL require an explicit user action and SHALL write an owning project decision or confirmed entity fact before updating projections. Cache cleanup MUST NOT erase the only record of such a decision.

#### Scenario: User promotes a suggestion

- **WHEN** the user confirms a suggested candidate as a new entity
- **THEN** the owning entity fact is written with provenance before the candidate projection becomes `promoted`

#### Scenario: User dismisses a candidate

- **WHEN** the user explicitly dismisses a candidate for the project
- **THEN** a durable project candidate decision is written and later cache rebuilds continue to suppress the same semantic candidate until that decision changes

### Requirement: No vector or media dependency in phase one

The first-phase analyzer MUST NOT require embeddings, TurboVec, LLM NER, OCR, ASR, Vision, image/audio/video analysis, or nearest-vector identity matching. Embedded document media SHALL be represented only by `ResourceRef` for an independent media pipeline. A future retriever MAY contribute recall evidence but MUST NOT independently confirm, merge, or overwrite an Entity.

#### Scenario: Names are semantically similar but not exact

- **WHEN** a candidate name is similar to a confirmed entity but has no stable reference or unique exact canonical/alias match
- **THEN** the system keeps it observed, suggested, or ambiguous and does not auto-link based on semantic similarity

#### Scenario: Document contains an embedded image

- **WHEN** DOCX or EPUB extraction discovers an embedded image
- **THEN** the text analyzer records at most a resource reference and does not invoke OCR or Vision

### Requirement: Variable character state remains an evidence-derived projection

Character State and Memory/Belief SHALL NOT be materialized by this phase as fixed fields on Entity or occurrence records. Evidence MAY preserve source locator, provenance, and later-compatible time/viewpoint hints, but any future state or timeline view MUST be derived separately and allow conflicting narrative evidence.

#### Scenario: Sources describe conflicting character state

- **WHEN** two occurrences describe different clothing, location, injury, emotion, faction, knowledge, or belief
- **THEN** phase-one indexing preserves separate evidence relations and does not overwrite the Entity or force one canonical state

### Requirement: Source-scoped atomic replacement

Analyzer output SHALL be committed as one source-scoped replacement bound to the input fingerprint and confirmed-entity revision. Partial evidence, empty-success fallback, stale analyzer output, and legacy body-bearing payloads MUST NOT replace a valid compact projection.

#### Scenario: Analyzer fails after producing partial mentions

- **WHEN** extraction or linking fails before the complete replacement is committed
- **THEN** no partial new evidence is visible and the previous projection remains stale with a diagnostic

#### Scenario: Entity facts change during analysis

- **WHEN** the confirmed-entity revision changes before candidate/link results commit
- **THEN** the result is rejected or relinked against the new revision before becoming fresh

#### Scenario: Persistent payload contains source body text

- **WHEN** repository validation receives a legacy or malformed evidence payload containing complete segment text
- **THEN** replacement fails visibly and does not retain a dual-read or fallback path

### Requirement: LSP-style Host projection reuses the analysis core

VS Code diagnostics, navigation, document symbols, or candidate actions SHALL consume the same semantic evidence and Entity analyzer contract used by other Hosts. The Extension MUST NOT start a second Entity authority or independent LSP database.

#### Scenario: User navigates from an entity mention

- **WHEN** a saved source has a linked mention projection
- **THEN** the VS Code adapter resolves navigation from shared compact evidence and reads visible context through the source locator

#### Scenario: Unsaved editor content is analyzed

- **WHEN** the VS Code adapter offers analysis for an unsaved text buffer
- **THEN** the result remains session-only until save and does not create SQLite candidate state or project facts

### Requirement: Agent Entity references resolve canonical project facts

Agent mention search SHALL project only a stable Entity identity, kind, label, summary, and navigation metadata into the Webview. When a selected Entity reference enters an Agent turn, the Host SHALL resolve the canonical `CreativeEntity` snapshot through the existing Entity facade using the trusted workspace/conversation context. The Agent runtime MUST receive a strictly validated resolved entity context and MUST NOT treat an unresolved label or summary as the referenced Entity facts.

#### Scenario: User attaches a confirmed Entity

- **WHEN** the user selects an Entity mention whose stable source identity resolves to one kind-compatible confirmed Entity
- **THEN** the Extension reads that Entity through the canonical facade and the Agent turn receives its ID, kind, canonical/display name, aliases, status, and metadata as grounded context

#### Scenario: Webview projects an Entity search result

- **WHEN** Project Search returns an Entity mention candidate
- **THEN** the Webview receives only the stable identity and navigation projection needed for selection and does not become an owner of the full Entity project fact

#### Scenario: User selects a projected Entity mention

- **WHEN** the user activates a highlighted Entity mention candidate
- **THEN** the composer removes the active mention query, closes the menu, and displays one Entity context reference bound to that candidate's stable identity

#### Scenario: Agent Webview assets change between builds

- **WHEN** a new Webview build changes the Entity mention selection implementation
- **THEN** the Extension loads content-addressed JS and CSS paths from the validated build manifest and cannot reuse a prior fixed-path bundle as a successful fallback

#### Scenario: Entity reference cannot be resolved

- **WHEN** the Entity facade is unavailable, the Entity no longer exists, the resolved kind differs from the mention identity, or the workspace context is invalid
- **THEN** the turn fails visibly before provider dispatch and does not fall back to the mention label, summary, another active workspace, or a stale cached Entity snapshot

#### Scenario: User starts roleplay from a confirmed Entity result

- **WHEN** the roleplay selector submits a confirmed character Entity's stable `entityId`
- **THEN** the Extension creates an explicit character `CreativeEntityRef` for Character Dialogue assembly and does not reinterpret the ID as a name or open a fallback picker

#### Scenario: Roleplay stable Entity reference is invalid

- **WHEN** an explicit roleplay Entity token has no stable ID or the canonical assembler cannot resolve it as a character
- **THEN** Character Dialogue fails visibly and does not fall back to the projected label, an active Entity, another workspace, or name-based guessing

#### Scenario: Automatic Entity candidate appears in roleplay search scope

- **WHEN** semantic extraction has produced an observed, suggested, or ambiguous character Candidate that has not been explicitly promoted
- **THEN** the roleplay selector may display it only as a Candidate with an explicit confirmation action and MUST NOT label or launch it as an already confirmed playable Entity

#### Scenario: User explicitly confirms a roleplay Candidate

- **WHEN** the user selects “confirm and roleplay” for an open automatic character Candidate or named context-script Candidate carrying a stable Project Search item identity
- **THEN** the Host re-resolves that exact Search item by stable identity without depending on display-page limits, verifies its confirmable character Candidate identity and portable source ref, writes the Candidate and confirmed Entity through the canonical Entity facade, and starts Character Dialogue only with the returned confirmed `CreativeEntityRef`

#### Scenario: Roleplay Candidate projection is stale or forged

- **WHEN** the submitted Search item identity no longer resolves, resolves to a non-character or non-Candidate item, or the Entity facade cannot confirm it
- **THEN** the operation fails visibly without trusting Webview label/metadata, writing a guessed Entity, falling back to name resolution, or starting Character Dialogue

#### Scenario: Named context-script Candidate appears without a confirmed Entity

- **WHEN** context-script projection contains a named character Candidate with a stable Search identity and project-portable source location
- **THEN** the roleplay selector displays it as a Candidate with an explicit confirmation action and MUST NOT synthesize or launch a confirmed Entity directly from its label

#### Scenario: Canonical Entity Search reads automatic Candidate projections

- **WHEN** compact semantic metadata contains an open automatic `entity-candidate` projection
- **THEN** the canonical Entity Search adapter returns it alongside Entity facts, without restoring a Dashboard or compatibility creative-entity adapter as a second owner

#### Scenario: Character role tab restores without ordinary conversation lookup

- **WHEN** a Character Dialogue or Embody Character tab is restored after its role session starts
- **THEN** the Webview restores only role-session state and MUST NOT request an ordinary conversation snapshot or settings using the role session ID

### Requirement: Removed Dashboard surface cannot remain an Entity authority

After removal of the Dashboard UI, the system MUST NOT retain or consume a `DashboardCreativeEntity` source/state/detail contract, Dashboard creative-entity command, Dashboard row Project Search projection, or Dashboard-based Character Dialogue fallback. Entity consumers SHALL use the canonical Entity facade and stable `CreativeEntityRef`; evidence consumers SHALL use explicit occurrence, relationship, representation, or semantic-locator ports owned by the relevant domain.

Any asynchronous task mirror that remains owned by Agent or Chat MUST use the host-neutral `TaskProjection` contract. The system MUST NOT retain `DashboardTask`, `DashboardProject`, or a Dashboard-named Agent work-item source as an alias or parallel path.

#### Scenario: Agent searches confirmed project entities

- **WHEN** Agent Project Search queries the `creative-entities` partition
- **THEN** results come from the canonical Entity adapter and no Dashboard state/source command is executed

#### Scenario: Character Dialogue assembles a selected role

- **WHEN** the controller receives a stable confirmed character Entity ID
- **THEN** profile assembly reads that Entity through the canonical Entity service and no Dashboard detail/source lookup, candidate fallback, or source-specific ID conversion participates

#### Scenario: Optional character evidence provider is unavailable

- **WHEN** no canonical relationship, occurrence, representation, or semantic context provider is registered
- **THEN** the evidence boundary returns an explicit empty/diagnostic projection and does not recover by invoking a removed Dashboard command

#### Scenario: Existing project data is opened after cleanup

- **WHEN** a project contains confirmed Entities, candidate decisions, bindings, visual drafts, character memory, or semantic occurrence cache created before this cleanup
- **THEN** those owning stores remain readable and the removed Dashboard display state is neither migrated nor treated as project authority

#### Scenario: Agent replays a recovered asynchronous task

- **WHEN** Chat restores a terminal Agent task after Extension restart
- **THEN** the task is projected through `TaskProjection` and no Dashboard-named DTO, source, export, or compatibility adapter participates
