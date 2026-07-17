## ADDED Requirements

### Requirement: Canonical product brand

All current first-party user-visible and maintainer-facing product references SHALL use `OpenNeko` as the top-level product name instead of `Neko Suite`.

#### Scenario: Top-level project presentation

- **WHEN** a user opens a current project entry document or installable product manifest
- **THEN** the top-level product is presented as `OpenNeko`

### Requirement: Canonical client product family

Current first-party client and assistant labels SHALL use `OpenNeko Home`, `OpenNeko TUI`, `OpenNeko for VSCode`, and `OpenNeko AI` or `OpenNeko AI Assistant` as applicable.

#### Scenario: Client label presentation

- **WHEN** a client name appears in current documentation, UI copy, a diagnostic, or package metadata
- **THEN** the label uses the corresponding `OpenNeko` product-family name

### Requirement: Stable technical identities

The branding change SHALL name the private root workspace aggregator `openneko-monorepo` and SHALL preserve existing published/workspace package names and scopes, workspace paths, binary names, VS Code publisher and extension IDs, commands, settings, file formats, Rust crate names, protocol fields, and exported API identifiers.

#### Scenario: Existing extension installation identity

- **WHEN** the OpenNeko for VSCode extension-pack manifest is packaged after the rename
- **THEN** its user-visible name is `OpenNeko` and its existing `neko.neko-suite` installation identity is unchanged

#### Scenario: Private root workspace identity

- **WHEN** a maintainer inspects the private root package manifest
- **THEN** its name is `openneko-monorepo`

#### Scenario: Existing package consumer

- **WHEN** a workspace package resolves an `@neko/*` dependency after the rename
- **THEN** the package specifier remains valid without an alias or compatibility adapter

### Requirement: Brand regression gate

The repository SHALL provide an automated quality check that fails when retired product-family phrases are introduced into current first-party text surfaces and SHALL permit documented historical, generated, external, or stable-identifier occurrences.

#### Scenario: Retired label introduced

- **WHEN** a current first-party source or documentation file contains a retired product-family phrase
- **THEN** the brand check fails with the file, line, and canonical replacement

#### Scenario: Stable technical identifier retained

- **WHEN** a current source file contains a protected technical identity such as `@neko/shared`, `neko.neko-suite`, or an existing `NekoSuite*` exported symbol
- **THEN** the brand check does not report it as a branding violation

#### Scenario: Archived historical artifact

- **WHEN** an archived OpenSpec artifact contains the product name that was current when it was authored
- **THEN** the brand check excludes that artifact from current-brand enforcement
