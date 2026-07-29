## ADDED Requirements

### Requirement: Desktop provides an application settings surface

Desktop MUST provide one standalone settings surface that can be opened from Home or a project workspace without an active Agent connection. The surface MUST NOT be represented as a project or workbench tab and MUST return to the application surface from which it was opened.

#### Scenario: Open settings from Home
- **WHEN** a user activates Settings while the Desktop window shows Home
- **THEN** Desktop presents the application settings surface without opening a project or Agent connection
- **AND** returning from Settings restores the previous Home section

#### Scenario: Open settings from a project
- **WHEN** a user activates Settings while a project workspace is visible
- **THEN** Desktop presents the same application settings surface without adding a project or workbench tab
- **AND** returning from Settings restores that project workspace

### Requirement: Desktop application preferences have an independent authority

Desktop MUST persist user-level application preferences in a versioned Host-owned settings repository that is independent from Agent `config.toml`, project facts, and Desktop Shell window state. The repository MUST validate its full schema and MUST write atomically.

#### Scenario: First launch has no settings file
- **WHEN** the Host reads settings and no Desktop settings file exists
- **THEN** it returns versioned defaults for theme, locale, startup target, and resource browser view
- **AND** it does not read Agent or project configuration as fallback

#### Scenario: Settings are persisted
- **WHEN** a valid settings update advances the current storage revision
- **THEN** the Host atomically persists the complete validated Desktop settings document
- **AND** a later Desktop launch reads the same preferences

#### Scenario: Settings document is invalid
- **WHEN** the settings file has an unknown schema version or an invalid preference value
- **THEN** the Host reports a fail-visible settings diagnostic
- **AND** it does not silently replace the document with defaults

### Requirement: Settings updates use a sender-bound versioned bridge

Desktop MUST expose get, update, projection event, and Agent advanced configuration operations through a versioned preload/IPC bridge. Update requests MUST include the expected settings revision, and the Host MUST reject stale revisions.

#### Scenario: Renderer updates a preference
- **WHEN** a registered Desktop renderer submits a valid update with the current revision
- **THEN** AppHost persists it through the settings service and returns the next complete projection
- **AND** all subscribed windows in the application instance receive the same next revision

#### Scenario: Renderer submits a stale update
- **WHEN** a renderer submits an expected revision older than the repository revision
- **THEN** Desktop rejects the update with a stale settings revision diagnostic
- **AND** the stored settings remain unchanged

#### Scenario: Unknown sender requests settings
- **WHEN** an unregistered renderer sender invokes a settings operation
- **THEN** AppHost rejects the request before reading or mutating settings

### Requirement: Desktop applies appearance and language preferences

Desktop MUST support `system`, `light`, and `dark` theme preferences and `system`, `en`, and `zh-cn` locale preferences. `system` MUST resolve from the operating system or renderer environment, while explicit values MUST remain stable when system preferences change.

#### Scenario: Theme follows the system
- **WHEN** theme is `system` and the operating-system appearance changes
- **THEN** the existing Desktop window updates shared, Desktop, and compatibility theme tokens through the canonical theme projection

#### Scenario: Theme has an explicit override
- **WHEN** theme is `light` or `dark`
- **THEN** Desktop applies that appearance to Electron window chrome and renderer tokens
- **AND** a later system appearance change does not replace the explicit value

#### Scenario: Language changes
- **WHEN** locale changes to `en` or `zh-cn`
- **THEN** the settings surface and existing Desktop shell re-render in that language without restarting
- **AND** package Roots receive the resolved supported locale through their existing host adapters

### Requirement: Desktop supports startup and creative display defaults

Desktop MUST support a `home | restore` startup target and a `list | grid` resource browser default view. Startup selection MUST preserve stored projects, tabs, and workbench state, and the resource default MUST NOT overwrite an existing per-project display choice.

#### Scenario: Start at Home while prior projects exist
- **WHEN** startup target is `home` and Desktop claims a previously stored Window
- **THEN** the Window activates Home
- **AND** its stored project catalog, tabs, and workbench state remain available

#### Scenario: Restore previous target
- **WHEN** startup target is `restore`
- **THEN** Desktop restores the stored active Home or project target

#### Scenario: Resource browser has no saved display state
- **WHEN** a project Resource Browser mounts without a prior display state
- **THEN** it initializes from the Desktop `list | grid` default

#### Scenario: Resource browser has a project display state
- **WHEN** a project Resource Browser already has a saved display state
- **THEN** it restores that state instead of the Desktop default

### Requirement: Agent and project configuration ownership remains isolated

Desktop settings MUST NOT store Agent provider, model, MCP, credential, prompt, or workspace configuration, and MUST NOT store project facts. The settings surface MAY expose a clearly labeled Agent-owned advanced configuration action that opens the canonical Agent configuration through the Host.

#### Scenario: Open Agent advanced configuration
- **WHEN** a user selects the Agent advanced configuration action from Desktop Settings
- **THEN** the Host opens the Agent-owned user configuration
- **AND** no Desktop application preference is changed

#### Scenario: Desktop preferences are saved
- **WHEN** Desktop persists application preferences
- **THEN** the serialized settings contain only the Desktop settings schema
- **AND** secrets and Agent configuration fields are absent
