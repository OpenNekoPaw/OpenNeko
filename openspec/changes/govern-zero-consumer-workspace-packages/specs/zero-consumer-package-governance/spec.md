## ADDED Requirements

### Requirement: Consumer inventory covers executable and resource edges

Repository governance SHALL inventory each workspace's manifest, static import, dynamic/runtime
loader, resource/catalog, root script/tooling, and test-only consumers. Self-tests and root build
participation MUST NOT count as Desktop product integration.

#### Scenario: A package has no manifest dependents

- **WHEN** the consumer inventory evaluates that package
- **THEN** it separately reports all non-manifest and test-only evidence
- **AND** it does not classify the package as unused or integrated from manifest count alone

### Requirement: Every zero-consumer package has one evidence-backed disposition

Each current zero-consumer package SHALL have exactly one disposition of `integrated`,
`unintegrated-kernel`, `resource-or-tooling-owner`, `merge`, or `delete`, plus an owner, evidence,
acceptance or review path, and target change where implementation is non-trivial.

#### Scenario: The current workspace is audited

- **WHEN** governance evaluates Agent test-utils, Chara, Quality, Search, Skills, and the Tools
  contract/Webview island
- **THEN** each has a complete and current disposition record
- **AND** an unknown, ownerless, or evidence-free record fails validation

### Requirement: Retained unintegrated capability is not presented as shipped

A retained `unintegrated-kernel` SHALL be labeled in package and product capability documentation as
not connected to a Desktop canonical path. Package presence, unit tests, or root build success MUST
NOT be used as evidence of product delivery.

#### Scenario: Desktop capability documentation is generated or reviewed

- **WHEN** a retained unintegrated package appears in the repository
- **THEN** the documentation identifies its owner and unintegrated status
- **AND** no Desktop catalog or acceptance claim lists it as available without a real runtime path

### Requirement: Integration, merge, and deletion use package-specific acceptance

A non-trivial integration or ownership migration MUST have its own implementation OpenSpec and
Desktop/runtime acceptance. A merge or deletion MUST prove no valuable local data, external
contract, dynamic consumer, or packaged resource depends on the removed owner.

#### Scenario: A deletion disposition is applied

- **WHEN** the package is removed
- **THEN** dependency, dynamic/resource loading, data-format, build/test, and packaging checks prove
  no retained path relies on it
- **AND** stale imports or loaders fail rather than falling back

### Requirement: Governance fails on unexplained drift

Repository checks SHALL fail when a newly zero-consumer package lacks a disposition or when a
recorded consumer/disposition no longer matches current evidence. Intentional kernels and resource
owners MAY pass only with a current owner, rationale, and review condition.

#### Scenario: A consumer is removed from a retained package

- **WHEN** the governance check detects that the recorded evidence is stale
- **THEN** it fails with the affected package and missing disposition evidence
- **AND** it does not silently preserve the old integrated classification
