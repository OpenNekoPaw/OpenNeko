## ADDED Requirements

### Requirement: Entity Asset instantiation creates an independent Project Entity

Instantiating an installed Entity Asset SHALL create a new Project Entity ID from the immutable snapshot
and record origin `assetId`, applied revision and digest, and an import base. The Asset ID MUST NOT become
the Project Entity ID, and later project edits MUST NOT mutate the installed package.

#### Scenario: Instantiate the same Entity Asset twice

- **WHEN** the user instantiates one Entity Asset revision twice in a project
- **THEN** the project receives two independently editable Entity IDs with the same origin provenance

### Requirement: Entity publication snapshots validated portable semantics

Publishing a Project Entity SHALL create a frozen Entity Asset snapshot through the Entity owner and then
submit it through the generic Asset publication lifecycle. Every representation MUST be package-owned or
an exact declared Asset dependency; absolute paths, physical link targets, cache paths, and inaccessible
external files MUST be rejected.

#### Scenario: Publish an Entity with workspace-owned representations

- **WHEN** selected representations can be copied into a portable package and semantic validation succeeds
- **THEN** the system publishes a new immutable Entity Asset revision without mutating the Project Entity

#### Scenario: Publish an Entity using linked external media

- **WHEN** a selected representation exists only through a Media Library link and has not been copied or declared as an Asset dependency
- **THEN** publication fails with an action to package or replace that representation

### Requirement: Entity Asset distribution uses generic Asset cloud sync

The system SHALL use the Asset Library cloud synchronization contract for Entity Asset upload, download,
dependency transfer, offline installation, conflict detection, and remote tombstones. It MUST NOT create an
Entity-specific remote catalog, credential store, synchronization cursor, or background upload of the
project Entity document.

#### Scenario: Synchronize an Entity Asset

- **WHEN** generic Asset synchronization pulls a valid Entity Asset revision
- **THEN** it installs the immutable package without creating or changing any Project Entity

#### Scenario: Project facts change after publication

- **WHEN** the user edits a Project Entity whose earlier snapshot was published
- **THEN** background Asset synchronization does not upload those edits and a new explicit publication is required

### Requirement: Entity Asset updates use explicit three-way diff and apply

Updating an instantiated Project Entity SHALL compare the recorded import base, current Project Entity,
and selected new Entity Asset snapshot. Non-conflicting selected changes MAY be committed under expected
project revision; conflicting facts MUST remain unchanged until explicitly resolved.

#### Scenario: Apply a non-conflicting upstream change

- **WHEN** a new Asset revision changes a fact that the project has not changed since the import base and the user accepts it
- **THEN** the Entity owner commits the change and records the newly applied Asset revision

#### Scenario: Upstream and project both changed a fact

- **WHEN** the three-way diff detects incompatible edits to the same semantic fact
- **THEN** apply pauses that fact with a conflict and preserves the current Project Entity value

### Requirement: Asset lifecycle does not control Project Entity lifecycle

Uninstalling or remotely deleting an Entity Asset SHALL NOT delete, deprecate, overwrite, or unbind a
Project Entity instantiated from it. Project Entity deletion or deprecation SHALL NOT remove the Asset
package.

#### Scenario: Uninstall an origin Asset

- **WHEN** removal is otherwise allowed and the user uninstalls an Entity's origin Asset revision
- **THEN** the Project Entity and its project-owned facts remain intact while provenance availability becomes unavailable
