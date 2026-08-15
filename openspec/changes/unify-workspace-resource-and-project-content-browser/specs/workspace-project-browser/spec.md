## ADDED Requirements

### Requirement: Workspace dock separates Resources from Project Content

The Desktop Workspace SHALL expose one Project Browser in the right dock with Resources and Project Content as
two distinct presentation views. It MUST mount only the selected owner Root and MUST NOT copy their records into
a Desktop catalog, shared store or universal Resource contract.

#### Scenario: User opens Project Content while editing

- **WHEN** the user selects Project Content while Canvas, Cut, Preview or another Main View is active
- **THEN** the dock mounts the Project-owned Project Content Root for the exact current Project
- **AND** the active Main View remains mounted and unchanged

#### Scenario: User identifies the active Project Browser mode

- **WHEN** Resources or Project Content is selected
- **THEN** the active mode is distinguished by stronger text and a persistent bottom indicator
- **AND** neither the mode row, hover state, selected state nor embedded content root uses a filled background
  as its base

#### Scenario: Project Content fails to load

- **WHEN** the Project Content projection fails for the exact current Project
- **THEN** only the Project Content view displays its unavailable diagnostic
- **AND** the user can switch to Resources without remounting the Workspace or losing unrelated content

### Requirement: Resources expose three ownership-preserving sources

Resources SHALL expose exactly Project Files, External Media and Assets as source filters. Character, World,
Entity and Candidate records MUST NOT be returned as Asset or Resource Browser items.

#### Scenario: User switches resource source

- **WHEN** the user selects each Resources source
- **THEN** Project Files shows project-owned files, External Media shows project-bound external sources and
  Assets shows installed reusable packages
- **AND** the source tabs use three equal presentation columns

#### Scenario: User changes the Resource Browser view mode

- **WHEN** the user views the resource toolbar or switches between List and Grid
- **THEN** New or Link remains a visually separate action and List/Grid remains one compact two-state control
- **AND** only the active view mode has a raised selected surface without an input-style frame around the toolbar

#### Scenario: Semantic records match a resource query

- **WHEN** a Character, World or Candidate has a label matching the current Resources query
- **THEN** it remains absent from all three Resources sources
- **AND** it remains visible only through its Project Content group or owning global management surface

### Requirement: Project Content preserves semantic groups and owner navigation

The embedded Project Content view SHALL show Characters, Worlds, Elements and Candidates from the exact
Project-owned projection. Character and World open actions SHALL target the exact owner identity; Elements and
Candidates SHALL remain read-only unless their owning domain supplies an explicit operation.

The embedded view SHALL use the same compact list density, typography, icon scale, row hover/focus treatment
and sidebar color tokens as the Resource Browser. Empty groups SHALL remain identifiable without reserving a
card-sized empty panel. This visual convergence MUST NOT merge the two owner Roots or add Resource Browser
operations to Project Content.

#### Scenario: User opens a project Character

- **WHEN** the user activates a Character entry in Project Content
- **THEN** Desktop opens or focuses one Character authoring Main View for that exact CharacterProject
- **AND** no Asset or Entity payload is created or copied

#### Scenario: Candidate has no management contract

- **WHEN** the user views a Candidate without an Entity-owned confirm or ignore operation
- **THEN** the Candidate remains visibly classified as pending and read-only
- **AND** the Project Browser does not synthesize a generic mutation or silently confirm it

#### Scenario: Project Content groups are empty in the dock

- **WHEN** the embedded Project Content projection contains no Characters, Worlds, Elements or Candidates
- **THEN** all four group names and counts remain visible in compact list sections with adjacent subdued empty copy
- **AND** the view does not render large cards, large vertical gaps or Resource Browser acquisition controls

### Requirement: Project Browser state follows Window presentation lifecycle

The selected Project Browser view SHALL be disposable Window presentation state scoped to the current mounted
Workspace. Switching Project Browser views MUST NOT change Project facts, stop background tasks or retain both
owner Roots as hidden trees.

#### Scenario: User switches from Project Content to Resources

- **WHEN** the selected Project Browser tab changes
- **THEN** the outgoing owner Root unmounts and the selected Root mounts for the same exact Workspace identity
- **AND** no Character, World, Project or Resource record is created, removed or rewritten
