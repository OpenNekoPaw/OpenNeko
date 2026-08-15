## MODIFIED Requirements

### Requirement: Extensions provides open Plugin, Skill and MCP integration

The Extensions Surface MUST discover and manage personal/plugin Skills and extension packages through the canonical
Agent extension application service. A catalog record itself MUST mean that a configured local source exists; the
projection MUST expose enablement, contribution summary and a local diagnostic without a redundant install-presence
state. It MUST NOT expose qualification, verification, dependency, declared-permission or accepted-permission
status matrices.
Without a composed remote Marketplace/artifact Host, it MUST NOT expose Plugin download, update candidate, transfer,
verification, commit, rollback or cancel-operation state.

#### Scenario: User enables a Plugin

- **WHEN** the user enables a discovered Plugin
- **THEN** enablement SHALL be the complete consent to load that Plugin's declared Skill, ordinary MCP and App
  contributions
- **AND** Tool invocation, Host/OS permission and Automation target/action authorization SHALL continue at their owning
  runtime boundaries
- **AND** Extensions SHALL NOT ask the user to accept a manifest permission string set

#### Scenario: Third-party contribution fails

- **WHEN** one Plugin, Skill, MCP server or Tool cannot be parsed or connected
- **THEN** Extensions SHALL retain the owning record and display a local diagnostic
- **AND** unrelated contributions, extensions, conversations and Workspaces SHALL remain available
- **AND** the failure SHALL NOT be presented as a global qualification or verification result

#### Scenario: Extensions is rescanned

- **WHEN** the user refreshes the Extensions catalog
- **THEN** OpenNeko SHALL rescan only configured local Plugin and Skill sources
- **AND** SHALL NOT contact a Marketplace, download an artifact or construct an update candidate

#### Scenario: User installs a personal or third-party Skill

- **WHEN** a valid Skill is added to an OpenNeko-supported personal, workspace or Plugin Skill root
- **THEN** the canonical Skill discovery path SHALL make it available according to source trust
- **AND** no OpenNeko-specific package, publisher registration or qualification badge SHALL be required
- **AND** `allowed-tools` and external processor authorization SHALL only restrict existing runtime authority

### Requirement: External Automation dependencies remain user-managed

Extensions MUST provide official installation guidance, a copyable installation command, exact resource selection,
recheck and disconnect for Browser Use and Cua Driver. OpenNeko MUST NOT execute, update or uninstall the external
runtime.

#### Scenario: User needs Browser Use

- **WHEN** Browser Use is not configured
- **THEN** Extensions SHALL show `uv tool install 'browser-use[cli]'` as a copyable persistent installation command and an upstream installation-guide action
- **AND** SHALL allow the user to select the provider runtime and browser executable independently
- **AND** SHALL NOT execute `uv tool`, `uvx`, `pip`, shell or any installer

#### Scenario: User needs Cua Driver

- **WHEN** Cua Driver is not configured
- **THEN** Extensions SHALL show a copyable upstream installation command and installation-guide action
- **AND** SHALL allow the user to select the exact installed application/runtime
- **AND** SHALL NOT execute `curl`, shell, PowerShell or the upstream installer

#### Scenario: User opens a non-Automation Extension

- **WHEN** the selected Plugin does not own a Browser or Computer adapter
- **THEN** its detail SHALL NOT append Browser/Cua runtime or OS-permission controls
- **AND** the Plugin's own contributions, enablement and local diagnostics SHALL remain available

#### Scenario: User disconnects a local runtime

- **WHEN** the user confirms Disconnect and no exact Automation session owns the source
- **THEN** OpenNeko SHALL remove only its Host-owned authorization
- **AND** SHALL NOT delete, update or terminate user-owned runtime files
- **AND** extension metadata and sibling extensions SHALL remain available

### Requirement: Local runtime UI is action-oriented

The local runtime projection MUST use only `not-configured`, `ready` and `error` as its top-level state. The UI MUST
show concrete resource state and diagnostics when action is needed. It MUST NOT show `qualified`, `unqualified`,
`verified`, `unverified` or equivalent badges.

#### Scenario: Compatible runtime connects

- **WHEN** the exact selected assets remain valid, MCP handshake succeeds and required operations are structurally
  compatible
- **THEN** the source SHALL be reported `ready`
- **AND** the UI SHALL show available actions without a qualification badge

#### Scenario: Runtime is incompatible

- **WHEN** MCP connection, required operation or required input shape is incompatible
- **THEN** only that source SHALL be reported `error` with a concrete diagnostic
- **AND** the user MAY reselect, recheck or disconnect it
- **AND** OpenNeko SHALL NOT select another runtime or present a generalized third-party trust verdict

### Requirement: Opening management surfaces never installs dependencies

Opening Agent, Extensions, a Skill or a conversation MUST NOT download or execute third-party dependencies.

#### Scenario: Extensions is refreshed

- **WHEN** the user refreshes Extensions
- **THEN** OpenNeko SHALL only reread configured Plugin/Skill/MCP/local-runtime facts
- **AND** no package manager, installer, remote shell or hidden dependency setup SHALL execute
