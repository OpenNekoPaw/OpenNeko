## ADDED Requirements

### Requirement: OpenNeko-owned contracts are version-free

Every OpenNeko-owned contract shape, DTO shape, message shape, event shape, command shape, component state, codec shape, cache, and index SHALL have one canonical shape without a technical version discriminator, versioned name, versioned path, or semantic alias used to identify a data generation. Producers and consumers MUST change atomically and MUST delete superseded shapes and dispatch paths. User-managed domain versions are business identities carried by the canonical shape, not shape discriminators, and do not permit versioned contracts or migration dispatch.

#### Scenario: Internal contract changes

- **WHEN** an owning package changes an internal contract
- **THEN** all in-scope producers, consumers, fixtures, and tests use the single updated shape without a version field or compatibility handler

#### Scenario: Stale internal payload arrives

- **WHEN** a runtime payload or independently owned component record lacks required semantic fields or carries removed fields
- **THEN** the canonical decoder rejects that payload locally without attempting version negotiation, legacy conversion, or fallback routing
- **AND** opaque metadata retained by a persisted authority root is never used to select the decoder or business behavior

### Requirement: External version fields stay at the external boundary

A third-party service, library, API, protocol, model, standard file format, build tool, dependency, or release version SHALL remain when its external boundary requires or publicly exposes it. Every allowance MUST identify the external owner, normative requirement, exact source location, and isolation behavior. Provider-specific config/contracts MAY carry the external value, but it MUST NOT become an unrelated domain identity or internal shape discriminator.

#### Scenario: Provider requires a version header

- **WHEN** a provider adapter sends a request whose third-party API requires a version header or path
- **THEN** the adapter emits the required external value and returns an internal result that does not expose that API version

#### Scenario: Internal version is added beside an external adapter

- **WHEN** production code adds a version field that is not required by the recorded external contract
- **THEN** the repository quality gate fails even when the file also contains allowed third-party versions

### Requirement: User-managed business versions remain owner-scoped

An owning domain SHALL retain immutable version identity when users explicitly create, publish, select, pin, compare, restore, or delete versions of that object. Each retained occurrence MUST have an exact semantic owner, concrete user workflow, business requirement, field scope, and isolation rule. These versions MUST NOT authorize component schema versions, contract negotiation, migration dispatch, cache/runtime generations, or broad package exclusions.

#### Scenario: Character version is published

- **WHEN** Chara publishes an immutable character snapshot
- **THEN** the snapshot receives an exact Character version identity that runs and references can bind without mutating it
- **AND** no component or transport selects a codec or compatibility branch from that identity

#### Scenario: Managed Asset revision is installed

- **WHEN** Assets installs or publishes an immutable managed package revision
- **THEN** dependencies and bindings may reference that exact Asset revision and digest
- **AND** Resource Browser, Media Library, UI state, and IPC contracts remain unversioned

#### Scenario: Internal counter is called a document version

- **WHEN** a value exists only to identify a code shape, route old data, or provide an unused future concurrency hook
- **THEN** it is not a user-managed domain version and the repository quality gate rejects it

### Requirement: Repository checks prevent version debt

The repository SHALL run a quality gate that rejects meaningless internal version fields, versioned identifiers and paths, migration markers, compatibility dispatch, alternate success paths, and unapproved version-like aliases in both production and test source. The gate MUST use exact evidence-backed external, user-managed domain, and verified correctness allowances rather than directory-, filename-, or broad-keyword exclusions.

#### Scenario: Developer adds schemaVersion

- **WHEN** an OpenNeko-owned production contract adds `schemaVersion`
- **THEN** the quality gate reports the exact file and symbol and fails

#### Scenario: Required external field is present

- **WHEN** an allowlisted adapter contains only the exact third-party version occurrence covered by its evidence
- **THEN** the quality gate accepts that occurrence and continues checking the rest of the file

### Requirement: Replacement evidence does not become permanent legacy knowledge

Historical inputs, replaced-path spies, compatibility fixtures, fallback-success cases, and assertions named after a retired contract or implementation MAY be used only as temporary development evidence while a boundary is being replaced. They MUST be deleted before delivery together with the replaced implementation, registration, export, identifier, snapshot, and dedicated diagnostic. Ordinary unit, integration, Electron, and Evaluation suites SHALL retain only the current canonical contract, positive canonical-route assertions, generic invalid-current-input coverage, and unaffected-sibling coverage. They MUST NOT preserve a retired shape or path merely to prove that it is rejected or not called.

A centralized repository gate MAY contain the minimum synthetic samples required to test its own detection rules. Such samples MUST be isolated from product imports, builds, domain fixtures, ordinary tests, and runtime registration; they MUST NOT reproduce real historical payloads or maintain a catalog of retired implementations.

#### Scenario: Replacement is verified during development

- **WHEN** temporary evidence proves the canonical path succeeds and the replaced path no longer runs
- **THEN** the replacement may proceed only after the temporary historical fixture, spy target, and named assertion are deleted
- **AND** the durable suite positively verifies the one canonical route and generic local-failure containment without knowledge of the retired path

#### Scenario: A feature test preserves fallback success

- **WHEN** a production-package or ordinary feature test constructs a fallback provider, compatibility field, legacy payload, or retired handler and expects any behavior from it
- **THEN** the repository quality gate fails even if the production path is currently disabled or the test expects rejection

#### Scenario: The repository gate tests its detector

- **WHEN** a focused governance self-test supplies a minimal synthetic forbidden marker
- **THEN** the detector rejects that marker without importing product code, registering a runtime path, or recording a real retired payload

### Requirement: Concurrency does not use data-generation versions

Internal concurrency, ordering, cancellation, and instance replacement SHOULD use owner isolation, serialized operations, exact request identity, or a non-persisted live event sequence. A version/CAS token MAY remain only when an exact consumer, correctness invariant, version-free design analysis, scope, and removal condition are recorded. A token MUST NOT be retained for migration, compatibility, future use, or component shape validity.

#### Scenario: A newer asynchronous request supersedes an older request

- **WHEN** two requests overlap within one component instance
- **THEN** the owner cancels or ignores the older request by request identity without persisting or comparing a component generation

#### Scenario: Two instances mutate independently

- **WHEN** two editor or session instances operate concurrently
- **THEN** each owner serializes its own mutations and neither uses global active state or a shared version counter to retarget operations

### Requirement: Internal operations have one canonical success path

Each owning boundary SHALL expose one canonical contract, authoritative source, application service, exact handler registration, boundary adapter, and derived projection path for the same business intent. Version dispatch, migration or compatibility paths, dual-read/write, feature-flagged old implementations, first-compatible or try-next routing, provider/source fallback, automatic repair, implicit owner selection, and raw/cache/projection source switching MUST NOT provide alternate success paths. Ordinary domain decisions and explicit user selection MAY branch only while preserving the same canonical ownership and contract.

#### Scenario: A canonical dependency is missing

- **WHEN** an operation cannot resolve its exact handler, adapter, authoritative source, instance, or request identity
- **THEN** the smallest owning operation fails with a diagnostic
- **AND** it does not return empty success, create an implicit owner, select the active instance, or try another implementation

#### Scenario: A replacement path is accepted

- **WHEN** producer/consumer and runtime tests accept a changed internal operation
- **THEN** path evidence proves the unique canonical owner, contract, handler, adapter, authority, and projection were used
- **AND** import, export, and registration assertions prove replaced and test-only shortcut paths are absent

### Requirement: Adapters do not create internal alternatives

An adapter SHALL exist only at a real external, OS, Electron, or trust boundary and SHALL be limited to translation, authentication, authorization, and invocation. Third-party versions MAY remain inside the exact provider-specific adapter, but an adapter MUST NOT own business facts, migration or compatibility policy, internal shape dispatch, projection authority, or adapter-to-adapter fallback. A failure MUST reject only the current request and MUST NOT switch provider, source, contract, or internal implementation implicitly.

#### Scenario: A provider adapter fails

- **WHEN** an explicitly selected provider adapter rejects or cannot satisfy a request
- **THEN** the request receives the provider-bound diagnostic
- **AND** no alternate provider, legacy adapter, internal handler, or default success path runs

### Requirement: Projections and caches remain derived and transparent

A projection SHALL be a rebuildable read model derived from one authoritative source and SHALL NOT write back or become a second business authority. Stable domain, owner, instance, and request identities SHALL identify projection work; a source fingerprint MAY express freshness but MUST NOT act as a persistent identity, schema generation, or dispatch key. Cache hit or miss MUST NOT change contract, authority, identity, or result semantics. Reprojection from current authoritative data is canonical computation, but fallback to stale projection, raw path, cache path, legacy source, or empty success is forbidden.

#### Scenario: One projection entry is invalid

- **WHEN** one derived entry cannot be decoded or refreshed beside valid siblings
- **THEN** only that entry is rejected with an exact diagnostic and valid siblings remain available
- **AND** no stale projection, raw source, cache source, legacy source, or fabricated empty result replaces it
