## MODIFIED Requirements

### Requirement: Home exposes four real management surfaces

Desktop Home MUST expose Start Creating, Asset Center, Extensions and All Projects through one collapsible primary sidebar. Each entry MUST select a real Surface backed by an owning projection or command and MUST NOT render a no-op or unavailable placeholder as a successful page.

#### Scenario: User changes a Home section

- **WHEN** the user selects one of the four Home entries
- **THEN** only Shell-owned Home presentation changes
- **AND** open Project, View, Conversation and domain runtime identities remain attached

### Requirement: Extensions manages Skills and extension packages

The Extensions Surface MUST manage global personal/plugin Skills discovered by Pi SkillHost
and extension packages discovered only through the OpenNeko-owned marketplace repository and install
root. Available packages MUST additionally pass the Pi SkillHost/OpenNeko MCP runtime support policy. It
MUST support deterministic search and product ordering without selecting or attaching a Project. It
MUST NOT project builtin Skills or Desktop product modules as manageable extensions.

#### Scenario: User opens Extensions

- **WHEN** the user views Skills or Extensions
- **THEN** Renderer SHALL already have completed sender-bound Desktop bootstrap
- **AND** the request SHALL carry the current endpoint epoch
- **AND** a missing or stale endpoint identity SHALL fail visibly before Skill or extension discovery
- **AND** no active-window fallback SHALL satisfy the request
- **AND** Skill records omit physical paths/locators and exclude project and builtin source records
- **AND** installed extension rows reflect the OpenNeko install root plus a verified manifest
- **AND** available extension rows additionally have at least one Pi/OpenNeko-supported Skill or MCP
  contribution
- **AND** Canvas, Cut, Preview, Agent and other Desktop product modules are not extension rows
- **AND** install/remove actions use typed Main intents rather than Renderer file or process access

#### Scenario: Packaged Desktop separates Agent builtin discovery from management projection

- **GIVEN** Desktop is running from a production package
- **WHEN** the user opens or refreshes the Skill catalog
- **THEN** Main SHALL discover packaged builtin and personal Skills through the same Pi SkillHost implementation used by Agent turns
- **AND** personal Skills SHALL shadow same-name builtin Skills
- **AND** Home SHALL project personal and plugin Skills only
- **AND** builtin Skills SHALL remain available to Pi Agent turns without appearing in Home search,
  counts or cards
- **AND** no synthetic Workspace runtime SHALL be attached
- **AND** a missing packaged builtin Skill root SHALL fail visibly rather than return a successful partial catalog

#### Scenario: Skill discovery reports safe diagnostics

- **WHEN** Pi SkillHost encounters invalid or duplicate global Skill records
- **THEN** Home SHALL show a diagnostic summary grouped by safe code/source
- **AND** the Renderer SHALL NOT receive a Skill physical path, locator, fingerprint or raw diagnostic message
- **AND** Home SHALL NOT claim an enabled or trusted setting until a real settings/trust authority owns that state

#### Scenario: User searches global Skills

- **WHEN** the user searches the complete global Skill projection
- **THEN** Home SHALL match author-owned name, description and source metadata
- **AND** results SHALL list personal records before plugin records with deterministic name ordering
  inside each source

#### Scenario: Extensions Surface exposes only necessary catalog controls

- **WHEN** the user opens either the Skill or extension tab
- **THEN** Home SHALL expose text search and the Skill/extension segmented control
- **AND** Home SHALL NOT expose source, status, category or sort selectors
- **AND** extension results SHALL retain the content-creation-first deterministic product order

#### Scenario: Desktop lists manageable global extensions

- **WHEN** the OpenNeko repository lists an installed or available plugin and its source has a valid
  `.openneko-plugin/plugin.json`
- **THEN** Home SHALL always project an installed plugin for management
- **AND** Home SHALL project an available plugin only when Pi SkillHost validates its Skill
  contribution or OpenNeko validates at least one supported MCP transport
- **AND** Home SHALL project its stable plugin id, installed/enabled state, display metadata,
  version, developer, category, marketplace and declared MCP Server/Skill/App summary
- **AND** Home SHALL project whether each contribution type has a real OpenNeko runtime owner
- **AND** the projection SHALL omit physical paths, commands, arguments, environment variables, credentials and raw diagnostics
- **AND** runtime readiness SHALL come from Pi Skill/MCP composition, not the manifest declaration

#### Scenario: Marketplace plugin is not supported by OpenNeko

- **WHEN** an available plugin is App-only, OAuth-only, has no Agent contribution, or its Skill/MCP
  contribution cannot pass the current Pi/OpenNeko support policy
- **THEN** Home SHALL omit it from the available catalog
- **AND** foreign application marketplace availability SHALL NOT be presented as OpenNeko support
- **AND** the same plugin SHALL remain visible if already installed so the user can inspect its
  unsupported/error state and remove it

#### Scenario: Content creation extensions are recommended first

- **WHEN** the user uses the default extension catalog sort
- **THEN** Home SHALL order content creation categories before general productivity, research/data
  and other supported categories
- **AND** installed state SHALL break ties inside the same product relevance group
- **AND** stable display name and plugin id SHALL make the result deterministic
- **AND** explicit name ascending/descending sorts SHALL remain available

#### Scenario: User installs or removes a plugin

- **WHEN** the user confirms install or removal for the current catalog revision
- **THEN** Main SHALL atomically install from the contained OpenNeko package source or move the exact
  installed package to system trash
- **AND** Main SHALL re-read the authoritative catalog
- **AND** Main SHALL replace the Pi plugin runtime generation only when no Agent turn is active
- **AND** the result SHALL contain the new catalog revision and safe operation status

#### Scenario: Plugin management request is stale or Agent is busy

- **WHEN** the expected catalog revision is stale or an Agent turn is active
- **THEN** the mutation SHALL fail visibly without changing the OpenNeko install root or runtime
- **AND** the previous plugin installation and runtime generation SHALL remain authoritative

#### Scenario: Global extension record cannot be verified

- **WHEN** the repository index, plugin id, source package, manifest or contribution schema is invalid
- **THEN** Home SHALL omit the unverified extension record
- **AND** it SHALL return a safe diagnostic code and count
- **AND** it SHALL NOT scan arbitrary paths or fall back to Desktop built-in capabilities

#### Scenario: Another application has local marketplaces or installed plugins

- **GIVEN** Codex, OpenAI or another application has local marketplace snapshots, caches or installed
  plugins on the same machine
- **WHEN** OpenNeko lists, reloads, installs or removes extensions
- **THEN** Desktop SHALL NOT read, display, refresh, install, remove or mutate those foreign records
- **AND** only the OpenNeko repository root and `${NEKO_HOME}/extensions/plugins` SHALL participate
- **AND** an empty OpenNeko repository SHALL produce an honest empty catalog

### Requirement: Installed plugin contributions enter the Pi Agent canonical path

Installed compatible plugin Skills and MCP Servers MUST be composed into the same Pi SkillHost and
Tool execution path used by ordinary Desktop Agent turns. Manifest-only metadata MUST NOT satisfy
runtime availability.

#### Scenario: Pi Agent uses an installed plugin Skill

- **WHEN** an installed plugin contributes a valid Skill and a turn selects that Skill
- **THEN** Pi SkillHost SHALL discover it with source `plugin` and the exact plugin id
- **AND** the Pi read receipt SHALL contain the plugin source and Host-computed fingerprint
- **AND** no personal, builtin or project Skill with a different identity SHALL satisfy the receipt

#### Scenario: Pi Agent calls an installed plugin MCP Tool

- **WHEN** an installed plugin contributes a compatible MCP Server that connects and discovers Tools
- **THEN** those Tools SHALL enter the existing MCPManager, ToolRegistry and Pi Tool projection
- **AND** Tool calls SHALL execute through the owning MCP client
- **AND** the manifest contribution id alone SHALL NOT be reported as ready

#### Scenario: Plugin contribution is unsupported or fails to connect

- **WHEN** a plugin is App-only, requires unsupported OAuth, has an invalid MCP definition or fails
  MCP connection
- **THEN** Home SHALL show a localized unsupported/error state
- **AND** Pi SHALL NOT receive a Tool or Skill from the failed contribution
- **AND** no fallback Tool or success state SHALL be created

### Requirement: Personal Skills are managed through the Pi Skill root

Desktop MUST support installing a validated local Skill package into the personal Skill root and
removing a selected personal Skill through a recoverable Host operation. Builtin and plugin Skills
MUST NOT expose individual removal.

#### Scenario: User installs a personal Skill

- **WHEN** the user selects a contained local Skill directory with valid metadata and a unique name
- **THEN** Main SHALL validate it in staging through Pi SkillHost
- **AND** Main SHALL atomically install it into the personal Skill root
- **AND** the next Home catalog and Agent turn SHALL use the same Skill identity

#### Scenario: User removes a personal Skill

- **WHEN** the user confirms removal for a current opaque management id
- **THEN** Main SHALL re-resolve the Skill inside the personal root and move it to system trash
- **AND** the next Pi discovery SHALL omit it
- **AND** no path SHALL be accepted from Renderer

## ADDED Requirements

### Requirement: Extension catalog presentation supports English and Simplified Chinese

Desktop MUST localize its Extensions navigation, controls, installed/available and runtime states,
install/remove/refresh actions, confirmations, contribution labels, diagnostics and empty states for
`en` and `zh-cn` without changing canonical Skill runtime
metadata or third-party author metadata. Personal/plugin Skill and extension manifest display
metadata MUST remain author-owned and MUST NOT be silently translated.

#### Scenario: User views author-owned metadata

- **WHEN** a personal Skill or extension manifest uses any author-selected language
- **THEN** Home SHALL display that original metadata in every UI locale
- **AND** Desktop SHALL NOT translate or overwrite it

#### Scenario: User manages plugins in Simplified Chinese

- **WHEN** Desktop `uiLocale` is `zh-cn`
- **THEN** installed/available, install/remove, compatibility, runtime, confirmation and error copy
  SHALL be Chinese
- **AND** author-owned plugin names and descriptions MAY remain in their original language

## REMOVED Requirements

### Requirement: Desktop projects built-in capabilities

**Reason**: Desktop product modules are not plugins or extensions and do not belong in the global extension catalog.

**Migration**: Delete the builtin capability DTO, Shell domain projection and Renderer cards; use verified global extension manifests instead.
