## ADDED Requirements

### Requirement: Canvas distinguishes Cut document opening from media insertion

Canvas SHALL expose `cut:open` only for an authorized `.otio` material and SHALL label it "Open Cut" or
"打开剪辑". Canvas SHALL expose `cut:add-resource` only for one authorized audio or video material and
SHALL label it "Add to Cut" or "添加到剪辑". Neither action SHALL substitute for the other.

#### Scenario: User selects an OTIO node

- **WHEN** one referenced `.otio` Canvas material is selected
- **THEN** Canvas exposes Open Cut and does not expose Add to Cut
- **AND** execution opens or focuses that exact Cut document

#### Scenario: User selects a video node

- **WHEN** one authorized video Canvas material is selected
- **THEN** Canvas exposes Add to Cut and does not expose Open Cut
- **AND** inline playback remains owned by the video node

### Requirement: Add to Cut uses an exact visible or new-draft target

The system MUST resolve Add to Cut to the currently visible Cut View in the same Workspace, including
its View, View instance, document, and session identities. If no Cut View is visible, the system MUST
project an explicit new-draft target for the exact Workspace Workbench. It MUST NOT select a hidden,
active-global, or recent Cut.

#### Scenario: A Cut is visible beside Canvas

- **WHEN** Canvas resolves actions while one Cut View is docked and active in the Workspace Workbench
- **THEN** Add to Cut carries that exact Cut target
- **AND** execution appends the media through the owning Cut command path

#### Scenario: No Cut is visible

- **WHEN** Canvas resolves actions without a docked Cut View
- **THEN** Add to Cut carries an explicit new-draft target for the exact Workspace Workbench
- **AND** execution creates one Cut draft and adds the media to that new exact session

#### Scenario: Target changes before execution

- **WHEN** the visible Cut or Workbench target differs from the target projected with the action
- **THEN** the action is rejected with a local diagnostic before OTIO mutation
- **AND** no other Cut receives the media

### Requirement: Cut owns media insertion

Add to Cut MUST resolve the source `ContentLocator`, probe supported video or audio streams, import or
link the media, and apply one idempotent Cut command operation through the Cut application runtime.
Canvas and Desktop MUST NOT mutate OTIO or create a second media authority.

#### Scenario: Supported media is added

- **WHEN** an authorized audio or video material is handed to an exact Cut target
- **THEN** Cut appends it to an appropriate unlocked track and publishes the authoritative snapshot
- **AND** the source Canvas material remains unchanged

#### Scenario: Media is unsupported

- **WHEN** probing finds no supported audio or video stream or the target track is unavailable
- **THEN** Cut rejects only that handoff with a visible diagnostic
- **AND** the target document and unrelated Canvas nodes remain unchanged

### Requirement: Canvas media toolbar prioritizes creation workflow

The Canvas selection toolbar SHALL place Add to Cut as the primary action for one audio or video node,
keep Preview as a secondary visible action, and place reveal, Media Library copies, node duplication,
and deletion in overflow. It SHALL use canonical action identities rather than descriptor arrival order
or a fixed first-N limit.

#### Scenario: Video has all supported actions

- **WHEN** a video node resolves Preview, Reveal, Add to Cut, two Media Library destinations, Duplicate
  node, and Delete
- **THEN** Add to Cut and Preview are visible toolbar actions
- **AND** the remaining management commands are reachable from More

#### Scenario: Generated media has generation actions

- **WHEN** a generated media node resolves generation commands
- **THEN** its generation commands remain visible creative actions
- **AND** management commands remain in More

### Requirement: Overflow communicates distinct management scopes

The overflow menu SHALL group project and global Media Library copy commands under one Media Library
section while preserving their separate destinations. Node duplication SHALL be labeled "Duplicate
node" or "创建节点副本" and SHALL remain distinct from file copies.

#### Scenario: User opens More for a video node

- **WHEN** both Media Library destinations and node duplication are available
- **THEN** the two copy commands appear in one Media Library group
- **AND** Duplicate node appears as a separate node-management command
