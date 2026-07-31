## ADDED Requirements

### Requirement: Shared exports satisfy explicit admission criteria

An export SHALL remain in `@neko/shared` only when it is host-neutral, low dependency, semantically
stable across at least two independent domains, and has no clearer bounded-context owner. Domain
DTOs, React components/icons, concrete host or Node I/O, metadata persistence, and project-file I/O
MUST NOT remain solely because they have multiple imports.

#### Scenario: A new Shared export is reviewed

- **WHEN** a change adds or retains an `@neko/shared` public export
- **THEN** repository evidence identifies its layer, semantics, consumers, and lack of a narrower owner
- **AND** an export that fails any admission criterion is rejected

### Requirement: Every current Shared export has a migration disposition

The change SHALL inventory every root/subpath export and consumer-reachable barrel symbol with its
semantic owner, L0/L1/L2 layer, runtime dependencies, consumers, target public entry, data impact,
and disposition.

#### Scenario: Shared decomposition starts

- **WHEN** the implementation inventory is validated
- **THEN** all current exports have one retained, moved, merged, or removed disposition
- **AND** unknown or multiply owned exports block implementation

### Requirement: Layer and dependency direction remain enforceable

Domain contracts SHALL move to package-owned L0 entries, reusable React primitives SHALL move to
`@neko/ui`, and Node/host behavior SHALL move to an owning L1 entry or justified adapter. Renderer and
Webview packages MUST NOT resolve Node/Electron code through `@neko/shared`.

#### Scenario: A browser package builds after migration

- **WHEN** affected Renderer and Webview packages typecheck and build
- **THEN** their dependency graph contains only permitted L0/L2 entries
- **AND** architecture guards reject Node, Electron, or Desktop application imports

### Requirement: Removed Shared paths cannot provide compatibility success

Migrated consumers SHALL import target package public entries directly. Removed Shared exports MUST
be deleted or poisoned and MUST NOT remain through barrels, aliases, conditional exports, fallback
adapters, or dual implementations.

#### Scenario: A stale Shared import is exercised

- **WHEN** tests or repository guards reference a removed Shared export
- **THEN** resolution or validation fails visibly
- **AND** the canonical owner is the only successful execution path

### Requirement: Shared decomposition preserves valuable local data

The migration SHALL assign an explicit reuse, migration, rebuild, or reject-with-diagnostic
disposition to project files, local metadata, settings, trust state, and other valuable persisted
data affected by an ownership move. API cleanup MUST NOT silently delete or reset those data.

#### Scenario: A persisted fixture crosses an ownership migration

- **WHEN** the new owner reads a supported pre-migration fixture
- **THEN** it preserves or explicitly migrates the authoritative data
- **AND** unknown schema fails with a typed diagnostic rather than an empty/default success
