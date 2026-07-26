## ADDED Requirements

### Requirement: Generation is owned by a first-level domain package

The system SHALL expose generation request/result/capability and recoverable GenerationJob contracts
from `@neko/generation`, a first-level package independent of Agent, Platform, VS Code and Webview.
`@neko/platform` MUST NOT define or re-export GenerationJob contracts, coordinators, stores or migrations.

#### Scenario: Agent and direct mode consume Generation

- **WHEN** Agent Tool and TUI direct mode invoke generation
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

#### Scenario: VS Code and TUI use the same configuration

- **WHEN** VS Code and TUI construct Generation runtimes for the same user/workspace configuration
- **THEN** both use the canonical shared Host config parsing and merge rules
- **AND** Generation creates no domain-local config file or second ConfigManager

### Requirement: Package extraction does not create another Host

The Generation package SHALL remain host-neutral and MUST NOT introduce a new process, VS Code extension
identity or global singleton. Existing product Hosts SHALL own coordinator construction, instance identity
and disposal.

#### Scenario: Multiple domain runtimes run in VS Code

- **WHEN** Agent, Generation and Quality are active
- **THEN** they are composed inside the existing VS Code Extension Host
- **AND** each retains independent instance-scoped mutable state without another Host process

### Requirement: Persisted Generation Jobs survive package relocation

The package migration SHALL preserve the `generation` Job kind, domain-owned SQLite schema and strict
snapshot codec. Existing valid local Generation snapshots MUST remain recoverable, while invalid or
secret-bearing snapshots fail visibly.

#### Scenario: Host starts after package migration

- **WHEN** the new Generation coordinator scans a valid persisted snapshot created before relocation
- **THEN** it recovers using the unchanged domain identity and schema
- **AND** no legacy Platform coordinator or dual-read path participates
