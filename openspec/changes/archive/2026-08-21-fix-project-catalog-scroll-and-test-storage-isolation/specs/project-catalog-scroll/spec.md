## ADDED Requirements

### Requirement: Project collection owns bounded vertical scrolling

The All Projects surface SHALL keep its heading and management controls visible while the list or grid
collection fills the remaining Workbench height and owns vertical scrolling. Every retained project
row and its available identity-scoped action MUST be reachable without expanding or scrolling the
outer Workbench surface.

#### Scenario: Project count exceeds the available viewport

- **WHEN** the All Projects catalog contains more rows than fit below its controls
- **THEN** the collection becomes vertically scrollable and the user can reach the final row
- **AND** the heading, search, sort, and view controls remain in place

#### Scenario: Project catalog is shown in a compact panel

- **WHEN** the All Projects surface is rendered in the compact Workbench panel size
- **THEN** the collection uses the panel's remaining height without overflowing the panel
- **AND** list rows and their actions remain reachable by scrolling

### Requirement: Scrolling preserves project catalog states

The scroll layout MUST preserve list mode as the default, grid mode as an explicit user selection,
the fill empty state, unavailable-field diagnostics, disabled open actions for unavailable projects,
and explicit removal actions.

#### Scenario: Long catalog includes unavailable projects

- **WHEN** an unavailable project appears beyond the initial collection viewport
- **THEN** scrolling reveals its exact invalid fields and enabled removal action
- **AND** its open action remains disabled

#### Scenario: Search returns no projects

- **WHEN** filtering produces an empty project collection
- **THEN** the canonical fill empty state occupies the remaining collection lane
- **AND** the outer catalog does not gain a second vertical scrollbar
