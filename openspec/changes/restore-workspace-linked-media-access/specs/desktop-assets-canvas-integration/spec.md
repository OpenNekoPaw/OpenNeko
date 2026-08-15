## MODIFIED Requirements

### Requirement: Desktop delegates both Media Library user intents

Assets SHALL expose separate project operations for associating an existing global Media Library and for
registering a selected directory globally before association. Desktop SHALL only validate the sender,
show the native/configured selector and delegate to Assets.

#### Scenario: Associate an existing global library

- **WHEN** the user chooses “关联全局媒体库” in the exact project Resource Browser
- **THEN** Desktop returns the selected registered identity to Assets
- **AND** Assets owns binding creation, link materialization, validation and projection refresh

#### Scenario: Add a directory

- **WHEN** the user chooses “将目录添加到全局媒体库” and selects a directory
- **THEN** Desktop returns only the sender-authorized selection to Assets
- **AND** Assets registers it globally before creating the project association

### Requirement: Agent receives only the Workspace access projection

Project-to-Agent attachment, mention and context producers SHALL translate an authorized Media Library
locator into its managed-link Workspace locator. Agent SHALL remain unaware of the Media Library domain,
project binding, global connection and physical target.

#### Scenario: Send linked media to Agent

- **WHEN** a user attaches or mentions authorized project Media Library content
- **THEN** Agent receives `workspace-file:neko/assets/<libraryName>/<relativePath>` bound to the exact sender
  Workspace
- **AND** ReadDocument/ReadImage uses the shared managed-link guard

#### Scenario: Forged Agent locator

- **WHEN** a stale, unmanaged, nested-escaping or wrong-Workspace locator is sent
- **THEN** only that Agent operation fails with a typed diagnostic
- **AND** the runtime does not switch to a Media Library handler, global connection or active Workspace

### Requirement: Other project consumers retain Media Library identity

Canvas, Cut, Preview, Entity and package/export paths SHALL consume the canonical Media Library locator and
shared project content service. Desktop MUST NOT rewrite their durable facts to Agent-oriented Workspace
paths.

#### Scenario: Canvas previews linked media

- **WHEN** Canvas resolves a Media Library reference
- **THEN** the canonical project content service validates binding, global connection and managed link
- **AND** Canvas receives only the authorized bytes/descriptor required for presentation
