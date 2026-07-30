## MODIFIED Requirements

### Requirement: Home exposes four real management surfaces

Desktop Home MUST expose Start Creating, Asset Center, Plugins and All Projects through one
collapsible primary sidebar. Each entry MUST select a real Surface backed by an owning projection or
command and MUST NOT render a no-op or unavailable placeholder as a successful page.

#### Scenario: User changes a Home section

- **WHEN** the user selects one of the four Home entries
- **THEN** only Shell-owned Home presentation changes
- **AND** open Project, View, Conversation and domain runtime identities remain attached

### Requirement: Asset Center federates authorized project resources

Asset Center MUST query the Assets-owned user-global media and asset root without selecting, opening
or scanning a Content Project. It MUST support deterministic search and sorting, and MUST NOT project
Project files, Project Media Libraries, Project Entities or absolute filesystem paths.

#### Scenario: User searches and sorts the Asset Center

- **WHEN** the user searches the global Libraries or Assets facet and selects an available sort
- **THEN** Main queries the canonical user-global asset root with an explicit scan/result limit
- **AND** results are filtered and stably sorted before projection
- **AND** no Project or Workspace identity participates in the request or result

#### Scenario: Global asset root cannot be read

- **WHEN** the canonical global asset root cannot be created or scanned
- **THEN** Asset Center shows a fail-visible diagnostic
- **AND** it MUST NOT fall back to the active or recent Project directory

### Requirement: Plugins separates Skills from extension capability

Plugins MUST show global personal/builtin Skills discovered by Pi SkillHost and global Desktop
builtin plugin records projected from composed domain capabilities. It MUST support deterministic
search and sorting without selecting or attaching a Project. Without a current external Plugin Host,
installation and execution of external plugins MUST remain unavailable and MUST NOT be represented
as a successful Marketplace.

#### Scenario: User opens Plugins

- **WHEN** the user views Skills or Plugins
- **THEN** Skill records omit physical paths/locators and exclude project source records
- **AND** plugin rows reflect Shell global capability status
- **AND** no Project selector or external install action is offered

#### Scenario: Packaged Desktop discovers the global Skill catalog

- **GIVEN** Desktop is running from a production package
- **WHEN** the user opens or refreshes the Skill catalog
- **THEN** Main SHALL discover packaged builtin and personal Skills through the same Pi SkillHost
  implementation used by Agent turns
- **AND** personal Skills SHALL shadow same-name builtin Skills
- **AND** no synthetic Workspace runtime SHALL be attached
- **AND** a missing packaged builtin Skill root SHALL fail visibly rather than return a successful
  partial catalog

#### Scenario: Skill discovery reports safe diagnostics

- **WHEN** Pi SkillHost encounters invalid or duplicate global Skill records
- **THEN** Home SHALL show a diagnostic summary grouped by safe code/source
- **AND** the Renderer SHALL NOT receive a Skill physical path, locator, fingerprint or raw diagnostic
  message
- **AND** Home SHALL NOT claim an enabled or trusted setting until a real settings/trust authority
  owns that state

#### Scenario: User searches and sorts global capabilities

- **WHEN** the user enters a search and selects a sort in either Plugins page tab
- **THEN** the complete global owner projection is filtered and stably sorted
- **AND** the unavailable external Plugin Host notice remains visible on the Plugins tab

## ADDED Requirements

### Requirement: All Projects is a pure creative Project catalog

All Projects MUST render only the complete Desktop Project catalog and MUST NOT render Agent
conversations as projects or creations. It MUST support name search, deterministic name/update
sorting, and list/grid presentation without copying Project facts into Renderer state.

#### Scenario: User browses all Projects

- **WHEN** the user searches, sorts or changes the list/grid presentation
- **THEN** Desktop derives visible cards or rows from the current Shell Project catalog
- **AND** no Agent conversation summary is rendered in the catalog

#### Scenario: User opens a Project

- **WHEN** the user selects a Project card or row
- **THEN** Desktop uses the existing Project open/focus identity
- **AND** a duplicate Project owner instance is not created

## REMOVED Requirements

### Requirement: All Creations reuses catalog and conversation authorities

**Reason**: Conversations are not creative Projects and must not be mixed into the All Projects
catalog.

**Migration**: Replace the All Creations surface with All Projects; keep conversations in their
existing Agent/Home conversation projection and navigation.
