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

#### Scenario: Packaged Desktop discovers the Agent Skill catalog

- **GIVEN** Desktop is running from a production package
- **WHEN** the user opens or refreshes the Skill catalog for a Project
- **THEN** Main SHALL discover packaged builtin, personal and Project Skills through the same Pi
  SkillHost path used by Agent turns
- **AND** Project Skills SHALL shadow same-name personal and builtin Skills
- **AND** a missing packaged builtin Skill root SHALL fail visibly rather than return a successful
  partial catalog

#### Scenario: Skill discovery reports safe diagnostics

- **WHEN** Pi SkillHost encounters invalid or duplicate Skill records
- **THEN** Home SHALL show a diagnostic summary grouped by safe code/source
- **AND** the Renderer SHALL NOT receive a Skill physical path, locator, fingerprint or raw diagnostic
  message
- **AND** Home SHALL NOT claim an enabled or trusted setting until a real settings/trust authority
  owns that state

#### Scenario: User views Desktop built-in capabilities

- **WHEN** the user selects the second Plugins page tab
- **THEN** Desktop SHALL label the rows as built-in capabilities rather than installed extensions
- **AND** each availability value SHALL come from the Shell domain capability projection
- **AND** the unavailable external Plugin Host notice SHALL remain visible

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

### Requirement: Agent Home is a recognizable task launchpad

Start Creating MUST use a distinct Desktop task-launch layout rather than the Workspace canvas
surface. It MUST present a creation-oriented heading, one Project-scoped composer, a compact set of
common creation intents and a quick-template shelf. Every intent or template action MUST prefill the
same composer; Home MUST NOT expose fake model, Skill, provider or execution controls.

#### Scenario: User compares Home with a Project workspace

- **WHEN** the user opens Start Creating
- **THEN** the main surface uses the application Home background without the canvas dot grid
- **AND** common intents and quick templates are visible without opening a Project
- **AND** choosing one changes the existing composer input instead of creating another Agent UI

### Requirement: Home and Project share the complete primary-sidebar frame

Home and Content Project MUST render the application primary sidebar through the same component and
the same frame contract. The shared frame MUST be flush with the application edge without a card
border, radius, outer inset or panel gap. Both surfaces MUST consume the same
`window.workbench.primarySidebar` authority for current width and visibility.

#### Scenario: User moves between Home and a Project

- **WHEN** the user opens Home and then enters a Content Project
- **THEN** both primary sidebars use the same application frame marker and Desktop theme tokens
- **AND** resizing or collapsing the Project sidebar is preserved when the user returns to Home
- **AND** active navigation reflects the current Home section or Project identity without changing
  the sidebar frame

#### Scenario: User temporarily reveals a collapsed primary sidebar

- **GIVEN** the primary sidebar is persistently collapsed to the compact rail
- **WHEN** the user hovers the rail or moves keyboard focus into it
- **THEN** the complete sidebar SHALL overlay the adjacent content at the persisted expanded width
- **AND** leaving hover and focus SHALL restore the compact rail without changing persisted state
- **AND** the adjacent Workbench content SHALL NOT move

#### Scenario: User moves quickly across the revealed sidebar

- **GIVEN** hovering the compact rail has triggered the temporary overlay
- **WHEN** the pointer moves laterally from the rail into any point inside the persisted expanded width
- **THEN** the overlay hit region SHALL already cover that complete width
- **AND** the sidebar SHALL NOT collapse because a width animation lags behind the pointer

#### Scenario: User crosses non-control space in the revealed sidebar

- **GIVEN** the compact rail has temporarily revealed the complete sidebar
- **WHEN** the pointer crosses navigation gaps, headings, scrolling whitespace or footer whitespace
- **THEN** those sidebar regions SHALL continue to participate in pointer hit testing
- **AND** only the dedicated top window-drag strip MAY suppress pointer events
- **AND** the temporary overlay SHALL remain revealed until the pointer leaves its complete bounds

#### Scenario: Sidebar visibility control follows the expanded presentation

- **GIVEN** the primary sidebar is persistently collapsed to the compact rail
- **WHEN** neither pointer hover nor keyboard focus temporarily reveals it
- **THEN** the visibility toggle SHALL NOT be shown as a fixed rail action
- **AND** fixed-expanded or temporarily expanded presentation SHALL show the toggle at the top-right
  of the brand row

#### Scenario: Workbench panels keep spacing independently from primary navigation

- **WHEN** Main, Agent, Resources, Timeline, Canvas, Cut, Preview or Model surfaces are composed
- **THEN** content panels MAY retain the Desktop panel gap between one another
- **AND** the first content panel next to the primary sidebar SHALL be flush with that sidebar

#### Scenario: User persistently collapses the sidebar from Home

- **GIVEN** Home is the active Shell target
- **WHEN** the user toggles the application primary sidebar
- **THEN** Main SHALL accept and persist the primary-sidebar-only Workbench mutation
- **AND** no active Content Project SHALL be required
- **AND** any Home mutation of Project-owned Workbench slices SHALL fail visibly

### Requirement: Desktop light appearance uses neutral surfaces

Desktop light appearance MUST use a Codex-like neutral hierarchy for the native window, application
chrome, Main, panels, controls and selection states. Brand green MUST NOT tint large surfaces or
ordinary hover, pressed, selection and focus states.

#### Scenario: User opens Desktop in light appearance

- **WHEN** Desktop resolves the light appearance
- **THEN** Main SHALL use white and application chrome SHALL use a subtle neutral gray
- **AND** raised, muted, border, shadow, control and compatibility tokens SHALL remain hue-neutral
- **AND** the Electron native background SHALL match the Renderer window token during startup
- **AND** brand color MAY remain on the OpenNeko mark or explicit semantic status only
