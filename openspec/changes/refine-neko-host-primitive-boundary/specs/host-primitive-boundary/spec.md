## ADDED Requirements

### Requirement: Host exports satisfy positive admission criteria

An `@neko/host` export SHALL be product/domain neutral, free of concrete I/O and mutable lifecycle,
and limited to a minimal host capability port, value, diagnostic, or immutable projection. It MUST
have at least two real consumers or a documented Main/preload/renderer or host security boundary.

#### Scenario: A Host export is added or retained

- **WHEN** architecture review evaluates the export
- **THEN** its owner, consumers, neutrality, runtime layer, lifecycle, and boundary evidence satisfy
  the admission rule
- **AND** missing evidence rejects the export

### Requirement: Product and implementation concerns are excluded from Host

`@neko/host` MUST NOT own application IDs, product storage migration taxonomies, product/domain
command catalogs or payloads, mutable registries/managers, concrete filesystem/Electron adapters,
React components, or ownerless domain DTOs.

#### Scenario: An excluded concern is introduced

- **WHEN** Host export and dependency guards scan the package
- **THEN** the application/product/implementation concern fails validation
- **AND** no broad root re-export hides its presence

### Requirement: Existing non-primitive exports move to canonical owners

Desktop application identity, handoff, and storage migration contracts SHALL move to a Desktop-owned
L0 contract; product commands SHALL move to their domain/application owners; mutable registry
implementations SHALL move to the Desktop composition root or owning runtime. Workspace/projection
helpers SHALL be retained only when each export independently satisfies Host admission.

#### Scenario: Current Host inventory is approved

- **WHEN** implementation begins
- **THEN** every current export has one retain, move, merge, or remove disposition and target owner
- **AND** an unmapped or multiply owned export blocks migration

### Requirement: Host consumers request narrow capabilities

Consumers SHALL import precise Host subpaths and accept the smallest port set required by their
operation. Concrete implementations SHALL be constructed and disposed by Desktop Main or the owning
runtime; active-instance fallback and shared mutable registry state are forbidden.

#### Scenario: Desktop composes a Host-backed capability

- **WHEN** the capability is constructed
- **THEN** it receives explicit narrow ports and instance identity
- **AND** its concrete resources are owned and released by Desktop Main

### Requirement: Removed Host paths cannot return compatibility success

After migration, excluded exports MUST NOT remain through the Host root barrel, aliases, fallback
registries, command forwarding, or dual contracts. Producer/consumer tests and architecture guards
MUST prove the canonical owner is used.

#### Scenario: A stale application or command import is referenced

- **WHEN** a test or repository scan imports it from `@neko/host`
- **THEN** the path fails visibly
- **AND** only the Desktop/domain-owned contract can serve the request
