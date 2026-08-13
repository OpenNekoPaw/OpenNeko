## MODIFIED Requirements

### Requirement: Home exposes four real management surfaces

Desktop Home MUST expose Start Creating, Asset Center, Extensions and All Projects through one collapsible primary sidebar. Each entry MUST select a real Surface backed by an owning projection or command and MUST NOT render a no-op or unavailable placeholder as a successful page.

#### Scenario: User changes a Home section

- **WHEN** the user selects one of the four Home entries
- **THEN** only Shell-owned Home presentation changes
- **AND** open Project, View, Conversation and domain runtime identities remain attached

### Requirement: Extensions manages Skills and local Plugin packages

The Extensions Surface MUST manage global personal/plugin Skills discovered by Pi SkillHost and Plugin
packages from exact bundled roots or the OpenNeko local install repository. P0 MUST NOT require or read a
Marketplace to discover, install, enable or run a Skill or Plugin. It MUST support deterministic search
without selecting or attaching a Project and MUST NOT project builtin Skills or Desktop product modules as
manageable extensions.

#### Scenario: User opens Extensions

- **WHEN** the user views Skills or Plugins
- **THEN** Renderer SHALL already have completed sender-bound Desktop bootstrap
- **AND** the request SHALL carry the current renderer session identity and request id
- **AND** a missing or stale session identity SHALL fail visibly before Skill or Plugin discovery
- **AND** no active-window fallback SHALL satisfy the request
- **AND** Skill records SHALL omit physical paths/locators and exclude project and builtin source records
- **AND** Plugin rows SHALL come only from exact bundled roots or SQLite-registered local installations
- **AND** Canvas, Cut, Preview, Agent and other Desktop product modules SHALL NOT become Plugin rows
- **AND** install/remove actions SHALL use typed Main intents rather than Renderer file, database or process access

#### Scenario: Packaged Desktop separates Agent builtin discovery from management projection

- **GIVEN** Desktop is running from a production package
- **WHEN** the user opens or rescans the Skill catalog
- **THEN** Main SHALL discover packaged builtin and personal Skills through the same Pi SkillHost implementation used by Agent turns
- **AND** personal Skills SHALL shadow same-name builtin Skills
- **AND** Home SHALL project personal and plugin Skills only
- **AND** builtin Skills SHALL remain available to Pi Agent turns without appearing in Home search, counts or cards
- **AND** no synthetic Workspace runtime SHALL be attached
- **AND** a missing packaged builtin Skill root SHALL fail visibly rather than return a successful partial catalog

#### Scenario: Standalone Skill runs without Plugin or MCP

- **GIVEN** a valid trusted and enabled personal or project Skill exists
- **AND** no Plugin or MCP Server is installed or connected
- **WHEN** Pi SkillHost discovers and selects that Skill
- **THEN** the Skill SHALL remain available through its exact source identity and Host fingerprint
- **AND** no Plugin manifest, Plugin enablement row, MCP config or Marketplace input SHALL participate

#### Scenario: Skill discovery reports safe diagnostics

- **WHEN** Pi SkillHost encounters invalid or duplicate global Skill records
- **THEN** Home SHALL show a diagnostic summary grouped by safe code/source
- **AND** the Renderer SHALL NOT receive a Skill physical path, locator, fingerprint or raw diagnostic message
- **AND** Home SHALL NOT claim an enabled or trusted setting until a real settings/trust authority owns that state

#### Scenario: User searches global Skills

- **WHEN** the user searches the complete global Skill projection
- **THEN** Home SHALL match author-owned name, description and source metadata
- **AND** results SHALL list personal records before plugin records with deterministic name ordering inside each source

#### Scenario: Extensions Surface exposes only local management controls

- **WHEN** the user opens either the Skill or Plugin tab
- **THEN** Home SHALL expose text search and the Skill/Plugin segmented control
- **AND** the Plugin tab SHALL expose Add local Plugin and Rescan actions
- **AND** Home SHALL NOT expose Marketplace, available inventory, marketplace refresh, publisher catalog, status/category filters or sort selectors
- **AND** Plugin records SHALL use stable display name and Plugin identity ordering

#### Scenario: User reviews Skill and Plugin overview information

- **WHEN** the user opens a Skill or Plugin detail
- **THEN** Home SHALL present an overview hierarchy derived from author-owned metadata and current Host facts
- **AND** a Skill overview SHALL show its stable Skill name, description, source and exact owning Plugin when applicable
- **AND** a Plugin overview SHALL show delivery source, publisher-managed version, developer, contribution summary and actual component readiness
- **AND** the overview SHALL NOT project a Plugin file tree, raw `plugin.json`, raw `mcp.json`, Skill prompt body, process configuration, SQLite record, physical path, fingerprint, locator or raw diagnostic
- **AND** internal composite management identity SHALL NOT replace the user-facing Skill name

#### Scenario: User opens or reveals a personal Skill package

- **WHEN** the user invokes Open `SKILL.md` or Show in Folder for a current personal Skill management identity
- **THEN** the Personal Skill manager SHALL re-resolve the exact current Skill, fingerprint and contained personal root
- **AND** Desktop SHALL invoke only the injected system file-open or reveal adapter for the resolved `SKILL.md`
- **AND** Renderer SHALL NOT send or receive a physical path
- **AND** a stale, missing, changed, escaped or non-personal identity SHALL fail visibly without opening another file or directory
- **AND** the operation SHALL NOT mutate Skill content, Plugin state or Agent runtime state

#### Scenario: User reviews a Plugin-owned Skill

- **WHEN** the selected Skill source is Plugin-owned
- **THEN** Home SHALL offer navigation to the exact owning Plugin overview when that Plugin is present
- **AND** Home SHALL NOT expose individual edit, reveal or remove actions for that Plugin Skill
- **AND** no same-name or active/recent Plugin fallback SHALL satisfy the navigation

#### Scenario: Desktop lists manageable Plugins

- **WHEN** an exact bundled root or SQLite installation row resolves to a valid root `plugin.json`
- **THEN** Home SHALL project the Plugin for management
- **AND** Home SHALL project its stable manifest name as Plugin identity, enabled state, delivery source, display metadata, publisher-managed version and declared component summary
- **AND** Home SHALL project runtime readiness from actual Skill/MCP/App composition rather than the manifest declaration
- **AND** the projection SHALL omit physical paths, commands, arguments, environment variables, credentials and raw diagnostics
- **AND** the projection SHALL NOT include a Marketplace identity

#### Scenario: Installed Plugin has no supported runtime contribution

- **WHEN** a valid installed Plugin is App-only, OAuth-only, has no Agent contribution, or every contribution is unsupported
- **THEN** Home SHALL retain it as a manageable installed record
- **AND** Home SHALL show a localized unsupported state for the affected contribution or Plugin summary
- **AND** Pi SHALL NOT receive a synthetic Skill or Tool

#### Scenario: User installs a local Plugin

- **WHEN** the user explicitly selects a local Plugin directory and confirms installation
- **THEN** Desktop SHALL authorize only the selected source path
- **AND** the Agent extension service SHALL validate containment, symlinks, limits, root manifest, identity and component documents in staging
- **AND** the Plugin SHALL be installed under the canonical OpenNeko install root with a SQLite lifecycle record
- **AND** a successful result SHALL re-read the exact local catalog and reconcile runtime readiness
- **AND** no Marketplace index or arbitrary source scan SHALL participate

#### Scenario: User enables or disables a Plugin

- **WHEN** the user confirms enable or disable for an exact installed Plugin identity
- **THEN** the durable choice SHALL be written to the Plugin SQLite state repository
- **AND** runtime replacement SHALL occur only when no owned Agent turn or Automation session is active
- **AND** the manifest and package files SHALL NOT be rewritten with user state

#### Scenario: User removes a local Plugin

- **WHEN** the user confirms removal for an exact removable Plugin identity
- **THEN** Main SHALL re-resolve the SQLite row, contained relative locator and manifest identity
- **AND** Main SHALL move only the exact installed package to system trash
- **AND** the Plugin lifecycle row and runtime SHALL be updated without changing sibling records
- **AND** bundled Plugins SHALL NOT expose removal

#### Scenario: Plugin management request is stale or runtime-owned work is active

- **WHEN** the request identity is stale or the Plugin owns an active Agent turn or Automation session
- **THEN** the mutation SHALL fail visibly without changing the package, SQLite choice or runtime instance
- **AND** no active/recent Plugin fallback SHALL satisfy the request

#### Scenario: Plugin package or durable record cannot be verified

- **WHEN** a Plugin identity, SQLite row, relative locator, source package, manifest or component document is invalid
- **THEN** the affected installed record SHALL remain visible with a safe local diagnostic when a durable row exists
- **AND** invalid package content SHALL NOT enter Pi SkillHost, MCPManager or another runtime
- **AND** sibling Skills, Plugins, workspaces and the Desktop Shell SHALL remain available
- **AND** Desktop SHALL NOT scan arbitrary paths, auto-register orphan bytes or fall back to product modules

#### Scenario: Another application has local marketplaces or installed Plugins

- **GIVEN** Codex, OpenAI or another application has local marketplace snapshots, caches or installed Plugins on the same machine
- **WHEN** OpenNeko lists, rescans, installs, enables, disables or removes Plugins
- **THEN** Desktop SHALL NOT read, display or mutate those foreign records
- **AND** only exact bundled roots, the OpenNeko install root and OpenNeko SQLite state SHALL participate
- **AND** empty OpenNeko sources SHALL produce an honest empty Plugin catalog

### Requirement: Installed Plugin contributions enter the Pi Agent canonical path

Enabled compatible Plugin Skills and MCP Servers MUST be composed into the same Pi SkillHost and Tool
execution paths used by ordinary Desktop Agent turns. Component readiness MUST be independent and
manifest-only metadata MUST NOT satisfy runtime availability.

#### Scenario: Pi Agent uses an installed Plugin Skill

- **WHEN** an enabled Plugin contributes a valid Skill and a turn selects that Skill
- **THEN** Pi SkillHost SHALL discover it with source `plugin` and the exact Plugin identity
- **AND** the Pi read receipt SHALL contain the Plugin source and Host-computed fingerprint
- **AND** the Skill SHALL remain usable when the same Plugin has no MCP contribution or its MCP contribution fails
- **AND** no personal, builtin or project Skill with a different identity SHALL satisfy the receipt

#### Scenario: Pi Agent calls an installed Plugin MCP Tool

- **WHEN** an enabled Plugin contributes a compatible MCP Server that connects and discovers Tools
- **THEN** those Tools SHALL enter the existing MCPManager, ToolRegistry and Pi Tool projection
- **AND** Tool calls SHALL execute through the owning MCP client
- **AND** the MCP contribution SHALL remain independent of whether the Plugin contributes Skills
- **AND** the manifest contribution id alone SHALL NOT be reported as ready

#### Scenario: One Plugin contribution fails

- **WHEN** one contribution is unsupported, invalid or fails connection
- **THEN** that contribution SHALL produce a localized unsupported/error state and no executable capability
- **AND** valid sibling contributions SHALL retain their own verified readiness
- **AND** no fallback Tool, Skill source, provider or success state SHALL be created

### Requirement: Personal Skills are managed through the Pi Skill root

Desktop MUST support installing a validated local Skill package into the personal Skill root and removing a
selected personal Skill through a recoverable Host operation. Personal Skill lifecycle MUST remain independent
from Plugin, MCP and Marketplace lifecycle. Builtin and Plugin Skills MUST NOT expose individual removal.

#### Scenario: User installs a personal Skill

- **WHEN** the user selects a contained local Skill directory with valid metadata and a unique name
- **THEN** Main SHALL validate it in staging through Pi SkillHost
- **AND** Main SHALL atomically install it into the personal Skill root
- **AND** the next Home catalog and Agent turn SHALL use the same Skill identity
- **AND** no Plugin manifest, SQLite Plugin row, MCP config or Marketplace input SHALL participate

#### Scenario: User removes a personal Skill

- **WHEN** the user confirms removal for a current opaque management id
- **THEN** Main SHALL re-resolve the Skill inside the personal root and move it to system trash
- **AND** the next Pi discovery SHALL omit it
- **AND** no path SHALL be accepted from Renderer

## ADDED Requirements

### Requirement: Plugin packages use one canonical portable manifest

Every managed Plugin package MUST contain one root `plugin.json` with a canonical minimal metadata shape.
Skills and MCP contribution documents MUST use fixed contained component locations, and host-specific metadata
MUST be isolated under a reverse-domain extension namespace.

#### Scenario: Plugin declares portable and OpenNeko-specific metadata

- **WHEN** Desktop validates a Plugin package
- **THEN** portable identity and publisher metadata SHALL be read from the canonical top-level fields
- **AND** Skills SHALL be discovered only from the fixed `skills/` location when present
- **AND** MCP configuration SHALL be discovered only from the fixed `mcp.json` location when present
- **AND** OpenNeko-specific metadata SHALL be accepted only from the OpenNeko reverse-domain extension object
- **AND** `.openneko-plugin`, `.codex-plugin` and manifest-version dispatch SHALL NOT be read

#### Scenario: Plugin omits an optional component

- **WHEN** a valid Plugin does not contain `skills/`, `mcp.json` or a future optional component
- **THEN** the missing component SHALL mean no contribution of that type
- **AND** it SHALL NOT invalidate the Plugin or trigger another discovery path

### Requirement: Plugin user state uses the Desktop SQLite authority

Plugin installation lifecycle and enablement MUST use the single Desktop local metadata Store. Package files
MUST remain filesystem content and runtime state MUST remain process-local.

#### Scenario: Desktop reopens with installed Plugin state

- **WHEN** Desktop reopens `~/.neko/neko.db` and the exact installed package remains valid
- **THEN** the Plugin catalog SHALL restore its installation and enablement from the package-owned SQLite repository
- **AND** runtime readiness SHALL be recomputed from current verified package content
- **AND** package bytes, Skill content, credentials and prior health results SHALL NOT be loaded from SQLite

#### Scenario: Old JSON grant exists

- **GIVEN** an old `${NEKO_HOME}/extensions/state/*.json` grant exists
- **WHEN** the new Plugin state repository initializes
- **THEN** product runtime SHALL NOT read, import, rewrite or delete the old grant
- **AND** only current canonical SQLite state SHALL control enablement

#### Scenario: SQLite row and package content disagree

- **WHEN** a durable Plugin row points to missing, escaped or invalid package content
- **THEN** the exact Plugin record SHALL remain visible with an invalid diagnostic
- **AND** enable and execution SHALL be rejected for that record
- **AND** sibling records and capabilities SHALL remain available
- **AND** Desktop SHALL NOT repair the row by scanning another package location

### Requirement: Extension catalog presentation supports English and Simplified Chinese

Desktop MUST localize its Extensions navigation, controls, installed/runtime states, local install,
enable/disable/remove/rescan actions, confirmations, component labels, diagnostics and empty states for `en` and
`zh-cn` without changing canonical Skill runtime metadata or third-party author metadata. Personal/plugin Skill
and Plugin manifest display metadata MUST remain author-owned and MUST NOT be silently translated.

#### Scenario: User views author-owned metadata

- **WHEN** a personal Skill or Plugin manifest uses any author-selected language
- **THEN** Home SHALL display that original metadata in every UI locale
- **AND** Desktop SHALL NOT translate or overwrite it

#### Scenario: User manages Plugins in Simplified Chinese

- **WHEN** Desktop `uiLocale` is `zh-cn`
- **THEN** local install, enabled/disabled, runtime, confirmation and error copy SHALL be Chinese
- **AND** author-owned Plugin names and descriptions MAY remain in their original language

## REMOVED Requirements

### Requirement: Desktop projects built-in capabilities

**Reason**: Desktop product modules are not Plugins or extensions and do not belong in the global extension catalog.

**Migration**: Delete the builtin capability DTO, Shell domain projection and Renderer cards; use verified Skill and local Plugin records instead.
