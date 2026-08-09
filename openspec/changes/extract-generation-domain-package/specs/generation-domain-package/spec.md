## ADDED Requirements

### Requirement: Generation is owned by a first-level domain package

The system SHALL expose generation request/result/capability and recoverable GenerationJob contracts
from `@neko/generation`, a first-level package independent of Agent, Platform, Electron and React.
`@neko/platform` MUST NOT define or re-export GenerationJob contracts, coordinators, stores or migrations.

#### Scenario: Desktop Agent and Canvas consume Generation

- **WHEN** a Desktop Agent Tool or Canvas action invokes generation
- **THEN** both depend on the same `@neko/generation` public contract
- **AND** neither imports a Platform-local Job implementation

#### Scenario: Platform compatibility export is requested

- **WHEN** a caller imports GenerationJob from `@neko/platform`
- **THEN** architecture validation fails
- **AND** no re-export or fallback returns a successful Job path

### Requirement: Generation Job depends on a narrow execution port

The Generation coordinator SHALL depend on `GenerationExecutionPort` for typed generation execution and
exact external-task observation/cancellation. The port MUST NOT expose ConfigManager, provider registry,
Tool registration, file IO, artifact delivery or generic domain dispatch.

#### Scenario: Existing provider runtime executes a Job

- **WHEN** a Host injects its current provider runtime into `GenerationJobCoordinator`
- **THEN** the runtime satisfies the Generation execution port
- **AND** the coordinator has no dependency on the Platform concrete class

### Requirement: Configuration is read once by the Host

Generation SHALL NOT read user/workspace configuration files, resolve credentials, own configuration
watchers or mutate model bindings. Host composition SHALL provide effective runtime dependencies while
credentials remain outside Job snapshots and Webview projections.

#### Scenario: Desktop consumers use one configuration projection

- **WHEN** Desktop Main constructs Generation runtimes for Agent and Canvas in the same user/workspace
- **THEN** both use the canonical Host config parsing and immutable projection rules
- **AND** Generation creates no domain-local config file or second ConfigManager

### Requirement: One exact Workspace has one application Generation owner

The Generation application runtime SHALL map each exact Workspace identity and authorized root to one
shared GenerationJob owner within the Desktop application lifecycle, including concurrent first access,
and SHALL NOT select an owner by active, current, recent, first, wildcard or failed-owner fallback.

#### Scenario: Canvas and Agent use the same Workspace

- **WHEN** Canvas and an Agent Tool request Generation for the same exact Workspace
- **THEN** both receive the same GenerationJob port owned by one Workspace coordinator
- **AND** neither consumer owns coordinator disposal or a second Job store

#### Scenario: One Workspace owner fails to initialize

- **WHEN** one Workspace cannot create its Generation execution or persistence owner
- **THEN** only that Workspace request fails with an explicit diagnostic
- **AND** an already available sibling Workspace owner remains usable

#### Scenario: Workspace identity is reused with another root

- **WHEN** a caller requests an existing Workspace identity with a different authorized root
- **THEN** the runtime rejects the request and does not replace, alias or create another owner

### Requirement: Direct and Agent generation share the canonical Job path

Explicit direct image, video and audio operations and Agent generation Tool calls SHALL submit through
the same exact Workspace Generation application runtime and purpose-qualified model binding.

#### Scenario: Direct generation is submitted

- **WHEN** a user submits an explicit media operation from a direct generation control
- **THEN** Generation creates one detached canonical GenerationJob without creating a Conversation,
  Agent Turn, Pi Session or Tool Call

#### Scenario: Agent generation Tool is submitted

- **WHEN** an Agent Turn invokes an approved generation Tool
- **THEN** the Tool submits through the same Workspace GenerationJob port with its immutable Turn purpose
  binding and projects the exact Job and artifact identities into that Conversation

#### Scenario: Either entry path fails

- **WHEN** the direct operation or Agent Tool cannot validate its exact model or Job request
- **THEN** that operation fails visibly in its own UI/Tool boundary
- **AND** it does not retry through the other entry path, another provider or another Workspace owner

### Requirement: Package extraction does not create another Host

The Generation package SHALL remain host-neutral and MUST NOT introduce a new process, application
identity or global singleton. Existing product Hosts SHALL own coordinator construction, instance identity
and disposal.

#### Scenario: Multiple domain runtimes run in Electron Desktop

- **WHEN** Agent, Generation and Quality are active
- **THEN** they are composed inside the existing Electron Main application boundary
- **AND** each retains independent instance-scoped mutable state without another Host process

### Requirement: Persisted Generation Jobs survive package relocation

The package migration SHALL preserve the `generation` Job kind, domain-owned SQLite schema and strict
snapshot codec. Existing valid local Generation snapshots MUST remain recoverable, while invalid or
secret-bearing snapshots fail visibly.

#### Scenario: Host starts after package migration

- **WHEN** the new Generation coordinator scans a valid persisted snapshot created before relocation
- **THEN** it recovers using the unchanged domain identity and schema
- **AND** no legacy Platform coordinator or dual-read path participates
