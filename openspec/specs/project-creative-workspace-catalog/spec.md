# project-creative-workspace-catalog Specification

## Purpose

Define the owner-preserving searchable catalog used to inspect and navigate Project creative content without creating a second fact or mutation authority.

## Requirements

### Requirement: Workspace Creation uses one searchable card catalog

The Project Workspace Creation surface SHALL present Content documents, project-local Characters,
project-local Worlds, confirmed Project Entities, Entity candidates, and attached exact global
Character/World references in one compact card catalog. Every card SHALL preserve its exact owner,
identity, scope, availability, and navigation or command authority. The catalog MUST NOT create a
generic writable creative record or infer one owner from another.

#### Scenario: Mixed creative records are available

- **WHEN** an authorized Project contains records from multiple creative owners
- **THEN** the Creation surface shows type-specific cards in one catalog
- **AND** each card visibly identifies its type and Workspace or global-reference scope
- **AND** owner commands continue through their existing typed application path

#### Scenario: One record is invalid

- **WHEN** an owner projection contains an unavailable or invalid record
- **THEN** its card remains visible with a diagnostic and dependent actions disabled
- **AND** valid sibling records remain searchable and usable

### Requirement: Every creative card exposes readable details

Every catalog card SHALL provide a discoverable details control. Expanding it SHALL show the exact
type, scope, owner-qualified identity, status, available category/version/update metadata, and full
summary without requiring an editor View. Entity candidates, confirmed Entities, and exact global
references SHALL remain read-only in this surface, with their owning edit workflow stated clearly.

#### Scenario: User views an object without an editor View

- **WHEN** the user expands an Entity, candidate, invalid record, or exact global-reference card
- **THEN** the card reveals its available details in place
- **AND** the user can collapse the details without changing Project or domain facts
- **AND** the catalog does not fabricate an Entity Inspector or writable global-version path

### Requirement: Workspace Creation supports local discovery controls

The catalog SHALL support label/metadata search, type filtering, scope filtering, and stable
recent/name/type sorting as disposable Webview presentation state. Recent sorting SHALL use
owner-projected update or observation time and MUST NOT invent a timestamp for an invalid record.

#### Scenario: User searches and filters the catalog

- **WHEN** the user enters a query and selects a type or scope filter
- **THEN** only matching cards remain visible
- **AND** clearing the controls restores the complete authorized catalog
- **AND** no durable Project or domain fact changes

#### Scenario: A creative type has no current records

- **WHEN** the authorized catalog contains no card of a given type
- **THEN** the type is absent from the filter controls
- **AND** the product does not expose an empty future-feature group or require a feature flag

#### Scenario: User requests recent ordering

- **WHEN** records have owner-projected timestamps
- **THEN** the newest record appears first with stable label/identity tie-breaking
- **AND** undated invalid records remain visible after dated records

#### Scenario: Search has no result

- **WHEN** the Project contains creative records but none match the current controls
- **THEN** the surface shows an explicit no-results state
- **AND** it does not report that the Project itself is empty

### Requirement: Exact global references remain explicit

The catalog SHALL show only global Character/World versions explicitly referenced by the current
Project. The complete global catalogs SHALL remain behind an explicit add-reference control. A
reference card SHALL distinguish the global object label from the exact version label and preserve
the existing update, copy-to-Workspace, and remove operations.

#### Scenario: User adds and manages a global reference

- **WHEN** the user opens the add-reference control and selects an available exact version
- **THEN** the existing Project reference mutation adds that exact reference
- **AND** the resulting card shows its object and version labels separately
- **AND** update, copy, and remove delegate to the existing typed owner commands
