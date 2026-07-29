## ADDED Requirements

### Requirement: Resource Dock remains an independent project surface

Desktop SHALL expose Resource Dock through the primary sidebar while keeping its content independent
from Main and Chat. Resource Dock SHALL be hideable and resizable, SHALL retain project-scoped
selection and browsing state, and MUST NOT expose separate move-left/right buttons.

#### Scenario: User toggles project resources

- **WHEN** the user activates the Resource entry in the primary sidebar
- **THEN** Desktop reveals or hides the exact Project Resource Dock without replacing Main or Agent
- **AND** no resource catalog, selection, or query becomes owned by Chat or the active creative View

#### Scenario: Window becomes narrow

- **WHEN** Resource Dock and Chat cannot remain docked without violating Main minimum width
- **THEN** Shell applies its deterministic overlay/compact presentation
- **AND** Resource identity, query, selection, and active facet remain attached to the same Project

### Requirement: Directory projects the real workspace hierarchy

Directory SHALL project authorized workspace roots, directories, and files with stable hierarchical
identity. It SHALL support tree and current-container grid views and MUST NOT require a Media Library
membership or recursively flatten the full workspace into the initial snapshot.

#### Scenario: Resource Dock opens without restored browsing state

- **WHEN** Desktop creates a Resource Browser controller for a Project without a restored facet
- **THEN** Directory opens as the initial facet in list/tree presentation
- **AND** All remains an explicit sectioned overview/search facet rather than impersonating a
  navigable directory tree

#### Scenario: Browse workspace tree

- **WHEN** the user expands a Directory node
- **THEN** Host returns only the authorized direct children with stable parent identity and portable
  workspace locators
- **AND** Renderer receives no workspace root, absolute path, symlink target, or Host handle
- **AND** list/tree presentation keeps the expanded parent visible and inserts its direct children
  beneath that parent with deterministic hierarchy and accessible tree semantics
- **AND** expanding one branch does not replace the visible root or navigate the current container

#### Scenario: Present a compact readable workspace tree

- **WHEN** Directory renders workspace resources in list/tree presentation
- **THEN** each resource uses a compact single-line row with an aligned disclosure slot, folder or
  file-type icon, and a small thumbnail when one is available
- **AND** the filename remains the primary accessible label and visually truncates without losing its
  full hover title
- **AND** root `"."`, duplicated kind labels, and other empty second-line placeholders are not
  rendered as item information
- **AND** selection uses a subtle whole-row treatment without changing resource identity, activation,
  traversal, or ContentLocator behavior

#### Scenario: Switch Directory to grid

- **WHEN** the user selects grid view for a Directory container
- **THEN** the same direct children render as folders and thumbnail-capable files
- **AND** view mode changes no file facts or ContentLocator identity
- **AND** activating a folder navigates the grid current container and updates breadcrumbs rather
  than expanding an inline tree branch

#### Scenario: Search Directory

- **WHEN** the user searches Directory by name or relative path
- **THEN** Host returns bounded flat results with enough parent identity to reveal each result in tree
- **AND** excluded dependency, cache, secret, and build paths remain outside the projection

### Requirement: Media facet contains only configured linked libraries

The Desktop Media facet SHALL enumerate only filesystem-derived roots below
`neko/assets/<libraryName>` and their supported descendants. It MUST NOT mix arbitrary workspace media
files into Media Library results.

#### Scenario: Browse configured libraries

- **WHEN** a workspace contains available and unavailable managed library links
- **THEN** Media projects a root row for each safe library name with availability and management
  capabilities
- **AND** only descendants of available roots can be expanded or searched as Media entries

#### Scenario: Workspace contains an unlinked video

- **WHEN** an ordinary workspace directory contains a video outside every managed library root
- **THEN** Directory can display and preview that video
- **AND** Media Library does not return it as a library member

### Requirement: Directory and Media use package-owned source services

Assets SHALL own the host-neutral Directory/Media projection, traversal, linked-root enumeration,
dedupe and search policy. Desktop SHALL only inject authorized Host ports and MUST NOT implement a
second recursive resource source or renderer-side index.

#### Scenario: Desktop requests resource children

- **WHEN** Resource Browser requests Directory or Media children
- **THEN** the Assets source validates the explicit Project/Workspace/parent identity and returns the
  owner projection
- **AND** Desktop-local path inference, active workspace fallback, VS Code TreeProvider and renderer
  filesystem access do not participate

### Requirement: Resource views support scoped and sectioned search

Resource Browser SHALL search Directory, Media Library and Entity independently and SHALL offer an
All scope whose results remain separated by owner. Search SHALL be bounded, cancellable or stale-safe,
and keyed by stable resource identity.

#### Scenario: Search current facet

- **WHEN** the user searches while Media is active
- **THEN** only Media Library owner results are returned using canonical locator and metadata
- **AND** Directory and Entity results do not silently enter that list

#### Scenario: Search all resources

- **WHEN** the user selects All and submits a query
- **THEN** Directory, Media and Entity results are returned in explicit sections with per-section
  continuation or limit
- **AND** equivalent locators retain one stable identity rather than creating duplicate resource facts

### Requirement: Automatic discovery does not promote facts

The system SHALL allow workspace and linked-library file changes to refresh rebuildable projections
and semantic analysis to produce Entity candidates. Automatic discovery MUST NOT confirm an Entity,
create a representation binding, publish a global resource, or create retired Asset membership.

#### Scenario: User copies a story into the workspace

- **WHEN** reconciliation discovers an eligible story document
- **THEN** Directory and semantic candidate projections can refresh
- **AND** confirmed Entity, binding and global resource facts remain unchanged until an explicit owner
  operation succeeds

#### Scenario: Global resource is requested

- **WHEN** a user wants to reuse a project result across projects
- **THEN** Desktop requires an explicit add, link or publish operation owned by the future Home resource
  contract
- **AND** it does not scan user Home or silently copy project facts
