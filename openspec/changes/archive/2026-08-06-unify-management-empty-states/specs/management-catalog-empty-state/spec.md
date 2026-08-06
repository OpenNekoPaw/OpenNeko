## ADDED Requirements

### Requirement: Management catalogs use the shared empty-state structure

The Resource Center, Extensions, and All Projects management catalogs SHALL render empty data and filtered no-result states through the canonical `@neko/ui` EmptyState primitive while retaining domain-owned localized text and semantic icons.

#### Scenario: Resource Center has no matching items

- **WHEN** the active Resource Center catalog projection is ready and its filtered item collection is empty
- **THEN** the page renders the shared EmptyState with the localized Assets empty label and a resource-related icon

#### Scenario: Extension catalog has no matching items

- **WHEN** the active Skill or Extension tab has no matching items
- **THEN** the page renders the shared EmptyState with the localized Agent catalog label and package icon

#### Scenario: Project catalog has no matching items

- **WHEN** the All Projects catalog has no matching projects
- **THEN** the page renders the shared EmptyState with the localized project label and folder icon

### Requirement: Fill empty states occupy the complete collection lane

The shared EmptyState SHALL expose an opt-in fill layout that spans every grid column, fills available flex space, uses a stable minimum height, and centers a lightweight neutral icon and label without changing the default compact layout.

#### Scenario: Empty state appears in project grid view

- **WHEN** the All Projects collection is in grid view and has no matching project
- **THEN** its collection leaves the project grid and framed list presentation and the EmptyState occupies the complete remaining content area

#### Scenario: Empty state appears in an unframed resource collection

- **WHEN** the Resource Center has remaining vertical collection space and no matching item
- **THEN** its EmptyState expands within that space and keeps the icon and label centered

#### Scenario: Empty state appears in Extensions

- **WHEN** the active Extensions catalog has no matching item
- **THEN** its collection uses the same unframed remaining-content presentation as Resource Center rather than an empty list panel

#### Scenario: Existing compact consumer omits fill layout

- **WHEN** an existing consumer renders EmptyState without enabling fill layout
- **THEN** the primitive retains its compact minimum size and does not force flex growth or grid-column spanning

### Requirement: Empty-state presentation does not alter catalog behavior

The empty-state unification MUST NOT change catalog loading, diagnostics, filtering, sorting, mutations, selection, or persisted user data.

#### Scenario: Catalog is loading or unavailable

- **WHEN** a management catalog reports loading or unavailable status
- **THEN** its existing loading or diagnostic presentation remains authoritative and the ready-empty presentation does not mask it

#### Scenario: Catalog receives items

- **WHEN** a management catalog contains matching items
- **THEN** it renders its existing collection entries without an enclosing collection frame and does not render the shared EmptyState

### Requirement: Management collection shells are unframed

The Resource Center, Extensions, and All Projects collection shells SHALL remain unframed in both populated and empty states while individual interactive entries MAY retain their own boundaries.

#### Scenario: Extensions or projects contain entries

- **WHEN** Extensions or All Projects renders one or more matching entries
- **THEN** the collection has no enclosing border or raised background and each existing entry retains its own interaction styling
