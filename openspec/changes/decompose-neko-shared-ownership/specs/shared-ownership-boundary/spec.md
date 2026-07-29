# Shared Ownership Boundary

## ADDED Requirements

### Requirement: Every shared export has one classified owner

Before physical migration begins, OpenNeko MUST maintain a machine-verifiable
inventory of every `@neko/shared` package export, root-barrel symbol,
wildcard/deep import and production consumer. Every item MUST identify one
runtime layer, canonical owner/public entry, migration batch, durable-data
impact, cycle disposition and verification path. Unknown or multi-owner items
MUST block migration.

#### Scenario: A new shared export appears

- **WHEN** source or package exports contain a symbol/path absent from the
  inventory
- **THEN** the architecture gate SHALL fail with the unclassified identity
- **AND** it SHALL NOT assign a default shared owner

### Requirement: Shared retains only stable host-neutral primitives

The final `@neko/shared` root SHALL export only audited cross-domain L0
primitives such as core async/concurrency, logger/error/path contracts, i18n
core and similarly stable zero-host utilities. It MUST NOT own or re-export
React/UI, VS Code/Electron/Node implementations, SQLite/local metadata,
project IO/authoring, product-domain DTO or owning-package implementation.

#### Scenario: Inspect the final shared dependency graph

- **WHEN** architecture checks scan the shared root and public entries
- **THEN** no React, DOM, VS Code, Electron, Node implementation or product
  domain import SHALL be reachable
- **AND** shared SHALL NOT re-export a domain package to preserve an old path

### Requirement: Domain and runtime-specific surfaces move to real owners

Agent, Canvas, Media, Entity, Content, Chara and Quality contracts MUST be
owned by their semantic package; UI surfaces MUST be owned by `@neko/ui`; VS
Code adapters MUST be owned by `apps/neko-vscode`; LocalMetadata and Project
infrastructure MUST use explicit owners and runtime entries. `@neko/host` MUST
NOT become a replacement universal shared bag.

#### Scenario: A Host needs a domain operation

- **WHEN** VS Code, Desktop or TUI implements a domain-required operation
- **THEN** the consumer domain SHALL define a narrow host-neutral port
- **AND** the App SHALL implement the adapter without moving the domain
  operation into `@neko/host`

### Requirement: Migration batches have one canonical path

Each migration batch MUST define the target entry before implementation,
migrate all in-repository producers and consumers, and delete the old shared
export in the same batch. Compatibility re-exports, alias packages, dual
read/write, fallback imports and successful old paths MUST NOT remain.

#### Scenario: A migrated import uses the old shared path

- **WHEN** a caller or test resolves the retired shared export
- **THEN** compilation or an explicit poison assertion SHALL fail
- **AND** no compatibility path SHALL return the canonical result

### Requirement: Runtime layers remain mechanically isolated

L0 entries MUST NOT import VS Code, Electron, Node implementations, React or
DOM. Browser/UI entries MAY depend on React/DOM and L0 but MUST NOT import VS
Code/Node. Node implementations MUST use explicit `/node` entries. VS Code
adapters MUST remain inside the VS Code App and MUST NOT be imported by
Webviews, Desktop or TUI.

#### Scenario: Build all runtime consumers

- **WHEN** Extension Host, Webview, Desktop and TUI entries are built
- **THEN** each entry SHALL resolve only dependencies allowed by its runtime
  layer
- **AND** a Node/VS Code implementation SHALL NOT enter a browser bundle

### Requirement: Durable user data is preserved

Moving TypeScript ownership MUST preserve existing workspace project files,
SQLite data, namespaces, settings, secrets, credentials and cache identities
unless the owning batch defines a versioned idempotent migration. Migration
markers MUST commit last; malformed, conflicting or interrupted migrations
MUST preserve source data and fail visibly.

#### Scenario: A stateful owner migration is interrupted

- **WHEN** a LocalMetadata or Project migration fails before validation and
  marker commit
- **THEN** the original data and identity SHALL remain intact
- **AND** a retry SHALL use the same canonical migration without default-empty
  or successful no-op fallback

### Requirement: The wildcard public surface is removed

The final `@neko/shared` package MUST remove the `"./*"` export and reject
undocumented deep imports. Every retained public entry MUST be explicit and
covered by inventory and boundary tests.

#### Scenario: A caller imports an undocumented shared subpath

- **WHEN** the caller builds after the final closure batch
- **THEN** package resolution SHALL reject the subpath
- **AND** the caller SHALL migrate to the explicit owning entry rather than a
  new wildcard alias
