## ADDED Requirements

### Requirement: Single internal package namespace

Every source workspace package SHALL use the `@neko/*` npm scope. A split family package SHALL encode its domain and runtime role as `@neko/<family>-<role>`; the repository MUST NOT expose or resolve legacy `@neko-<family>/*` identities.

#### Scenario: Split family packages use one scope

- **WHEN** workspace manifests are enumerated
- **THEN** Agent contracts, runtime, and Webview packages are named `@neko/agent-contracts`, `@neko/agent-runtime`, and `@neko/agent-webview`
- **AND** no manifest or source import uses the `@neko-agent/*` scope

#### Scenario: Singleton package keeps concise identity

- **WHEN** a package is a single owner with no independent sibling runtime package
- **THEN** its identity uses `@neko/<name>` without a redundant role suffix

### Requirement: Domain-grouped physical topology

The workspace SHALL place real split families at `packages/<family>/<role>` and singleton package owners at `packages/<name>`. Physical package roots MUST NOT begin with `packages/neko-`, and a workspace package MUST NOT contain another workspace package.

#### Scenario: Split runtime closures are adjacent

- **WHEN** a developer browses the Assets family
- **THEN** its domain, Node, and Webview package roots are located at `packages/assets/domain`, `packages/assets/node`, and `packages/assets/webview`

#### Scenario: Singleton owner is not wrapped in an empty family

- **WHEN** a developer browses the shared UI package
- **THEN** its package root is `packages/ui`
- **AND** no aggregate or container package is created solely to represent the family

### Requirement: Deterministic path and identity validation

The repository SHALL maintain an authoritative package-role inventory and MUST fail visibly when a discovered workspace package is undeclared, a declared root is missing, or a canonical path and package identity do not match the naming convention.

#### Scenario: Old scope is reintroduced

- **WHEN** a manifest or source reference uses an `@neko-<family>/*` identity
- **THEN** the package topology quality gate fails with the offending identity and file

#### Scenario: Redundant physical prefix is reintroduced

- **WHEN** a source package is added below a `packages/neko-*` root
- **THEN** the package topology quality gate fails with the offending package path

#### Scenario: Nested families are discovered

- **WHEN** workspace discovery and quality checks run
- **THEN** package roots matching both `packages/*` and `packages/*/*` are evaluated
- **AND** family container directories without manifests are not treated as packages

### Requirement: Atomic consumer migration

All repository consumers SHALL reference only canonical package identities and paths after migration. The repository MUST NOT retain alias packages, TypeScript path fallbacks, compatibility exports, or dual dependencies that allow a legacy package identity or directory to succeed.

#### Scenario: Application consumes renamed packages

- **WHEN** Desktop Main, preload, renderer, or build configuration resolves a migrated package
- **THEN** it uses the package's canonical `@neko/*` public entry
- **AND** it does not import the physical `packages/*/src` implementation

#### Scenario: Legacy reference scan

- **WHEN** repository quality validation completes
- **THEN** executable source, manifests, current configuration, fixtures, commands, and active implementation documentation contain no legacy package scope or obsolete `packages/neko-*` path

### Requirement: Ownership and runtime behavior remain stable

The naming migration SHALL preserve each package's owning responsibility, package role, public-entry semantics, producer/consumer relationship, and runtime dependency boundary. It MUST NOT change project data, user settings, IPC payloads, or persisted formats.

#### Scenario: Runtime boundaries survive the rename

- **WHEN** package boundary validation runs after migration
- **THEN** Webview packages remain free of Node and Electron imports
- **AND** host-neutral packages remain free of Application and browser UI dependencies
- **AND** Desktop remains the sole Electron composition root

#### Scenario: No user-data migration

- **WHEN** an existing project is opened after the package topology migration
- **THEN** the same project formats and persisted identities are consumed without conversion
