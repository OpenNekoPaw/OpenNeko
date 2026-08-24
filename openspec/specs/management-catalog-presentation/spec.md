# management-catalog-presentation Specification

## Purpose

Define the shared presentation hierarchy, density, responsive behavior and feedback language for package-owned management catalogs.

## Requirements

### Requirement: Management catalogs share one page hierarchy

Project Management, Works, Asset Center, Character Management and World Management SHALL align their page title, toolbar and catalog to the same bounded content track while retaining their package-owned Roots and interactions.

#### Scenario: User moves between management scenes

- **WHEN** the user navigates between Project, Works, Asset, Character and World catalogs at the same window width
- **THEN** headings, toolbars and collections use a consistent left edge, maximum content width and vertical rhythm
- **AND** only the current scene Root is mounted

### Requirement: Management catalogs use the Extension catalog density language

Project Management, Works, Asset Center, Character Management and World Management SHALL use the Extension catalog as the reference for compact heading scale, toolbar control height, secondary action treatment, card surface hierarchy and identity-icon geometry. Scene-specific information SHALL remain visible without reintroducing oversized page headings or visually dominant import/open controls.

#### Scenario: User compares management scenes with Extension management

- **WHEN** the user moves from Extension management to Project, Works, Asset, Character or World management
- **THEN** the page uses the same compact control rhythm, quiet outlined actions, 13px card boundary and 32px identity-icon language
- **AND** title, toolbar and card content retain the owning domain's labels and operations

### Requirement: Catalog cards share interaction styling without sharing domain ownership

Management catalog cards SHALL use a consistent boundary, corner radius, raised surface, hover, focus, selected-state and compact identity-icon visual language. Each domain owner SHALL continue to determine card content, diagnostics and actions.

#### Scenario: User inspects or selects a card

- **WHEN** a card is hovered, keyboard-focused or selected
- **THEN** the state is visibly distinguishable without moving the card or clipping its top border
- **AND** owner-defined invalid or unavailable diagnostics remain visible and local

### Requirement: Card dimensions match scene content density

The management catalogs SHALL use bounded card widths chosen for their content: wide cards for Project and World, medium identity cards for Character, and compact thumbnail cards for Asset. Sparse rows SHALL align to the start edge and SHALL NOT stretch cards to fill the content track.

#### Scenario: Wide catalog contains a sparse final row

- **WHEN** fewer cards remain than the current row can contain
- **THEN** each card keeps its scene-specific width and height rhythm
- **AND** the remaining cards align to the catalog start edge

#### Scenario: Catalog width decreases

- **WHEN** the available width cannot contain the current number of bounded cards
- **THEN** the grid reduces columns without horizontal clipping
- **AND** a single card may shrink only when the container is narrower than its normal scene width

### Requirement: Search fields consume available toolbar width

Each management catalog search field SHALL use the shared bounded control height and become a full row when the available width is insufficient for the search and existing controls. Works SHALL expose the same compact search presentation even before its durable catalog is connected.

#### Scenario: Management toolbar wraps

- **WHEN** the catalog enters a narrow container
- **THEN** search remains readable at the full available row width
- **AND** existing sort, view, import or creation controls remain reachable
- **AND** no interaction or persistence behavior changes

### Requirement: Extension and Asset catalogs share one compact content track

Extension Management and Asset Management SHALL use the same centered 1118px full-scene content track. At wide container sizes, each search field SHALL consume the toolbar space remaining after its current mode-specific controls. Each owner SHALL retain its existing modes, filters, operations and records.

#### Scenario: User moves between Extension and Asset Management

- **WHEN** the user navigates between Extension Management and Asset Management at the same wide window size
- **THEN** the mode control, toolbar and catalog align to the same centered content boundaries
- **AND** both search fields adapt to their toolbar's remaining width with the same 36px control height
- **AND** the Extension catalog does not shift left inside a wider outer track

#### Scenario: Extension Management becomes narrow

- **WHEN** the Extension-owned content container crosses its existing narrow breakpoint
- **THEN** the search field occupies the full available toolbar row
- **AND** the existing scope filter and mode-specific controls remain reachable

### Requirement: Management catalogs refresh through scene entry, not a normal toolbar button

Project, Works, Asset, Extension, Character and World management scenes SHALL NOT expose a manual refresh control in their normal catalog toolbar. Entering the current singleton scene SHALL use its existing canonical scene projection, Root mount, Session attach or active-effect load path to obtain current data. A failed load SHALL remain visible and MAY expose a retry action.

#### Scenario: User returns to a management scene

- **WHEN** the user leaves a management scene and later selects it again
- **THEN** the previous Root is not retained and the current owner executes its canonical entry load path
- **AND** no manual refresh button is rendered in the normal catalog controls

#### Scenario: Management entry load fails

- **WHEN** the canonical entry load returns a diagnostic
- **THEN** the owning surface keeps the failure visible and offers its existing retry action where supported
- **AND** the failure is not replaced by an empty catalog success state

### Requirement: Works uses the shared management hierarchy

Works SHALL use the common bounded track, Hero height, title scale, description placement and collection toolbar rhythm. It SHALL omit the extra eyebrow label and SHALL provide a compact search input that distinguishes the empty catalog from a query with no matches.

#### Scenario: User opens Works

- **WHEN** the Works scene is current
- **THEN** its title, description, Hero and collection controls align with Project management at the same width
- **AND** the search input is visible without a manual refresh or fabricated sorting control

#### Scenario: User searches an empty Works catalog

- **WHEN** the user enters a non-empty Works query before durable Works records are connected
- **THEN** the surface shows a localized no-matches state
- **AND** clearing the query restores the canonical empty Works explanation

### Requirement: Populated management groups use natural content height

Project, Character and World catalogs SHALL use the shared section gap between their current-record and template groups. A populated record grid SHALL end at its actual card content height and SHALL NOT reserve empty vertical space according to another domain's card height. An explicit empty, loading or failure state MAY retain a bounded minimum height needed for its diagnostic and actions.

#### Scenario: Populated catalogs use different card heights

- **WHEN** Project, Character and World each contain one record with their scene-specific card dimensions
- **THEN** the template group begins after the same shared section gap measured from the visible end of the record group
- **AND** the shorter Character card does not receive extra blank space to imitate the World card height

#### Scenario: Catalog is empty

- **WHEN** a management catalog contains no records
- **THEN** its owner-defined empty state retains enough bounded height for its explanation and actions
- **AND** the populated-state layout does not inherit that empty-state reservation

### Requirement: Asset catalogs use a centered mode hierarchy

Asset Management SHALL present Media Library and Asset Library as one centered segmented mode control. A fresh Asset Center Session SHALL default to Media Library. The mode control SHALL be the single visible catalog identity; the current catalog SHALL retain an assistive heading without repeating the visible mode title or description. Search SHALL consume the space remaining beside the current catalog controls at wide widths and SHALL occupy a full row when the Assets-owned container becomes narrow. The current catalog operation, sort and view controls SHALL share one toolbar row at wide widths, and the surface SHALL NOT expose a manual refresh button.

#### Scenario: User changes the Asset catalog mode

- **WHEN** the user selects Media Library or Asset Library
- **THEN** the existing package-owned filter update path selects the exact catalog and clears the prior query and directory
- **AND** the primary operation updates to the selected catalog without repeating its visible mode title or description
- **AND** sort and grid/list remain grouped with the current catalog operation

#### Scenario: Open a fresh Asset Center Session

- **WHEN** Asset Center attaches without a retained presentation snapshot
- **THEN** Media Library is the active catalog
- **AND** the Media Library location and connect-directory operation share the toolbar row with sort and view controls
- **AND** no manual refresh control is rendered

#### Scenario: Asset catalog has no records

- **WHEN** the selected catalog is ready, has no query and contains no records
- **THEN** its empty state explains the selected catalog and exposes the existing Connect Directory or Import Assets operation
- **AND** a query with no results shows only a no-results state without suggesting a mutation

### Requirement: Presentation unification preserves canonical behavior

The layout change SHALL NOT add, remove, duplicate or reroute Project, Asset, Character or World business operations, navigation, persistence, IPC or runtime ownership.

#### Scenario: User uses an existing management action

- **WHEN** the user searches, sorts, changes an existing view, imports, creates, retries a failed load or opens an item
- **THEN** the existing package-owned producer and canonical application path is used unchanged
- **AND** layout state remains disposable Renderer presentation state

### Requirement: Asset Center split presentation follows actual container width

When Asset Center displays an authorized Preview, its management catalog SHALL remain the primary-width surface and SHALL calculate header, toolbar, search and list responsiveness from the actual Assets-owned content container rather than a fixed Desktop compact classification.

#### Scenario: Media Library opens a Preview

- **WHEN** selecting an exact file mounts the existing Asset Preview secondary Main
- **THEN** the management and Preview surfaces initially use a 60/40 split while preserving the existing resize control and 50% management minimum
- **AND** the media catalog keeps its bounded content track, groups adjacent toolbar controls and wraps only when its real container is narrow
- **AND** Preview errors remain visible inside a bounded owner-defined state rather than being hidden or expanded into a replacement success path
