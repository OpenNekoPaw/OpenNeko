## ADDED Requirements

### Requirement: Bounded normalized text extraction

The system SHALL extract normalized semantic segments from supported Markdown, plain text, Fountain, JSON, and YAML sources through `@neko/content`. Every segment MUST preserve portable source provenance and a stable source range or structured path. Unsupported, oversized, unreadable, invalidly encoded, or structurally invalid sources MUST fail visibly rather than fall back to another format.

#### Scenario: Markdown source is extracted

- **WHEN** an eligible UTF-8 Markdown source is analyzed
- **THEN** visible headings, paragraphs, lists, and table text become ordered segments with source ranges and Markdown structure metadata

#### Scenario: Fountain source is extracted

- **WHEN** an eligible Fountain source is analyzed
- **THEN** scene headings, character cues, dialogue, and action become typed ordered segments with source ranges

#### Scenario: JSON or YAML source is invalid

- **WHEN** a registered structured-text source cannot be parsed according to its declared format
- **THEN** analysis returns a format diagnostic and does not reinterpret the content as plain text

### Requirement: Analysis mode controls candidate discovery

The analyzer SHALL respect each source scope's analysis mode. `link-existing` SHALL permit mentions of confirmed entities but MUST NOT create new entity candidates; `discover-candidates` SHALL additionally permit structurally supported new candidate mentions; `off` SHALL produce no semantic entity analysis.

#### Scenario: Generic Markdown uses link-existing mode

- **WHEN** a generic workspace Markdown source in `link-existing` mode names a confirmed entity and an unknown proper name
- **THEN** the confirmed entity occurrence is projected and no new candidate is created for the unknown name

#### Scenario: Creative source enables candidate discovery

- **WHEN** a Fountain or explicitly configured creative source in `discover-candidates` mode contains a supported new character cue
- **THEN** the analyzer creates or updates a candidate projection with its structural evidence

### Requirement: Deterministic confirmed-entity linking

The analyzer SHALL link a mention automatically only when it carries a valid stable entity reference or when canonical-name/alias matching yields one kind-compatible confirmed entity. It MUST return an ambiguous projection instead of selecting among multiple possible entities.

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

New candidate mentions SHALL be aggregated by compatible entity kind and normalized name within a workspace partition. Repeated mentions MUST accumulate evidence, distinct source count, occurrence count, provenance, and freshness instead of creating one review item per mention.

#### Scenario: Candidate appears repeatedly

- **WHEN** the same normalized character name appears in multiple eligible sources
- **THEN** one candidate projection contains all non-duplicate mention evidence and distinct source counts

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

### Requirement: Exception-oriented review projection

The default candidate review surface SHALL show aggregated `suggested` and `ambiguous` clusters rather than every mention. It SHALL prioritize ambiguity, distinct source count, occurrence count, and recent changes and SHALL expose the supporting source ranges used for each decision.

#### Scenario: Many mentions form one review item

- **WHEN** ten mentions belong to one candidate cluster
- **THEN** the user sees one review item with ten occurrences and navigable evidence rather than ten approval rows

#### Scenario: Matched and low-signal candidates are hidden by default

- **WHEN** candidates are `matched` or `observed`
- **THEN** they remain queryable for diagnostics but do not interrupt the user in the default review queue

### Requirement: SQLite projection and project-fact authority

Source fingerprint, text segments, entity mentions, candidate matches, occurrences, and automatic candidate state SHALL be stored only as cache-owned projections in the user-level `~/.neko/neko.db`. Confirmed entities, bindings, explicit project candidate decisions, and other user-confirmed semantics MUST remain owning project facts.

#### Scenario: Automatic analysis completes

- **WHEN** a source produces new mentions and candidates
- **THEN** the system atomically replaces the source's SQLite evidence/projections and does not write `neko/entities/candidates.json`

#### Scenario: SQLite projection update fails after fact commit

- **WHEN** a user-confirmed entity fact is saved but its projection refresh fails
- **THEN** the entity fact remains successful and the projection is marked stale with a diagnostic

### Requirement: Explicit candidate decisions are durable

Saving a candidate for project review, dismissing it, rejecting a merge, or promoting it SHALL require an explicit user action and SHALL write an owning project decision or confirmed entity fact before updating projections. Cache cleanup MUST NOT erase the only record of such a decision.

#### Scenario: User promotes a suggestion

- **WHEN** the user confirms a suggested candidate as a new entity
- **THEN** the owning entity fact is written with provenance before the candidate projection becomes `promoted`

#### Scenario: User dismisses a candidate

- **WHEN** the user explicitly dismisses a candidate for the project
- **THEN** a durable project candidate decision is written and later cache rebuilds continue to suppress the same semantic candidate until that decision changes

### Requirement: No direct vector identity confirmation

The first-phase analyzer MUST NOT require embeddings, TurboVec, OCR, ASR, image/audio/video analysis, or nearest-vector identity matching. A future vector retriever MAY contribute recall evidence but MUST NOT independently confirm, merge, or overwrite an Entity.

#### Scenario: Names are semantically similar but not exact

- **WHEN** a candidate name is similar to a confirmed entity but has no stable reference or unique exact canonical/alias match
- **THEN** the system keeps it observed, suggested, or ambiguous and does not auto-link based on semantic similarity

### Requirement: Source-scoped atomic replacement

The analyzer output SHALL be committed as one source-scoped replacement bound to the input fingerprint and confirmed-entity revision. Partial evidence, empty-success fallback, or stale analyzer output MUST NOT replace a previously valid projection.

#### Scenario: Analyzer fails after producing partial mentions

- **WHEN** extraction or linking fails before the complete replacement is committed
- **THEN** no partial new evidence is visible and the previous projection remains stale with a diagnostic

#### Scenario: Entity facts change during analysis

- **WHEN** the confirmed-entity revision changes before candidate/link results commit
- **THEN** the result is rejected or relinked against the new revision before becoming fresh

### Requirement: LSP-style Host projection reuses the analysis core

VS Code diagnostics, navigation, document symbols, or candidate actions SHALL consume the same semantic evidence and Entity analyzer contract used by other Hosts. The Extension MUST NOT start a second Entity authority or independent LSP database.

#### Scenario: User navigates from an entity mention

- **WHEN** a saved source has a linked mention projection
- **THEN** the VS Code adapter resolves navigation from the shared evidence without reparsing the file in a separate authority

#### Scenario: Unsaved editor content is analyzed

- **WHEN** the VS Code adapter offers analysis for an unsaved text buffer
- **THEN** the result remains session-only until save and does not create SQLite candidate state or project facts
