## ADDED Requirements

### Requirement: Skill catalog projects trusted content into DSH

OpenNeko SHALL remain authoritative for Skill installation, source, trust, enablement, fingerprint and user metadata. A thin OpenNeko DSH Skill provider SHALL register only exact trusted, enabled records and MUST NOT pass ordinary project, personal or third-party Plugin Skill directories to a trusted filesystem provider or expose physical paths.

#### Scenario: Register a trusted Skill

- **WHEN** the canonical catalog contains an enabled trusted Skill with a matching fingerprint
- **THEN** the DSH Skill registry receives its allowed metadata and content projection
- **AND** model-visible data contains no absolute directory, raw Host locator or permission grant

#### Scenario: One Skill is invalid

- **WHEN** one Skill fails parsing, fingerprint or containment validation
- **THEN** only that Skill is unavailable with a source-qualified diagnostic
- **AND** sibling Skills, Conversations and Workspaces continue through the canonical DSH runtime

### Requirement: DSH MCP client is the sole MCP execution path

Qualified DSH MCP packages SHALL own MCP connection and MCP Tool projection for product-authorized server configurations. OpenNeko SHALL continue to own configuration, trust, process/environment authorization and product diagnostics. The retired MCP manager, client, bootstrap and Tool wrapper MUST NOT provide success or fallback.

#### Scenario: Connect an authorized MCP server

- **WHEN** a valid enabled server configuration selects a qualified transport
- **THEN** DSH establishes the exact connection and registers its Tools in the current DSH Agent scope
- **AND** Tool calls preserve server identity, cancellation, timeout and explicit result diagnostics

#### Scenario: One MCP server fails

- **WHEN** one server cannot start, connect, enumerate Tools or satisfy its configuration
- **THEN** only that server and its Tools are unavailable with a visible diagnostic
- **AND** sibling MCP servers, first-party Tools and Conversations remain usable without another MCP client

### Requirement: Plugin catalog and Cordis Loader have distinct authorities

OpenNeko Plugin catalog SHALL own installation, source, trust, enablement, fingerprint and user metadata. Cordis Loader SHALL own only mount, unmount and effect disposal for the exact authorized runtime projection. Runtime inventory MUST remain a rebuildable read-only projection and MUST NOT write catalog facts or choose another Plugin after failure.

#### Scenario: Enable an authorized Plugin projection

- **WHEN** the user enables a valid Plugin whose contributions pass catalog and trust validation
- **THEN** Cordis Loader mounts the exact allowed OpenNeko factory or data contribution and inventory reports its runtime state
- **AND** catalog state remains owned by OpenNeko

#### Scenario: Plugin mount fails

- **WHEN** one authorized Plugin factory fails during mount
- **THEN** Loader disposes that partial effect and the Plugin record reports a local diagnostic
- **AND** sibling Plugins, Agent runtime and Workspaces continue without try-next registration

### Requirement: Third-party Extensions cannot execute arbitrary Main-process code

The first DSH migration SHALL allow Cordis Loader to execute only Plugin factories shipped in and reviewed with the OpenNeko codebase. Installed third-party Extensions SHALL remain data-only and MAY contribute only validated Skill, MCP or explicit automation-adapter projections. They MUST NOT import or execute arbitrary JavaScript in Electron Main, access Electron/Node objects or register an unreviewed Cordis factory.

#### Scenario: Third-party Extension declares executable code

- **WHEN** an installed Extension includes a JavaScript entrypoint or Cordis factory not shipped by OpenNeko
- **THEN** the runtime rejects that code contribution with an explicit unsupported diagnostic
- **AND** any independently valid data-only contribution is handled according to its own exact authorization without executing the code

#### Scenario: Builtin factory uses a Desktop adapter

- **WHEN** a reviewed OpenNeko factory requires an Electron or OS capability
- **THEN** it receives only the minimal concrete port wired by `apps/neko-desktop`
- **AND** host-neutral Plugin policy and catalog reconciliation remain in the owning package

### Requirement: Extension failures remain local and fail visible

Skill, MCP and Plugin registration SHALL validate entries independently. Invalid input MUST reject only the affected record, server, contribution or request and MUST NOT fail the root Context, clear shared registries, disable unrelated capabilities or report empty success.

#### Scenario: Mixed valid and invalid contributions load

- **WHEN** one catalog snapshot contains valid and invalid Skill, MCP and Plugin records
- **THEN** each valid record reaches its unique canonical runtime path
- **AND** each invalid record retains an exact diagnostic without preventing the valid siblings from loading
