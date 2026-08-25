## ADDED Requirements

### Requirement: DSH owns Skill, MCP and internal Plugin composition

The official OpenNeko DSH profile SHALL be the sole production owner of Skill discovery/loading, MCP connection/Tool projection and DSH Plugin loading/lifecycle. OpenNeko MUST NOT retain a Skill Host, MCP Manager/client/bootstrap, Plugin execution runtime or parallel registration path. Product management state SHALL NOT decide execution by bypassing the DSH profile. Skill and MCP SHALL be the only user-visible extension types; DSH Plugin SHALL remain an internal official profile composition unit and SHALL NOT be presented as a user-installable extension type.

#### Scenario: An official extension is enabled

- **WHEN** the user enables an available official contribution through the product management surface
- **THEN** the request is applied to the exact DSH-owned extension capability and its resulting readiness is replayed through the bridge
- **AND** no OpenNeko Skill, MCP or Plugin runtime loads the contribution

#### Scenario: DSH extension runtime is unavailable

- **WHEN** DSH cannot load the selected contribution
- **THEN** that contribution reports an explicit unavailable diagnostic
- **AND** OpenNeko does not start a legacy extension runtime to provide success

### Requirement: The first release accepts only official packaged extensions

The first release SHALL load only DSH profiles and plugins maintained by OpenNeko, shipped with the product and resolved from the precisely locked read-only package closure. The writable profile SHALL contain the verified official manifest/patch and exact links to the packaged OpenNeko bridge plus every completed first-party domain Tool and MCP contribution in the generated release inventory; its home-level patch SHALL remain the canonical empty patch. It SHALL NOT resolve executable contributions from ordinary workspace dependencies, user-installed profile dependencies, Marketplace paths, a local override, `PATH`, or Q0 fixtures, and SHALL NOT execute locally installed third-party Plugin JavaScript, third-party Webview JavaScript or an OpenNeko-defined third-party extension runtime. Future third-party execution requires a separate accepted OpenSpec defining sandbox, distribution, trust and lifecycle.

#### Scenario: Packaged official profile is loaded

- **WHEN** the packaged application starts DSH
- **THEN** the runtime resolves the exact audited profile/plugin set from the product package
- **AND** no mutable user path or marketplace package can shadow an official executable contribution

#### Scenario: Mutable profile contains an extra executable contribution

- **WHEN** Desktop prepares the production DSH home for startup
- **THEN** the profile is atomically restored to the verified official manifest, patch and exact package links
- **AND** the extra contribution cannot participate while DSH-owned Session data remains untouched

#### Scenario: A local Plugin contains executable JavaScript

- **WHEN** an unqualified local package requests Plugin or Webview code execution
- **THEN** the request is rejected with an unsupported diagnostic
- **AND** its code is not imported by Electron Main, Renderer or DSH

### Requirement: OpenNeko extension management is a Skill/MCP read model

OpenNeko SHALL present the DSH-owned Skill and MCP inventory through a rebuildable, snapshot-only
projection. The surface MUST NOT expose generic Plugin inventory, install, enablement, configuration,
Marketplace state, executable paths or third-party Webview code, and MUST NOT mutate DSH storage or
invent readiness locally.

#### Scenario: Management UI is reopened

- **WHEN** the Extensions scene mounts after being absent
- **THEN** it rebuilds from the exact running DSH Skill/MCP snapshot
- **AND** no retained React Root or OpenNeko extension registry is required

#### Scenario: The official profile contains internal Plugins

- **WHEN** first-party DSH Plugins compose domain Tools or MCP contributions
- **THEN** the product exposes only qualified Skill or MCP facts
- **AND** no Plugin record or action appears in the Extensions surface

### Requirement: Extension failures remain local and visible

DSH profile/bridge integration SHALL isolate invalid Skill content, MCP configuration/connection and Plugin registration to the exact contribution. Duplicate identity, missing dependency, unsupported configuration or load failure MUST produce a stable diagnostic and MUST NOT clear sibling registries, stop unrelated Sessions or return empty success. Registry selection MUST be exact and MUST NOT use wildcard/default handlers, priority probing or try-next fallback.

#### Scenario: One MCP contribution fails to connect

- **WHEN** another official Skill and Plugin remain valid
- **THEN** the MCP contribution alone reports connection failure
- **AND** the valid Skill, Plugin, sibling Conversations and unrelated Workspaces remain usable

#### Scenario: Duplicate contribution identity is discovered

- **WHEN** two packaged contributions claim the same exact identity
- **THEN** the conflicting registration is rejected visibly according to the frozen ownership rule
- **AND** load order does not choose a winner

### Requirement: Browser and computer automation are official DSH MCP integrations

Browser Use and Computer Use SHALL connect through official, product-packaged DSH MCP contributions. The DSH subprocess SHALL own MCP connection, Tool discovery/registration, invocation and cancellation. OpenNeko Automation and Desktop Host SHALL own only exact target selection, OS permission, sender-bound grant, effect classification, user approval and bounded evidence. They MUST NOT own a second MCP client/manager or expose raw MCP Tools outside the DSH Tool authority.

#### Scenario: Browser MCP contribution is ready

- **WHEN** the user has selected an exact authorized browser runtime and the official DSH MCP contribution connects successfully
- **THEN** DSH advertises only its qualified Tools to the exact Agent scope
- **AND** OpenNeko projects readiness without owning the MCP connection or Tool registry

#### Scenario: Upstream MCP management API is unavailable

- **WHEN** the locked DSH release cannot provide the public inventory/configuration contract required by the product UI
- **THEN** that MCP management operation remains visibly unavailable and blocks its release slice
- **AND** OpenNeko does not read private DSH modules or restore its retired MCP Manager

### Requirement: Skills remain method content rather than runtime protocol

DSH-owned Skill content SHALL contain reusable methods, domain judgment and output guidance. Runtime Tool names, ACP methods, MCP transport/configuration, permission grants, Host commands, queue protocol and package-private schema SHALL remain in machine-readable capability/Tool/profile definitions rather than Skill prose. Skill content MUST NOT grant trust, executable code authority or Host access.

#### Scenario: Official Skill contains a runtime protocol tutorial

- **WHEN** validation detects Tool parameters, ACP/MCP commands or Host permission instructions in Skill prose
- **THEN** that Skill fails qualification with an exact diagnostic
- **AND** sibling official contributions remain loadable
