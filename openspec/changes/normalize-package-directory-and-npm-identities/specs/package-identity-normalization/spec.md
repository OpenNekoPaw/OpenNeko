## ADDED Requirements

### Requirement: One complete mapping governs package identity migration

Before renaming, the change SHALL maintain a complete mapping for the Desktop app and every current
workspace package containing current directory, current npm identity, final directory, final
identity, owner, actual consumers, and disposition. Removed or merged packages MUST remain explicit
in the inventory and MUST NOT receive a new target package.

#### Scenario: Workspace inventory changes before migration

- **WHEN** the apply-time package/consumer inventory differs from the approved mapping
- **THEN** implementation stops with the added, removed, or changed row
- **AND** no partial rename proceeds

### Requirement: Agent final identity is the runtime owner

The Agent runtime SHALL use `packages/neko-agent` and `@neko/agent`. This target MUST be a direct
directory rename of the retained runtime owner and MUST NOT restore the historical Agent aggregate
root, nested workspace, compatibility facade, or second `@neko/agent` implementation.

#### Scenario: Agent topology is validated

- **WHEN** repository topology and package resolution checks run after migration
- **THEN** exactly one `@neko/agent` resolves from `packages/neko-agent/package.json`
- **AND** it exposes the Agent runtime responsibility rather than aggregate child packages

### Requirement: Retained package names use one canonical convention

Every retained package SHALL use an `@neko/*` npm identity and a responsibility-aligned
`packages/neko-*` directory. Ownerless names such as `@neko/webview`, legacy nested scopes, and the
unscoped `neko-assets` identity MUST be replaced according to the approved mapping.

#### Scenario: Package topology guard scans retained workspaces

- **WHEN** it enumerates package manifests and directories
- **THEN** every retained identity and directory matches the authoritative mapping
- **AND** a mixed legacy scope, ambiguous owner, or duplicate identity fails validation

### Requirement: Renames are atomic and have no compatibility path

The migration SHALL update directories, manifests, imports, exports, scripts, lockfile, tests,
fixtures, quality guards, CI/release tooling, and active documentation as one canonical transition.
Old identities MUST NOT resolve through aliases, conditional exports, path mappings, re-export
packages, fallback imports, or dual registration.

#### Scenario: An old package identity is referenced

- **WHEN** repository checks, TypeScript resolution, or a poison test references an old identity
- **THEN** resolution fails visibly
- **AND** the new identity is the only successful path

### Requirement: Rename order follows ownership convergence

Identity normalization SHALL begin only after Platform removal, Shared responsibility convergence,
Host boundary refinement, and zero-consumer dispositions complete. The rename MUST NOT create
targets for packages that predecessor changes delete or merge.

#### Scenario: A predecessor change is incomplete

- **WHEN** identity normalization readiness is evaluated
- **THEN** implementation remains blocked
- **AND** no package directory or npm identity is changed

### Requirement: Package rename does not alter user data

The identity transition SHALL NOT delete or rewrite project files, Desktop settings, credentials,
trust state, installed packages, or generated artifacts. Local build outputs at target paths MAY be
removed only after proving they are ignored and reproducible.

#### Scenario: Desktop opens a project after the rename

- **WHEN** a synthetic existing project and isolated user-data fixture are opened
- **THEN** the project and supported Desktop state remain available
- **AND** no old package alias participates in the runtime path
