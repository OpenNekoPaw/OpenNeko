## ADDED Requirements

### Requirement: Canvas Markdown editing is immersive and Canvas-owned

Canvas SHALL present explicit Markdown node editing in one modal Surface that fills the current Canvas workspace. The Surface SHALL use the canonical controlled Rich Markdown engine and SHALL update the exact Markdown node through the existing Canvas document update path. It SHALL NOT create a Text Editor document session, Main Preview session, independent draft authority, or second editor mount.

#### Scenario: User edits a selected Markdown node

- **WHEN** the user invokes the Canvas Markdown edit action or double-activates the node
- **THEN** the current Canvas workspace is covered by a readable Rich editor for that exact node
- **AND** the compact node remains a read-only projection behind the modal Surface
- **AND** Rich changes update the same node content used by the Canvas document

#### Scenario: User finishes immersive editing

- **WHEN** the user presses Escape or invokes the visible completion action
- **THEN** the editor Surface unmounts
- **AND** the previous Canvas focus, selection and viewport are restored unchanged
- **AND** the edited Markdown remains visible in the compact node projection

### Requirement: Immersive editing owns input without stealing editor commands

While the Markdown editor Surface is open, Canvas viewport wheel, pan, marquee, connection, node transform, selection toolbar and Canvas shortcut handling SHALL be suspended. The modal boundary SHALL own Escape only; text input, direction keys, IME, undo/redo and Rich editor commands SHALL remain available to the editor.

#### Scenario: User scrolls a long Markdown document

- **WHEN** the pointer is over the immersive editor and the user scrolls
- **THEN** the document editor scroll position changes
- **AND** the Canvas viewport pan and zoom remain unchanged

#### Scenario: Target node becomes unavailable

- **WHEN** the exact Markdown node no longer exists or no longer has Markdown type while its Surface is mounted
- **THEN** the Surface shows a local, explicit unavailable diagnostic and a close action
- **AND** it does not edit another selected, active or recent node
- **AND** unrelated nodes and the Canvas scene remain available after close

### Requirement: Compact Markdown nodes do not mount a second editor

Markdown nodes SHALL render a compact read-only projection when selected or idle. Selection alone and node rendering SHALL NOT mount Milkdown. The former node-local Rich editing path SHALL be removed rather than retained as a fallback or alternate mode.

#### Scenario: User selects a Markdown node

- **WHEN** the node becomes selected without an explicit edit action
- **THEN** its compact Markdown projection remains visible and scrollable
- **AND** no mutable Rich editor is mounted inside the node
