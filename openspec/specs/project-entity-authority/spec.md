# project-entity-authority Specification

## Purpose

Define the canonical Project Entity fact authority, rebuildable projections, reference-safe lifecycle and fail-local record behavior.

## Requirements

### Requirement: Confirmed Project Entities use one canonical fact authority

Confirmed character, scene, object, location, and style Entities SHALL be persisted in one canonical
project Entity document with owner-serialized atomic commits. The document SHALL own stable project ID,
kind, accepted names and facts, lifecycle and accepted representation bindings; it MUST
NOT contain rebuildable candidate scores, occurrences, availability, search rows, cache paths, or workflow
drafts.

#### Scenario: Commit a confirmed Entity change

- **WHEN** an authorized operation with exact request identity updates accepted facts
- **THEN** the workspace Entity owner serializes and atomically commits the change, then projects the result

#### Scenario: Concurrent fact change

- **WHEN** two editor or Agent operations overlap
- **THEN** the workspace Entity owner serializes them and each operation reads current authoritative facts
- **AND** neither operation overwrites another through a stale client snapshot

### Requirement: Detection produces searchable candidates without semantic authority

Workspace, document, Asset, and Media analysis SHALL emit rebuildable candidate and occurrence projections.
A candidate MUST NOT become a stable Project Entity or durable reference target until an explicit create,
confirm, merge, or import operation commits it to the project Entity authority.

#### Scenario: Detect a possible character

- **WHEN** analysis finds repeated character-like evidence in workspace content
- **THEN** the candidate becomes searchable with evidence and confidence while no confirmed Entity is created

#### Scenario: Candidate evidence disappears

- **WHEN** a source file is removed or re-analysis no longer supports an unconfirmed candidate
- **THEN** its projection may disappear without deleting or changing any confirmed Project Entity

### Requirement: Entity lifecycle preserves references and user facts

Project Entity merge, deprecate, and delete operations SHALL use explicit user or authorized Agent intent
and a typed project-reference plan. An operation that cannot account for a known reference MUST fail before
committing rather than leave a dangling or silently redirected reference.

#### Scenario: Merge two confirmed Entities

- **WHEN** every reference owner accepts a rewrite from the source Entity to the target Entity under the exact operation/request identity
- **THEN** the system atomically rewrites references, merges accepted facts, and marks the source lifecycle according to the plan

#### Scenario: Unknown reference blocks deletion

- **WHEN** an Entity is referenced by a project owner that cannot provide a valid rewrite or removal plan
- **THEN** deletion fails with the exact blocker and preserves the Entity and references

### Requirement: Availability is derived from owning resources

Entity and binding attention state SHALL be derived by resolving each representation through its owning
resource contract. Missing files, removed Media Library links, uninstalled Assets, changed fingerprints,
or unavailable accounts MUST NOT delete or mutate Project Entity facts.

#### Scenario: Bound content becomes unavailable

- **WHEN** a confirmed binding can no longer resolve its exact durable target
- **THEN** the Entity remains confirmed and the binding receives a rebuildable needs-attention projection

#### Scenario: Content returns unchanged

- **WHEN** the exact target and fingerprint become available again
- **THEN** availability is rebuilt without editing the canonical Entity document

### Requirement: Fragmented retired authorities are product-unreachable

Product startup, public entries, build output and ordinary tests MUST NOT inspect, classify, migrate,
archive or repair current character, per-kind, candidate, binding, visual draft and requirement files as
retired semantic authorities. Existing bytes remain untouched. Normal readers and writers for fragmented
semantic authority MUST be absent.

#### Scenario: Retired file remains beside canonical facts

- **WHEN** a retired file exists beside `neko/entities.json`
- **THEN** product runtime reads only the canonical document
- **AND** it leaves the retired file unchanged

#### Scenario: Encounter ambiguous or unknown data

- **WHEN** a retired file contains an ambiguous or unknown value
- **THEN** product runtime does not inspect or discard it
- **AND** any repair requires a separately authorized exact offline tool

#### Scenario: Retired reader is referenced

- **WHEN** a normal runtime path attempts to load semantic facts from a replaced fragmented file
- **THEN** repository reachability checks fail and the path cannot return success

### Requirement: Project open uses only the canonical Entity owner

The Entity Node application service SHALL read the canonical Entity document and publish valid records
with record-local diagnostics. Desktop SHALL only compose the service and SHALL NOT implement a retired
renderer, migration reader or app-local fallback.

#### Scenario: Canonical project contains valid character and candidate facts

- **WHEN** a project with canonical Entity facts is opened
- **THEN** the Entity owner validates records independently and refreshes the derived projection
- **AND** Resource Browser displays the valid Entity facts in the same opening flow

#### Scenario: One canonical Entity record is invalid

- **WHEN** one record reports an identity, binding or unknown-field blocker
- **THEN** project Entity projection exposes an exact record diagnostic
- **AND** valid sibling Entities remain available without reading retired files

#### Scenario: Canonical document metadata is unsupported

- **WHEN** the canonical document has valid structural fields plus unsupported document metadata
- **THEN** the Entity owner projects independently valid records with an exact document diagnostic
- **AND** strict mutation remains blocked while the original bytes remain untouched
- **AND** no version dispatch, compatibility reader or migration runs

#### Scenario: Canonical document belongs to another Project identity

- **WHEN** the canonical document declares a Project identity different from the active Workspace
- **THEN** the Entity facet exposes an exact owner-local diagnostic without adopting its records as current Project facts
- **AND** Files, Media, Assets, sibling Workspaces and the Desktop Shell remain usable
- **AND** only explicit user repair may change the original document
