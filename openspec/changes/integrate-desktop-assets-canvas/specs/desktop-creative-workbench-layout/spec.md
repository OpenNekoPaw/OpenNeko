## ADDED Requirements

### Requirement: Desktop exposes one primary navigation sidebar

Desktop SHALL render Home, creation, Project navigation, recent work, resource, Character, Skill,
Activity and settings entry points through one primary sidebar that can collapse to an icon rail.
Window-owned ProjectTab and
View identities SHALL remain authoritative for attachment and recovery but MUST NOT require a second
visual top-level Project Tab row.

Content Project SHALL NOT render a global Header or unified workspace Tab row. Canvas/Preview document
switchers and Cut/Timeline tabs SHALL remain inside their owning creative surfaces; Shell controls
SHALL live in the primary sidebar or the relevant panel header.

#### Scenario: User switches projects from the primary sidebar

- **WHEN** the user selects an already-open or catalogued Project
- **THEN** Desktop activates or reopens the exact Project/View identity through the Host-owned catalog
- **AND** it does not create a duplicate project, infer an active workspace or render another project Tab row

#### Scenario: Creative surfaces render their own tabs

- **WHEN** Agent, Canvas, Preview or Cut/Timeline exposes multiple local views
- **THEN** its owning package renders the corresponding tab or compact switcher inside that surface
- **AND** Desktop does not aggregate those views into a global workbench Tab row

### Requirement: Creative workbench uses controlled owner-neutral slots

Desktop SHALL provide Main Creative Surface, Agent Dock, fixed-right Project Resource Dock and Cut
Timeline Panel slots.
Agent placement SHALL be selected only through declared Chat + Main left/right presets; Desktop SHALL
not expose separate move-left/right toolbar buttons for Agent. Main SHALL support at most one explicit
side split; Timeline SHALL support bottom visibility and height. Resource Dock state MUST contain
only presentation and width; resource query, directory, selection and projection remain Assets-owned.

Desktop MUST mount the package-owned Project Resource Browser only in the fixed-right Resource Dock.
It MUST NOT register `resource-browser` as a Main View kind, render it as a Main Tab, add Project
resources to primary navigation or move the Resource Dock to the left. When Agent and Resource would
occupy the right side, Agent SHALL move to the left while Resource remains right.

The display menu SHALL compose Chat + Main, only Chat or only Main. Main SHALL reuse owner Views for
Canvas, Cut Stage + Timeline, Model Preview, Canvas + Timeline or Canvas + Model.
Agent SHALL not be embedded in Main Creative Surface. Files, Media and Entity SHALL remain independently
selectable facets inside the Assets-owned Resource Browser Root.

#### Scenario: User switches to Canvas and Agent layout

- **WHEN** a Canvas View and Agent Conversation View are available and the user selects the
  Canvas-and-Agent preset
- **THEN** Desktop places the exact views in Main and Agent Dock according to the preset
- **AND** Canvas and Conversation facts remain owned by their domain runtimes

#### Scenario: User chooses Chat placement

- **WHEN** the user selects Chat on left or Chat on right from the display preset
- **THEN** Window layout persists the Agent dock position using revision/CAS
- **AND** no separate move-left/right button is rendered
- **AND** Resource projection, selection and workspace facts are not copied into layout state

#### Scenario: User reveals Project resources

- **WHEN** the user activates the project-local right-panel control
- **THEN** Desktop reveals one package-owned Resource Browser in the right Dock
- **AND** Canvas and other Main Views remain unchanged and visible
- **AND** no Main Tab, primary-navigation item or second Assets Root is mounted

#### Scenario: Agent and Project resources are both visible

- **WHEN** a layout requests Chat on the right while the Project Resource Dock is visible
- **THEN** Desktop keeps Project resources in the right Dock and places Agent on the left
- **AND** the owners do not share width, resize handling, scrolling or a stacked sidebar

#### Scenario: Canvas and Model tools are repositioned

- **WHEN** Canvas or the package-owned Model Viewer renders viewport tools
- **THEN** the owning package places the same command controls in a bottom horizontal toolbar
- **AND** no Desktop-only toolbar or no-op command path is introduced

### Requirement: Home and Project share one primary navigation

Desktop SHALL render Home and Content Project primary navigation from one visual and information
architecture contract. Both contexts SHALL expose the same brand/collapse treatment and the
Start creating, Activity and Asset center destinations. Expanded navigation SHALL project recent
Projects and recent Agent conversations from the authoritative Shell projection.

Content Project SHALL NOT render a separate Creative surfaces/capability section. Agent, Canvas,
Preview, Cut/Timeline and Model view composition SHALL remain in the display menu or the owning
surface. Asset center SHALL remain a global destination and SHALL open the global Media Library /
Asset Library in both Home and Content Project contexts. Content Project SHALL NOT inject Project
resources into primary navigation; its Resource Browser belongs to the project-local right Dock.
The global destination and Project Dock MUST NOT share commands, active state, identity, lifecycle or
data projection. The primary navigation footer
SHALL NOT duplicate collapse or Asset center controls, and SHALL only expose real Desktop-owned
status, display, timeline and settings actions.

#### Scenario: User moves between Home and Project

- **WHEN** the user opens Home and a Content Project in the same Desktop window
- **THEN** both contexts render the same primary navigation hierarchy, spacing and collapse behavior
- **AND** Project navigation keeps current/open Project identity without introducing a global Tab row
- **AND** no Creative surfaces section or simulated Plugin/Skill route is rendered

#### Scenario: User opens global Asset center from Project navigation

- **WHEN** a Content Project is active and the user selects Asset center
- **THEN** Desktop navigates to the global Media Library / Asset Library
- **AND** it does not open, focus or activate the Project Resource Browser

#### Scenario: Project resources remain outside primary navigation

- **WHEN** a Content Project is active
- **THEN** primary navigation does not render a Project resources destination
- **AND** the project-local right-panel control reveals the exact Project/Workspace Resource Browser
- **AND** Asset center remains the only resource-related primary destination

### Requirement: Workbench v2 Resource Main Views migrate to the right Dock

Desktop SHALL migrate persisted v2 Workbench state to v3 before rendering. A v2
`resource-browser` Main View SHALL be removed from Main groups and converted to visible right
Resource Dock presentation. The v3 parser and renderer MUST reject or poison any later attempt to
attach a Resource Browser as a Main View.

#### Scenario: Existing Resource Browser Main View is restored

- **WHEN** Desktop reads v2 Workbench state containing a `resource-browser` Main View
- **THEN** migration removes that View identity and repairs affected Main groups
- **AND** the right Resource Dock becomes visible with its existing bounded width
- **AND** no legacy Main View handler participates after migration

### Requirement: Narrow layouts preserve a usable main surface

Desktop SHALL define minimum widths for Main and docks. When the Window cannot display requested
slots without violating the Main minimum, Desktop SHALL keep one dock visible and render another
requested dock as an explicit temporary overlay or hidden surface.

#### Scenario: Window becomes narrow with two docks open

- **WHEN** the available width falls below the declared Main plus dock minimums
- **THEN** Desktop applies the deterministic compact presentation
- **AND** it does not infinitely shrink Main, lose the active View identity or duplicate dock state

### Requirement: Canvas views use bounded multi-document presentation

Desktop SHALL allow multiple different Canvas documents to remain open through a compact View
switcher. Opening the same document in the same Window SHALL focus the existing View. By default one
Canvas SHALL render; an explicit side-open action MAY render at most two different Canvas documents.

#### Scenario: User reopens the active Canvas document

- **WHEN** a Canvas document URI already has a View in the Window
- **THEN** Desktop focuses that View
- **AND** it does not create another Canvas session, mutable store or document owner

#### Scenario: User opens a second Canvas to the side

- **WHEN** one Canvas is active and the user explicitly opens a different Canvas to the side
- **THEN** Desktop renders the two independent document Views in the bounded split
- **AND** each retains its own document session, revision and View presentation state

### Requirement: Future surfaces remain explicit until their owner is ready

The workbench SHALL preserve slots and typed diagnostics for Cut, Preview, Generation/Quality,
Character Studio and World without rendering simulated inputs, timelines, canvases, search results or
successful controls.

#### Scenario: User requests Cut during P1.4

- **WHEN** Cut is still classified as unavailable
- **THEN** Desktop displays the owning P1.5 diagnostic
- **AND** it does not mount a fixed timeline, infer a Cut target or report success
