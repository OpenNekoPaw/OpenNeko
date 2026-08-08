## ADDED Requirements

### Requirement: Media Library surface projects required-but-unlinked roots

The project Media Library surface SHALL combine filesystem-derived linked roots with target-free
required-library states derived from authoritative project references. A required-but-unlinked item
MUST NOT be represented as a linked root and MUST NOT change the OS link as the only runtime target
mapping.

#### Scenario: Required library has no workspace entry

- **WHEN** project references require `Footage` but filesystem inspection finds no
  `neko/assets/Footage` link
- **THEN** the project Media facet displays a missing required library item with its reference count
  and recover action
- **AND** normal browsing remains unavailable until recovery succeeds

#### Scenario: Global Asset center is open

- **WHEN** the project surface projects a missing or recovered library
- **THEN** it does not read or mutate global Asset center active state, filters, view mode, or
  selection

### Requirement: Media Library recovery actions remain explicit and state-scoped

The project Media Library surface SHALL expose recover, relink, remove-link, and portability actions
as distinct revisioned intents. It MUST NOT expose a generic repair action that guesses a directory,
copies an entire library, or reports partial mutation as success.

#### Scenario: Recover a missing required root

- **WHEN** the user invokes recover for one required-unlinked library
- **THEN** the surface requests a recovery plan and presents only safe candidate and validation state
- **AND** mutation occurs only after explicit confirmation

#### Scenario: Remove an available but required link

- **WHEN** the user confirms removal of a linked root that still has authoritative references
- **THEN** the Host removes only the link
- **AND** the surface immediately retains the root as required-unlinked with a visible diagnostic

#### Scenario: Create a portable project snapshot

- **WHEN** the user invokes the project portability action
- **THEN** the owning project lifecycle surface shows plan, progress, cancellation, completion, and
  failure state for a new independent destination
- **AND** the project Media Library remains a browser rather than owning copy transaction state

#### Scenario: Project navigation is idle

- **WHEN** no portability operation requires user attention
- **THEN** the primary application sidebar does not display a persistent portability icon or healthy
  zero-reference status
- **AND** the exact Project context menu exposes the portability command while Media facet items
  continue to display library-level availability, missing counts, diagnostics, and recovery actions

### Requirement: Media Library status remains stable across list and grid presentation

Required, unavailable, incomplete, and unreferenced link states SHALL retain the same identity,
diagnostic, capabilities, and selection behavior in list and grid layouts.

#### Scenario: Switch view mode with a missing required library selected

- **WHEN** the user changes between list and grid layouts
- **THEN** the same required-library item remains selected and exposes the same recover capability
- **AND** no placeholder linked root or global catalog item is created

#### Scenario: One project document cannot provide references

- **WHEN** one Canvas or Cut project document cannot be validated while Media Library
  roots remain inspectable
- **THEN** the Media Library surface keeps the inspectable roots available and reports project
  reference coverage as incomplete
- **AND** the owner diagnostic does not replace the entire library projection with a remote-method
  error or silently claim complete portability

### Requirement: Global Library management follows the shared Home management composition

The global Media Library and Asset Library surface SHALL use the same constrained content width,
header hierarchy, command sizing, toolbar rhythm, and responsive stacking as other Home management
surfaces while retaining Assets ownership of library interactions and presentation.

#### Scenario: Compare Extensions and Media Library surfaces

- **WHEN** the user switches between Extensions and the global Media Library
- **THEN** both surfaces align their eyebrow, title, description, primary commands, search toolbar,
  and content start position
- **AND** Media Library list/grid browsing, directory activation, thumbnail preview, and mutations
  remain owned by the existing Global Library browser

### Requirement: Restored Media facet navigation cannot hide a fresh root projection

The Resource Browser SHALL validate retained facet navigation against each new authoritative projection before
filtering visible items.

#### Scenario: Media facet remounts after browsing a library

- **WHEN** a previous Media container identity is retained but the remounted search returns the Media root
- **THEN** the facet returns to root and displays every available linked library
- **AND** it does not describe the root as an empty successful result
