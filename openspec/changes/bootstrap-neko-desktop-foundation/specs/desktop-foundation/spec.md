## ADDED Requirements

### Requirement: Desktop MUST have one Electron composition root

The system MUST provide exactly one `apps/neko-desktop` application composition root with separate
main, preload, renderer and shared serializable-contract boundaries. Reusable packages MUST NOT
depend on that application root, and the application MUST consume package public entries.

#### Scenario: Desktop foundation starts

- **WHEN** the packaged or development Desktop entry starts
- **THEN** main creates the AppHost before creating the renderer window
- **AND** preload exposes only the fixed Desktop bridge
- **AND** renderer obtains bootstrap state through that bridge

### Requirement: Desktop renderer MUST remain sandboxed

Every Desktop renderer window MUST enable sandbox and context isolation and MUST disable Node
integration, insecure content and security bypasses. Renderer source MUST NOT import Node,
Electron or VS Code modules.

#### Scenario: Renderer requests privileged capability

- **WHEN** renderer code attempts raw IPC, arbitrary navigation, a new window, filesystem access or
  an unknown capability
- **THEN** the request is unavailable or rejected with a diagnostic
- **AND** no raw Electron or Node object crosses preload

### Requirement: Desktop bridge MUST validate contract and sender identity

Every Desktop bridge operation MUST use a fixed channel and versioned serializable schema. Main
MUST derive window and application identity from its registry and the real IPC sender rather than
trusting renderer-provided authority.

#### Scenario: A stale renderer sends a bootstrap request

- **WHEN** the sender WebContents, frame origin, window identity, application instance or renderer
  epoch does not match the registry
- **THEN** main rejects the request visibly
- **AND** it does not fall back to the active window or another application instance

### Requirement: Desktop AppHost MUST own Electron lifecycle resources

Desktop AppHost MUST own windows, handlers, subscriptions and disposables created for the
application. Reload, window close and app quit MUST have explicit, idempotent cleanup behavior.

#### Scenario: A Desktop window closes

- **WHEN** the registered BrowserWindow is closed
- **THEN** the corresponding window owner and subscriptions are disposed
- **AND** later events cannot be delivered to that owner
- **AND** other window owners remain unchanged

### Requirement: Electron Host MUST implement host-neutral ports

Desktop main MUST compose an Electron implementation of the required `NekoHostPorts` without
adding Electron types to `@neko/host`. Filesystem, path, workspace, policy and secret operations
MUST stay in main and MUST NOT expose absolute paths or secret values to renderer bootstrap DTOs.

#### Scenario: Renderer receives bootstrap state

- **WHEN** a valid window requests its bootstrap projection
- **THEN** it receives host kind, runtime summary, application identity, window identity and
  non-sensitive diagnostics
- **AND** it does not receive environment variables, absolute workspace paths, credentials or raw
  Host port objects

### Requirement: Desktop application identity MUST replace retired host identities

The canonical application set MUST contain only `neko-desktop`. `neko-home`, `neko-tui` and
`neko-vscode` MUST NOT parse successfully or remain available as aliases or fallbacks. Before
removal, all defined application storage categories MUST receive an audited migration, reuse,
rebuild or rejection disposition.

#### Scenario: Retired host identity reaches a new contract

- **WHEN** an identity with application id `neko-home`, `neko-tui` or `neko-vscode` is parsed after
  migration
- **THEN** parsing fails with `unknown-application-identity`
- **AND** no alias silently converts it to `neko-desktop`

### Requirement: Foundation MUST preserve current application paths

The Desktop foundation MUST NOT change VS Code or TUI application identities, entrypoints,
builds or release claims.

#### Scenario: Repository applications are built and tested

- **WHEN** Desktop foundation validation runs
- **THEN** Desktop, VS Code and TUI retain distinct composition roots
- **AND** current VS Code and TUI contract tests continue to pass
