## MODIFIED Requirements

### Requirement: Home exposes four real management surfaces

Desktop Home MUST expose Start Creating, Asset Center, Extensions and All Projects through one collapsible primary sidebar. Each entry MUST select a real Surface backed by an owning projection or command and MUST NOT render a no-op or unavailable placeholder as a successful page.

#### Scenario: User changes a Home section

- **WHEN** the user selects one of the four Home entries
- **THEN** only Shell-owned Home presentation changes
- **AND** open Project, View, Conversation and domain runtime identities remain attached

### Requirement: Extensions separates Skills from extension packages

The Extensions Surface MUST show global personal/builtin Skills discovered by Pi SkillHost and enabled extension packages discovered from the Codex global plugin configuration and verified package manifests. It MUST support deterministic search, source filtering and sorting without selecting or attaching a Project. It MUST NOT project Desktop product modules as extensions.

#### Scenario: User opens Extensions

- **WHEN** the user views Skills or Extensions
- **THEN** Renderer SHALL already have completed sender-bound Desktop bootstrap
- **AND** the request SHALL carry the current endpoint epoch
- **AND** a missing or stale endpoint identity SHALL fail visibly before Skill or extension discovery
- **AND** no active-window fallback SHALL satisfy the request
- **AND** Skill records omit physical paths/locators and exclude project source records
- **AND** extension rows reflect only enabled registrations with a verified plugin manifest
- **AND** Canvas, Cut, Preview, Agent and other Desktop product modules are not extension rows
- **AND** no Project selector, install action or Marketplace success path is offered

#### Scenario: Packaged Desktop discovers the global Skill catalog

- **GIVEN** Desktop is running from a production package
- **WHEN** the user opens or refreshes the Skill catalog
- **THEN** Main SHALL discover packaged builtin and personal Skills through the same Pi SkillHost implementation used by Agent turns
- **AND** personal Skills SHALL shadow same-name builtin Skills
- **AND** no synthetic Workspace runtime SHALL be attached
- **AND** a missing packaged builtin Skill root SHALL fail visibly rather than return a successful partial catalog

#### Scenario: Skill discovery reports safe diagnostics

- **WHEN** Pi SkillHost encounters invalid or duplicate global Skill records
- **THEN** Home SHALL show a diagnostic summary grouped by safe code/source
- **AND** the Renderer SHALL NOT receive a Skill physical path, locator, fingerprint or raw diagnostic message
- **AND** Home SHALL NOT claim an enabled or trusted setting until a real settings/trust authority owns that state

#### Scenario: User filters and sorts global Skills

- **WHEN** the user selects all, personal or builtin Skill source and a supported name sort
- **THEN** Home SHALL filter the complete global owner projection by the selected source
- **AND** all-source results SHALL list personal records before builtin records with deterministic name ordering inside each source

#### Scenario: Desktop discovers enabled global extensions

- **WHEN** the Codex global config enables a plugin and its unique cached package has a valid manifest
- **THEN** Home SHALL project its stable registration id, display metadata, version, developer, marketplace and declared MCP Server/Skill/App contribution summary
- **AND** the projection SHALL omit physical paths, commands, arguments, environment variables, credentials and raw diagnostics
- **AND** the projection SHALL NOT claim that OpenNeko has connected or can execute the contribution

#### Scenario: Global extension registration cannot be verified

- **WHEN** the plugin config, registration id, cached package, manifest or contribution schema is invalid or ambiguous
- **THEN** Home SHALL omit the unverified extension record
- **AND** it SHALL return a safe diagnostic code and count
- **AND** it SHALL NOT scan arbitrary paths or fall back to Desktop built-in capabilities

## ADDED Requirements

### Requirement: Extension catalog presentation supports English and Simplified Chinese

Desktop MUST localize its Extensions navigation, controls, contribution labels, diagnostics, builtin Skill display metadata and empty states for `en` and `zh-cn` without changing canonical Skill runtime metadata or third-party author metadata. Personal Skill and extension manifest display metadata MUST remain author-owned and MUST NOT be silently translated.

#### Scenario: User views builtin Skills in Simplified Chinese

- **WHEN** Desktop `uiLocale` is `zh-cn` and the Skill source is builtin
- **THEN** Home SHALL display the registered Chinese name and short description
- **AND** SkillHost name, description, fingerprint and invocation identity SHALL remain unchanged

#### Scenario: User views builtin Skills in English

- **WHEN** Desktop `uiLocale` is `en` and the Skill source is builtin
- **THEN** Home SHALL display the registered English name and short description
- **AND** the same canonical Skill identity SHALL be used as in the Chinese UI

#### Scenario: User views author-owned metadata

- **WHEN** a personal Skill or extension manifest uses any author-selected language
- **THEN** Home SHALL display that original metadata in every UI locale
- **AND** Desktop SHALL NOT translate or overwrite it

#### Scenario: Packaged builtin localization is incomplete

- **WHEN** a packaged builtin Skill is added without complete `en` and `zh-cn` display metadata
- **THEN** the catalog localization regression test SHALL fail
- **AND** production discovery behavior SHALL continue to use the canonical Skill record rather than claim a translated value

## REMOVED Requirements

### Requirement: Desktop projects built-in capabilities

**Reason**: Desktop product modules are not plugins or extensions and do not belong in the global extension catalog.

**Migration**: Delete the builtin capability DTO, Shell domain projection and Renderer cards; use verified global extension manifests instead.
