## ADDED Requirements

### Requirement: Direct-create and source-add entries are visually distinct
Canvas Webview SHALL render directly creatable node types as node library tree items and file-bound types as source-add actions.

#### Scenario: Render a directly creatable node
- **WHEN** a node type has creation policy `create`
- **THEN** the node library renders it as a selectable, draggable node type entry
- **AND** selecting it creates the node through the existing node creation path

#### Scenario: Render a file-bound type
- **WHEN** a node type has creation policy `file-bound`
- **THEN** the node library renders an “add” action identifying the expected node type
- **AND** the action is not rendered or exposed as a draggable node type entry

### Requirement: File source selection precedes reference node creation
Canvas Webview MUST request a source through the canonical `project:addSource` path before creating a file-bound node.

#### Scenario: Add a valid source
- **WHEN** the user activates a file-bound source action and selects a supported file
- **THEN** Canvas creates exactly one corresponding typed reference node with the resolved source information
- **AND** the node participates in the existing Canvas layout and rendering path

#### Scenario: Cancel or reject source selection
- **WHEN** the user cancels the picker or source addition returns no successful result
- **THEN** Canvas creates no node
- **AND** no blank file-bound node is persisted

### Requirement: Existing reference nodes remain canonical Canvas nodes
Canvas SHALL continue to read, render, move, connect, and persist existing Media, Document, Script, Model, CanvasEmbed, and Project nodes independently of how their library entry is presented.

#### Scenario: Open a Canvas containing reference nodes
- **WHEN** an existing `.nkc` contains a supported file-bound node with durable source information
- **THEN** Canvas renders the existing node without requiring the source action to be activated again
- **AND** Basic or Professional catalog selection does not change the stored node
