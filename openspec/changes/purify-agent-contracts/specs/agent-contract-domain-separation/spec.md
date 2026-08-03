## ADDED Requirements

### Requirement: Agent Contracts owns schemas and codecs only

`@neko/agent-contracts` SHALL contain only Agent-owned types, constants, identities, protocol messages,
codecs, structural validation, diagnostics, type guards, and direct wire constructors. It MUST NOT own
domain planning, policy decisions, multi-input derivation, lifecycle transitions, review/presentation
assembly, orchestration, persistence, or mutable runtime state.

#### Scenario: Contract export inventory runs

- **WHEN** the repository audits `@neko/agent-contracts` public exports
- **THEN** every export is classified as an allowed schema/codec responsibility
- **AND** any business behavior export fails the boundary gate

### Requirement: Agent Domain owns host-neutral Agent behavior

`@neko/agent-domain` SHALL own deterministic Agent-specific policy and transformations over validated
domain snapshots that are shared by runtime and Webview consumers. It MUST NOT import Node, Electron,
React, DOM, Pi runtime, storage adapters, or application modules.

#### Scenario: Runtime and Webview use the same projection

- **WHEN** both consumers require an Agent review artifact derived from validated inputs
- **THEN** they import the deterministic behavior from `@neko/agent-domain`
- **AND** neither consumer maintains a parallel implementation

### Requirement: Owning domains retain authoritative facts and mutation

Agent Domain SHALL consume immutable public domain snapshots and produce Agent-owned plans or review
artifacts. Canvas, Generation, Chara, Entity, Content, Search, and Media facts and mutations MUST remain
with their owning package operations.

#### Scenario: Agent plan requests a domain mutation

- **WHEN** a derived Agent plan is accepted for execution
- **THEN** the runtime invokes the owning domain operation through its public contract or Host port
- **AND** Agent Domain does not directly persist or mutate the domain fact

### Requirement: Moved behavior has one canonical public path

Moved Agent behavior SHALL have one canonical public path. Shot-image preparation
derivation/transitions/recommendations and comic-animation projection/review-building behavior are
exported only from `@neko/agent-domain`. Compatibility re-exports, aliases, or fallback implementations
in `@neko/agent-contracts` MUST NOT remain.

#### Scenario: Old contract behavior path is poisoned

- **WHEN** tests configure every former Agent Contracts behavior export/import to fail
- **THEN** runtime and Webview producer/consumer scenarios still pass through Agent Domain
- **AND** repository search finds no normal consumer of the replaced path

### Requirement: Contract serialization remains compatible during extraction

Moving behavior SHALL preserve current serialized Agent contract versions and codec results. Any needed
wire/artifact schema change MUST be explicitly versioned and migrated rather than hidden in the package
move.

#### Scenario: Existing artifact fixture is validated after extraction

- **WHEN** the current versioned fixture is parsed and re-serialized through Agent Contracts
- **THEN** its contract result is unchanged
- **AND** Agent Domain behavior consumes the validated value without redefining the codec
