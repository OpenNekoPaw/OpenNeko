## ADDED Requirements

### Requirement: Asset Center supports desktop multi-selection

The Asset Center SHALL support single selection, platform-modifier toggle selection, Shift range selection, select-all, Escape clear, and rectangular marquee selection across the currently visible actionable file items.

#### Scenario: User toggles and range-selects files

- **WHEN** the user clicks items with Cmd/Ctrl or Shift modifiers
- **THEN** the Asset Center updates the current selection using toggle or current-sort range semantics without activating a directory

#### Scenario: User drags a selection rectangle

- **WHEN** the user drags beyond the selection threshold from empty collection space
- **THEN** every actionable file entry intersecting the visible rectangle becomes selected and the page displays a stable selection rectangle without scrolling or activating an item

#### Scenario: Catalog contents change

- **WHEN** filtering, navigation, refresh, or mutation removes an item from the visible catalog
- **THEN** the Asset Center removes that stale identity from transient selection while preserving valid sibling selections

### Requirement: Selection exposes coherent batch actions

The Asset Center SHALL display a batch toolbar for non-empty selection and SHALL route toolbar, keyboard, and context-menu commands through the same action policy. It MUST NOT silently operate on only a compatible subset of an invalid mixed selection.

#### Scenario: User right-clicks an unselected item

- **WHEN** the user opens the context menu on an actionable item outside the current selection
- **THEN** that item becomes the only selected item and the menu presents commands valid for it

#### Scenario: User right-clicks an existing multi-selection

- **WHEN** the user opens the context menu on an item already in a multi-selection
- **THEN** the menu preserves the complete selection and its commands apply to the complete selection

#### Scenario: Selected items cannot share an operation

- **WHEN** a selection contains unsupported kinds, owners, or Media Library connections
- **THEN** the incompatible batch command is disabled and no subset is mutated

### Requirement: Batch Asset removal preserves source files

The Asset Center SHALL remove one or more selected Asset Library memberships through one canonical batch command and MUST preserve all source files.

#### Scenario: User confirms batch removal

- **WHEN** every selected item is an active Asset Library item and the user confirms removal
- **THEN** all selected memberships become removed atomically, the files remain unchanged, selection clears, and the refreshed catalog omits those records

#### Scenario: Batch removal contains a stale item

- **WHEN** any requested Asset identity is stale, unavailable, duplicated, or belongs to another owner
- **THEN** the complete batch is rejected with a visible diagnostic and no membership is removed

### Requirement: File movement stays inside one authorized owner

The Asset Center SHALL move selected regular files only to an explicitly selected directory within the same authorized Asset root or Media Library connection. It MUST NOT overwrite targets, follow symbolic links, move library/directory entries, cross owners, or expose physical paths to the Renderer.

#### Scenario: Move Asset Library files

- **WHEN** the user selects active Asset Library files, chooses a directory inside the owned Asset root, and no target conflicts exist
- **THEN** the files move as one batch and their existing membership identities point to the new package-relative paths

#### Scenario: Move Media Library files

- **WHEN** the user selects files from one available Media Library connection and chooses a directory inside that same connection
- **THEN** the files move within the external target and the refreshed catalog rebuilds their locator-derived identities at the new relative paths

#### Scenario: Destination is outside the allowed root

- **WHEN** the native picker returns a directory outside the selected items' exact authorized owner root
- **THEN** the operation fails closed before moving any file and the Renderer receives only a safe diagnostic

#### Scenario: Move plan has a conflict

- **WHEN** any target exists, two selected files map to the same target name, or an item changed after projection
- **THEN** the complete batch is rejected before mutation without replacing or partially moving files

#### Scenario: Commit fails after files move

- **WHEN** a filesystem or Asset membership commit fails during execution
- **THEN** completed steps are rolled back in reverse order and the operation is reported as failed rather than successful

### Requirement: Preview remains single-item and independent

Multi-selection SHALL remain transient presentation state while the existing preview lifecycle SHALL continue to accept exactly one current content item.

#### Scenario: Selection contains one previewable item

- **WHEN** the user leaves exactly one previewable file selected
- **THEN** the Asset Center sends the existing exact single-item selection intent and preview remains available

#### Scenario: Selection contains multiple items

- **WHEN** more than one item is selected
- **THEN** the Asset Center does not infer an active item or create a multi-item preview session
