# package-product-status-reachability Specification

## Purpose
TBD - created by archiving change align-package-product-status. Update Purpose after archive.
## Requirements
### Requirement: Active package status follows production reachability

Production-reachable packages SHALL be declared `active-product`. Reachability follows production
value imports from a supported application composition entry. A `retained-kernel` or
`inactive-prototype` package MUST NOT be reachable from a normal supported production path.

#### Scenario: Retained package is imported at runtime

- **WHEN** the quality gate finds a value-import path from Desktop production entry to a package declared
  retained-kernel
- **THEN** the gate fails with the shortest owning import path
- **AND** the package must be marked `active-product` or the production path removed

### Requirement: Non-runtime references do not activate packages

Non-runtime references SHALL NOT activate packages. These references include type-only imports, tests,
fixtures, examples, scripts, documentation, development tools, and explicitly migration-only readers.

#### Scenario: Package is used only for TypeScript types

- **WHEN** every production reference to a retained package is erased as a type-only import
- **THEN** the reachability gate does not classify that reference as runtime activity

### Requirement: Package status and capability availability are separate

Package product status SHALL describe whether code ships on a supported runtime path. Capability state
SHALL separately describe whether a user operation is exposed, dormant, experimental, or retired. A
dormant capability MUST NOT make an otherwise runtime-reachable package retained.

#### Scenario: Active validators support a dormant feature family

- **WHEN** production consumers execute a package's validators but no user route exposes the package's
  execution capability
- **THEN** the package is `active-product`
- **AND** the capability catalog continues to report the execution capability as unavailable or dormant

### Requirement: Reachability exceptions are explicit and expiring

Any runtime edge not statically resolvable SHALL have an owner-scoped declaration containing edge kind,
reason, owner, validation path, and removal or review condition. Generic package allowlists MUST NOT
silence status mismatches.

#### Scenario: Registry loads a non-literal workspace module

- **WHEN** a supported runtime registry cannot be resolved from a literal import
- **THEN** the quality configuration declares and tests the exact package edge
- **AND** the diagnostic identifies the declaration as computed rather than source-derived evidence

### Requirement: Current Chara, Entity Node and Search roles match runtime use

`@neko/chara-domain`, `@neko/entity-node` and `@neko/search-domain` SHALL be `active-product` while the supported
production imports identified by this change remain. Capability exposure SHALL remain governed
independently by the Desktop capability catalog.

#### Scenario: Current repository graph is audited

- **WHEN** package product status validation runs on the supported Desktop graph
- **THEN** the computed Chara, Entity Node and Search paths pass as `active-product` dependencies
- **AND** no UI or operation is inferred from package status alone
