## ADDED Requirements

### Requirement: Package roles have normative runtime and ownership semantics

The repository SHALL classify package public entries as contracts, domain/core,
application/runtime, Node adapter, Webview, testing, or content-only resources. A public entry MUST
contain only responsibilities permitted by its role and MUST preserve the dependency direction from
Webview and adapters toward package-owned contracts and domain/application ports.

#### Scenario: Cross-runtime contract entry is introduced

- **WHEN** Main, preload, renderer, or another package needs a shared wire contract
- **THEN** the contract entry contains serialization-safe DTOs, codecs, parsers, validators, and
  error codes without Node, React, mutable runtime state, UI formatting, or domain policy selection

#### Scenario: Browser presentation is implemented

- **WHEN** a package renders React/DOM UI or maintains renderer presentation state
- **THEN** the implementation is owned by a Webview/browser entry that imports no Node or Electron
  module and invokes business behavior only through typed public ports

#### Scenario: Native runtime behavior is implemented

- **WHEN** an implementation requires Node, FFmpeg, SQLite, filesystem, or external process APIs
- **THEN** it is exposed through a Node runtime entry or package whose dependency closure cannot be
  inherited by domain or Webview consumers

### Requirement: Workspace package splitting requires a real boundary

The repository SHALL create an independent workspace package only when runtime environment,
dependency closure, public consumer set, lifecycle, build, or release boundary differs materially.
Responsibilities with the same owner and dependency closure MUST use curated subpath entries instead
of mechanically creating contracts, domain, runtime, Node, Webview, and testing packages.

#### Scenario: Domain and application code share one dependency closure

- **WHEN** pure domain rules and host-neutral application services have the same owner, consumers,
  dependencies, and lifecycle
- **THEN** they remain one workspace package with explicit `./core` and `./application` entries

#### Scenario: Domain and Webview dependencies differ

- **WHEN** the Webview requires React/DOM while the domain is browser- and framework-neutral
- **THEN** they use separate dependency closures and the Webview depends on the domain or contracts,
  never the reverse

#### Scenario: Testing helpers have no external consumers

- **WHEN** a testing package has fewer than two real external package consumers
- **THEN** its helpers are moved to the owning package testing entry or removed instead of retaining
  an independent workspace package

### Requirement: Shared and Platform aggregators converge to explicit owners

The repository SHALL reduce `@neko/shared` to minimal stable cross-domain foundations and SHALL
remove `@neko/platform` after its responsibilities move to explicit owners. Feature contracts,
React components, Node-specific implementations, provider/model behavior, configuration policy,
and generated-output lifecycle MUST NOT remain in either catch-all layer.

#### Scenario: Feature-specific contract exists in Shared

- **WHEN** a Shared contract describes Agent, Canvas, Assets, Generation, Character, Preview, Tools,
  or another owning domain
- **THEN** the contract and its authoritative tests move to that domain's public contract or domain
  entry and the former Shared export is deleted or poisoned

#### Scenario: Platform responsibility is migrated

- **WHEN** Agent configuration, provider integration, Generation output lifecycle, or file/content
  behavior gains its target owner
- **THEN** all in-scope consumers switch directly to the owner and no Platform facade, compatibility
  re-export, dual implementation, or fallback remains successful

#### Scenario: Shared React compatibility surface is retired

- **WHEN** the remaining consumers of `@neko/shared/components` have moved to `@neko/ui`
- **THEN** the React component implementation, peer dependency, and legacy Shared export are removed

### Requirement: Domain families use consistent identities and explicit public entries

The repository SHALL use `@neko/*` for shared infrastructure and `@neko-<domain>/*` for domain
families with multiple runtime packages. Package names, directories, manifests, documentation, and
quality ownership MUST agree. Every package SHALL expose a curated `exports` map and production
consumers MUST NOT import another package's unexported `src/*` files.

#### Scenario: Existing package identity is inconsistent

- **WHEN** a package such as Cut Webview, Preview Webview, Agent runtime, Assets, or Shared has a name
  or directory that does not identify its actual family and role
- **THEN** the bounded migration updates every caller, manifest, script, config, document, ownership
  record, and lockfile in one canonical switch without a compatibility alias

#### Scenario: Consumer uses a public package entry in Vite or Vitest

- **WHEN** workspace source is aliased for local bundling or testing
- **THEN** the alias key corresponds to a declared package export and does not expose an otherwise
  private internal file path to consumers

#### Scenario: Wildcard export exposes package internals

- **WHEN** a package currently exports `./*`
- **THEN** its real consumers are inventoried, explicit stable entries are declared, and the wildcard
  is removed after all callers switch

### Requirement: Domain family completeness follows real product paths

The repository SHALL complete package-owned domain/application/adapter paths for currently composed
Desktop capabilities and SHALL identify packages without a Desktop consumer as retained kernels or
inactive prototypes. Package presence alone MUST NOT be reported as product capability.

#### Scenario: Assets business and presentation share one package

- **WHEN** Assets Main consumers and React consumers depend on the same mixed package
- **THEN** domain/application, Node adapter, and Webview responsibilities are separated and Desktop
  composes their public entries without owning Assets business policy

#### Scenario: Preview or Tools lacks a package-owned runtime path

- **WHEN** a Webview/contract exists but business execution remains in Desktop or has no real producer
- **THEN** the owning domain/application and required Node adapter are established before the feature
  is considered an integrated Desktop capability

#### Scenario: Retained domain has no Desktop consumer

- **WHEN** Chara, Search, Quality, Tools, or another package has no production Desktop consumer
- **THEN** documentation and capability catalogs mark it retained or inactive, and no empty Node or
  Webview package is created solely for symmetry

### Requirement: Package boundary gates discover the entire workspace

The repository SHALL derive dependency, cycle, Webview, strict TypeScript, package export, manifest
dependency, and unused-code check targets from workspace manifests or an explicit validated role
catalog. Adding or renaming a package MUST automatically place it under the applicable gates.

#### Scenario: New workspace package is added

- **WHEN** a new first-level package appears in `pnpm-workspace.yaml` discovery
- **THEN** dependency-cruiser, strict compiler checks, export validation, manifest validation, and the
  applicable Node/Webview boundary checks include it without editing a hand-maintained source-root
  command

#### Scenario: Package migration is reported complete

- **WHEN** a responsibility moves between Desktop, Shared, Platform, or a domain family
- **THEN** producer and consumer tests, full dependency checks, explicit path assertions, and legacy
  path poison prove the target owner is canonical and the former path did not participate
