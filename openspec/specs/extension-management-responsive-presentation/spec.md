# extension-management-responsive-presentation Specification

## Purpose
Define responsive Skill, MCP and Professional Application catalog and detail presentation without changing runtime ownership.
## Requirements
### Requirement: Extension modes are visually primary and unique

The Extension Management scene SHALL present Skill, MCP and Professional Applications through one prominent icon-and-label mode selector separate from catalog search.

#### Scenario: User compares extension modes

- **WHEN** the user moves between Skill, MCP and Professional Applications
- **THEN** the active mode is unmistakable through label, icon, selected surface and focus state
- **AND** only the active package-owned Root is mounted

### Requirement: Extension catalogs avoid redundant information

The Desktop extension composition SHALL render the shared page hierarchy once, and Agent catalog cards SHALL show only name, purpose summary and actionable diagnostics.

#### Scenario: Skill or ready MCP entry is rendered

- **WHEN** a catalog item has no actionable diagnostic
- **THEN** its card shows name and purpose without repeated provider, invocation permission, canonical invocation or ready metadata

#### Scenario: MCP entry has a diagnostic

- **WHEN** an MCP entry is unsupported or failed
- **THEN** its existing status diagnostic remains visibly local to that card

#### Scenario: Catalog card is presented

- **WHEN** a Skill or MCP entry is rendered in the catalog
- **THEN** its type icon and name form the primary heading
- **AND** its purpose summary is limited to a stable two-line region without a false action affordance

#### Scenario: Professional Application is rendered

- **WHEN** an application exposes readiness, configuration or operations
- **THEN** its catalog card shows only identity, purpose, readiness tag and a detail entry action
- **AND** configuration and operation controls are absent from the catalog card

### Requirement: Extension details use one package-owned overlay path

Selecting a Skill, MCP or Professional Application SHALL open a package-owned modal detail Overlay without creating a Desktop Scene, Workbench split or retained hidden Root. The selected catalog card SHALL remain visibly selected while the Overlay is open.

#### Scenario: User opens and closes extension details

- **WHEN** the user activates an extension card or its detail action
- **THEN** the corresponding detail Overlay opens above the unchanged catalog
- **AND** the background card exposes a high-contrast `aria-pressed` selected state
- **AND** closing by close action or Escape clears the selection and returns to the unchanged query and mode

#### Scenario: User reviews Skill or MCP details

- **WHEN** a Skill or MCP detail Overlay is open
- **THEN** canonical identity, provider/source or readiness/invocation facts and any local diagnostic are available only in the detail hierarchy

#### Scenario: User configures a Professional Application

- **WHEN** a Professional Application detail Overlay is open
- **THEN** readiness, endpoint, workflow, launch preference, application selection, save, download and launch controls remain package-owned and available there
- **AND** there is no second editable configuration path in its catalog card

### Requirement: Extension catalogs use a bounded responsive content track

The scene SHALL use a bounded content track with compact fixed-mode cards and progressively reduce columns without horizontal clipping. Wide views SHALL add bounded-width cards instead of stretching sparse cards to fill each row. It SHALL NOT expose grid/list switching or manual refresh controls.

#### Scenario: Extension scene width changes

- **WHEN** available width cannot support the wide grid
- **THEN** the catalog reduces columns while mode and search remain reachable

#### Scenario: Wide catalog has sparse or dense content

- **WHEN** the catalog is wider than one card row requires
- **THEN** each card remains within the compact width bound and the row aligns to its start edge
- **AND** the icon, title, summary and detail affordance form one coherent information block without oversized vertical gaps

### Requirement: Loaded extension catalogs do not infer install state

The Skill catalog SHALL present the complete loaded DSH projection without an “all / added” filter. Skill source facts SHALL NOT be interpreted as installation state. MCP and Professional Application catalogs SHALL likewise avoid an “added” filter unless a future package-owned installed-library contract provides both a candidate collection and authoritative installation state.

#### Scenario: User reviews loaded Skills

- **WHEN** bundled, personal or current-project Skills are present in the loaded projection
- **THEN** all matching Skill cards remain searchable in one catalog
- **AND** the catalog does not display an install-state filter or count

#### Scenario: MCP has no configured entries

- **WHEN** the MCP projection is empty and no search query is active
- **THEN** the catalog states that MCP has not been configured
- **AND** it does not describe the empty projection as zero added entries

#### Scenario: Professional Application readiness is shown

- **WHEN** a Professional Application is unconfigured, not installed, ready or otherwise unavailable
- **THEN** the package-owned readiness remains the visible status
- **AND** the catalog does not replace or duplicate readiness with an added-state filter

### Requirement: Extension catalog interactions remain presentation-only

Mode selection and search SHALL operate on the existing projections without mutating extension identity, runtime state or user data.

#### Scenario: User changes catalog presentation

- **WHEN** the user changes mode or search
- **THEN** the visible collection updates through the existing Renderer presentation path
- **AND** no install, discovery, runtime or persistence mutation is sent

### Requirement: Extension presentation remains readable across supported themes

Mode controls, catalog cards, diagnostics and focus indicators SHALL use current theme tokens and remain readable in supported light and dark themes.

#### Scenario: Application theme changes

- **WHEN** the Extension Management scene renders in a supported light or dark theme
- **THEN** the active mode, controls, cards and any diagnostic remain visually distinguishable
