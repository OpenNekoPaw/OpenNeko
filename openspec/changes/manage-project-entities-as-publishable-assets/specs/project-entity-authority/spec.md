## ADDED Requirements

### Requirement: Confirmed Project Entities use one versioned fact authority

Confirmed character, scene, object, location, and style Entities SHALL be persisted in one versioned
project Entity document with atomic expected-revision commits. The document SHALL own stable project ID,
kind, accepted names and facts, lifecycle, accepted representation bindings, and Asset provenance; it MUST
NOT contain rebuildable candidate scores, occurrences, availability, search rows, cache paths, or workflow
drafts.

#### Scenario: Commit a confirmed Entity change

- **WHEN** an authorized operation updates accepted facts against the current document revision
- **THEN** the repository atomically commits the new document revision and projects the resulting changes

#### Scenario: Concurrent fact change

- **WHEN** the document revision changed after an editor or Agent prepared an update
- **THEN** the commit fails with a revision conflict and does not overwrite newer facts

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

- **WHEN** every reference owner accepts a rewrite from the source Entity to the target Entity under the expected project revision
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

### Requirement: Fragmented legacy authorities are migrated or poisoned

Migration SHALL inventory and archive current character, per-kind, candidate, binding, visual draft, and
requirement files before writing the canonical Entity document. Every field MUST be classified as a
canonical fact, rebuildable projection, workflow-owned state, unresolved archived value, or explicit
user-confirmation item. After migration, normal readers and writers for fragmented semantic authority MUST
fail closed.

#### Scenario: Migrate unambiguous accepted facts

- **WHEN** source digests and project revision match the approved migration plan
- **THEN** the repository atomically commits the canonical document and records the immutable recovery archive

#### Scenario: Encounter ambiguous or unknown data

- **WHEN** a value cannot be safely classified or merged
- **THEN** migration preserves it in the archive and requires explicit resolution without silently discarding it

#### Scenario: Legacy reader is invoked after migration

- **WHEN** a normal runtime path attempts to load semantic facts from a replaced fragmented file
- **THEN** it fails with a migration diagnostic and does not return legacy success
