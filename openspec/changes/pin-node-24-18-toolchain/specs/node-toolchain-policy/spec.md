## ADDED Requirements

### Requirement: Repository pins the Node development toolchain
The repository SHALL declare Node `24.18.0` in a root toolchain version file that can be consumed by local version managers and automation.

#### Scenario: Developer enters the repository
- **WHEN** a developer uses a version manager that recognizes the root Node version file
- **THEN** the selected Node version is `24.18.0`

### Requirement: CI and Release share the repository Node pin
Every GitHub Actions job that installs Node for build, test, validation, packaging, or release SHALL read the root toolchain version file instead of declaring a floating Node major version.

#### Scenario: CI and Release initialize Node
- **WHEN** any repository workflow runs an `actions/setup-node` step
- **THEN** the step resolves Node from the root version file and uses `24.18.0`

### Requirement: Toolchain pin remains separate from runtime compatibility
The system SHALL keep the Node 24 minimum runtime contract, Node 24 TypeScript declarations, Node 24 CLI bundle target, and VS Code-managed Extension Host runtime independent from the exact development toolchain patch.

#### Scenario: Development toolchain is pinned
- **WHEN** the development, CI, and Release toolchain changes to Node `24.18.0`
- **THEN** `engines.node`, `@types/node`, the CLI bundle target, and the VS Code runtime contract remain on their existing Node 24 compatibility boundaries

### Requirement: Unsupported Node lines are not introduced as fallback paths
The repository MUST NOT add a Node 25 or Node 26 compatibility branch, fallback runtime, or alternate build path as part of the Node 24.18.0 switch.

#### Scenario: Node 24.18.0 is unavailable
- **WHEN** the pinned Node version cannot be installed or initialized
- **THEN** setup fails visibly instead of continuing with Node 25, Node 26, or an unpinned system runtime
