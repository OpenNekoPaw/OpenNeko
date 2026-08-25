# desktop-creative-workbench-layout Specification

## Purpose
Define the stable Desktop creative Workbench composition and visible package-owned surface boundaries.
## Requirements
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

### Requirement: Non-canonical Resource Main Views fail locally

Desktop SHALL use one version-free Workbench shape. A persisted `resource-browser` Main View is not a
canonical Main View and MUST be rejected only at that Workbench instance boundary without conversion,
group repair or automatic Dock mutation. The parser and renderer MUST reject any attempt to attach a
Resource Browser as a Main View.

#### Scenario: Existing Resource Browser Main View is restored

- **WHEN** Desktop reads Workbench state containing a `resource-browser` Main View
- **THEN** only that Workbench instance reports an explicit invalid-layout diagnostic
- **AND** stored bytes remain unchanged while sibling Workbench instances and the right Resource Dock remain usable
- **AND** no alternate Main View handler participates

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

### Requirement: Workspace layout controls reflect central panel containment

Desktop Workspace SHALL present exactly three top-level layout controls matching the visible left, central and right structure. The left control SHALL manage Agent with a left-sidebar icon, the central control SHALL use a combined Main-plus-Cut layout icon and expose Main and Cut as explicit child presentation choices, and the right control SHALL manage Workspace Resource management with a right-sidebar icon. Main and Cut SHALL continue to use the canonical Host-owned layout projection and update path rather than a second Renderer state source. The version-free Host layout contract SHALL expose one canonical `empty-main` display mode only for a docked Cut Panel so Agent, Main and Cut can be controlled without hidden Renderer state.

#### Scenario: Workspace renders structural layout controls

- **WHEN** an exact Workspace Scene is active
- **THEN** the native-aligned title chrome renders top-level Agent, combined Main-plus-Cut and Resource management controls in left-to-right order
- **AND** it does not render Main and Cut as separate top-level controls
- **AND** Agent uses the left-sidebar icon while the combined control uses the Main-above-Cut layout icon
- **AND** non-Workspace scenes do not render the Workspace control group

#### Scenario: User opens the combined creative panel control

- **WHEN** the user activates the combined Main-plus-Cut control
- **THEN** Desktop opens one keyboard-accessible Popover containing explicit Main and Cut checkable choices
- **AND** each choice reports selected state only from its exact Scene slot and current Host-owned presentation
- **AND** unavailable Main or Cut disables only its corresponding choice
- **AND** Cut is disabled when it is the last visible business region
- **AND** the Popover does not create a new layout registry, command path or Renderer-owned state source

#### Scenario: User toggles Main or Cut from the combined control

- **WHEN** the user changes Main or Cut in the combined Popover
- **THEN** Main uses the existing Workbench display update and Cut uses the existing Cut Panel presentation update or exact draft-creation path
- **AND** the sibling presentation, exact Main/Cut View refs, Agent session, Resources and user documents remain unchanged
- **AND** no alternate top-level Main or Cut handler participates

#### Scenario: Cut expands when Main is not visible

- **WHEN** Main presentation is hidden while an exact Workspace Cut Panel is docked
- **THEN** Desktop keeps Cut in its existing bottom-panel Portal and expands that same panel across the central Main and bottom tracks
- **AND** Agent, when selected, remains docked at its configured side instead of mounting into the central Main track
- **AND** when Agent is also hidden Host projects the one canonical `empty-main` display mode
- **AND** no empty creative-document presentation is rendered above Cut
- **AND** existing Main View refs remain retained but unmounted until Main is shown again
- **AND** Cut keeps its active View and owning runtime while its stored bottom-panel height is retained for restoration

#### Scenario: Main restoration returns Cut below without replacing its Root

- **WHEN** Cut is expanded because Main is hidden and the user shows Main again
- **THEN** Desktop restores the retained Main View into the central Main track
- **AND** the same Cut Portal and owning runtime return to the bottom track using the retained height
- **AND** no alternate Cut renderer, slot identity or persisted placement state participates

#### Scenario: Invalid empty Main state fails visibly

- **WHEN** a producer requests `empty-main` without an exact docked Cut Panel or attempts to hide the last visible Cut region
- **THEN** the Host codec or canonical layout helper rejects that request visibly
- **AND** it does not persist an unexplained blank Workbench, default to Agent, or mutate Main View, Cut View, Agent or Resource facts

#### Scenario: Closing the final Cut document restores Agent

- **WHEN** the user closes the final Cut document while the canonical display mode is `empty-main`
- **THEN** Host removes that Cut View and atomically changes the canonical display mode to `chat-only`
- **AND** Agent becomes the remaining visible business region without retaining an invalid empty layout
