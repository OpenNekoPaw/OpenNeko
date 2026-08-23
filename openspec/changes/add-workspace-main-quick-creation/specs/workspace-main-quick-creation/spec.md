## ADDED Requirements

### Requirement: Main exposes one reusable quick-creation interaction

Every visible Workspace Main group SHALL expose a compact quick-create trigger immediately after its
tab list. An empty Main group SHALL additionally expose a labelled creation action in its placeholder.
Both triggers MUST invoke the same component, supported-kind catalog and command path.

#### Scenario: User opens quick creation from a populated Main

- **WHEN** the user activates the `+` beside the Main tabs
- **THEN** a localized menu offers File, Folder, Canvas and Cut
- **AND** existing tabs remain visible and unchanged while the invocation is open

#### Scenario: User opens quick creation from an empty Main

- **WHEN** the Main group has no View and the user activates its labelled creation action
- **THEN** the same quick-create menu and naming interaction opens
- **AND** no empty document or hidden View is created before explicit submit

### Requirement: Quick creation uses the canonical owner path

Main SHALL submit creation through the existing Resources intent and Content creation coordinator.
Canvas and Cut SHALL remain the only producers of valid NKC and OTIO bytes. Renderer MUST NOT access
Node/Electron, raw paths, direct writers, synthetic document JSON or a parallel creation handler.

#### Scenario: User creates a Canvas

- **WHEN** the user enters a valid name and submits Canvas creation
- **THEN** Main activates the originating group, establishes the unfiltered Files projection and
  submits the existing `creative-document.create` intent
- **AND** Canvas owner bytes are written once and the existing open/focus path opens the new View

#### Scenario: User creates an ordinary file or folder

- **WHEN** the user submits File or Folder creation
- **THEN** the existing workspace-entry command creates exactly one root-level entry
- **AND** no Main View, inferred editor or alternate filesystem path is invented

#### Scenario: User creates a Cut

- **WHEN** the user submits Cut creation
- **THEN** Cut owner bytes are written once and the existing Cut panel open path is used
- **AND** Main does not place the OTIO document in its Canvas/Editor tab group

### Requirement: Quick creation targets an explicit Workspace root

The quick-create form SHALL visibly identify Workspace root as its destination and SHALL submit the
canonical root target. It MUST NOT infer a selected, active or recent file/directory. Subdirectory
creation SHALL remain available through Resources.

#### Scenario: Resources contains a retained directory selection

- **WHEN** Main quick creation is submitted while Resources has another directory selected or hidden
- **THEN** the new entry targets the visibly declared Workspace root
- **AND** the retained Resources selection does not redirect creation

### Requirement: Split Main creation preserves exact group intent

Quick creation SHALL validate and activate the originating Main group before dispatching creation.
It MUST NOT rely on a later active/recent group fallback.

#### Scenario: User creates from the secondary Main group

- **WHEN** a split Workbench has the primary group active and the user submits Canvas creation from
  the secondary group
- **THEN** Desktop awaits activation of the exact secondary group before creation
- **AND** the created Canvas opens in the secondary group without moving or replacing sibling Views

### Requirement: Naming and failure remain visible and local

Canvas and Cut naming SHALL display fixed `.nkc` and `.otio` suffixes. Escape or Cancel SHALL discard
only the invocation. Invalid, conflicting, stale and capacity failures SHALL remain visible without
creating a substitute, changing target directory or closing sibling Views.

#### Scenario: User cancels naming

- **WHEN** the user cancels or presses Escape before submit
- **THEN** the invocation resets and closes
- **AND** no entry, View or Cut draft is created

#### Scenario: Requested name conflicts

- **WHEN** the target entry already exists
- **THEN** the request fails visibly and the naming form remains available for correction
- **AND** the existing entry is not overwritten and no numbered name is synthesized

#### Scenario: Creative document is created but cannot open

- **WHEN** owner bytes are committed but the editor open/focus operation fails
- **THEN** the new file is preserved and a visible retained-document diagnostic is shown
- **AND** Main does not retry creation, delete the file or report the editor as opened
