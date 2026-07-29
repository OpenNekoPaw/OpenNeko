## ADDED Requirements

### Requirement: Home exposes four real management surfaces

Desktop Home MUST expose Start Creating, Asset Center, Plugins and All Creations through one
collapsible primary sidebar. Each entry MUST select a real Surface backed by an owning projection or
command and MUST NOT render a no-op or unavailable placeholder as a successful page.

#### Scenario: User changes a Home section

- **WHEN** the user selects one of the four Home entries
- **THEN** only Shell-owned Home presentation changes
- **AND** open Project, View, Conversation and domain runtime identities remain attached

### Requirement: Start Creating hands intent to the project Agent

Start Creating MUST select or create a Content Project before invoking Agent UI. The submitted text
MUST be handed once to the package-owned Agent tabless composer after the Project opens. Desktop
MUST NOT auto-send, create a second conversation runtime or bypass provider, approval or cost policy.

#### Scenario: User starts with an existing project

- **WHEN** the user enters an intent and selects a catalog Project
- **THEN** Desktop opens or focuses that Project and prefills the Agent composer exactly once
- **AND** the user can review or edit the text before sending

### Requirement: Asset Center federates authorized project resources

Asset Center MUST group results by Content Project and reuse the Assets-owned directory,
workspace-linked Media Library and Entity projection sources. It MUST NOT create a writable global
Entity catalog, copy project facts or expose absolute paths.

#### Scenario: User searches the Asset Center

- **WHEN** the user searches Directory, Media or Assets
- **THEN** Main resolves each catalog Project through its authorized Workspace and queries the
  canonical source with an explicit limit
- **AND** failures remain project-scoped diagnostics rather than silent empty results

### Requirement: Plugins separates Skills from extension capability

Plugins MUST show Skills discovered by Pi SkillHost and the availability of Desktop-composed built-in
domain extensions. Without a current Plugin Host, external extension installation and execution MUST
remain unavailable and MUST NOT be represented as a successful Marketplace.

#### Scenario: User opens Plugins

- **WHEN** the user views Skills or Extensions
- **THEN** Skill records omit physical paths/locators and extension rows reflect Shell capability
  status
- **AND** no external extension enable/install action is offered without an owning runtime

### Requirement: All Creations reuses catalog and conversation authorities

All Creations MUST render the Project catalog and Agent Home conversation summaries without copying
their facts into a second Home store.

#### Scenario: User opens a creation

- **WHEN** the user selects a Project or Conversation
- **THEN** Desktop uses the existing Project open/focus or Conversation navigation identity
- **AND** duplicate Project or Conversation owner instances are not created

### Requirement: Desktop enters Home by default

Desktop MUST use Home as the default startup destination. A pre-release settings migration MUST map
the legacy restore-by-default state to Home while preserving unrelated Desktop preferences. A restore
destination MAY only take effect after it has been explicitly stored by the current settings version.

#### Scenario: Existing pre-release installation starts after upgrade

- **WHEN** Desktop reads a version 1 application settings record whose startup destination is restore
- **THEN** the version 2 projection uses Home and preserves theme, locale, resource view and revision
- **AND** Shell activates Home without deleting the restored Project tabs

### Requirement: Start Creating uses the compact Agent Home composition

Start Creating MUST present one compact Agent intent composer with its Project scope control and real
shortcut actions. It MUST NOT render an oversized branding hero, accent glow, duplicate Agent panel,
or a shortcut that succeeds without invoking a real command or prefill.

#### Scenario: User opens Home

- **WHEN** Start Creating is the active Home section
- **THEN** Desktop renders the task heading, intent composer, Project selector and real shortcut actions
- **AND** submitting still follows the existing one-shot Project Agent handoff
