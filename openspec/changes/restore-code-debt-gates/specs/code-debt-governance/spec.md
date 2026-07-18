## ADDED Requirements

### Requirement: Debt findings have one owning governance scope
The repository SHALL assign every blocking production debt finding to exactly one governance scope. Agent-owned paths SHALL be validated by the Agent debt register, while non-Agent paths SHALL be validated by the repository debt ledger.

#### Scenario: Agent rejection diagnostic is scanned
- **WHEN** an Agent source line contains a legacy rejection or compatibility term
- **THEN** the repository scanner reports the occurrence without adding it to the non-Agent blocking count
- **AND** the Agent boundary gate remains responsible for accepting or rejecting the surface

#### Scenario: Non-Agent legacy success path is scanned
- **WHEN** a non-Agent production path can still derive a successful result from a replaced field, handler, renderer, or command
- **THEN** the repository legacy gate classifies it as blocking migration debt

### Requirement: Legacy classification distinguishes migration from fallback success
The scanner SHALL distinguish explicit migration, rejection, diagnostic, presentation-default, and runtime-resilience boundaries from successful legacy runtime paths. Classification SHALL be based on owned paths and observable behavior rather than word presence alone.

#### Scenario: Explicit migration boundary
- **WHEN** a migration-only module reads old local data and writes or returns a canonical representation with visible diagnostics
- **THEN** the scanner classifies it as a boundary canonicalizer or current bridge

#### Scenario: Forbidden fallback diagnostic
- **WHEN** production text states that a legacy fallback is rejected, forbidden, or intentionally absent
- **THEN** the scanner does not classify that text as a successful migration path

#### Scenario: Successful dual read
- **WHEN** canonical data is absent and production code reads replaced fields to return a normal successful result
- **THEN** the scanner keeps the path in a blocking migration class until the old read is removed

### Requirement: Removed-surface checks are exact
Ledger stale checks SHALL target exact deleted paths, import specifiers, or identifiers and SHALL NOT fail on current identifiers that merely contain the same substring.

#### Scenario: Current overlay name contains removed component name
- **WHEN** `ImageViewerOverlay` remains after a removed `ImageViewer` component is deleted
- **THEN** the removed-surface check does not report `ImageViewerOverlay` as a stale `ImageViewer` reference

### Requirement: Dead-code gates cover retained production sources
Production TypeScript files SHALL be analyzed by Knip unless they are runtime-discovered entries with a documented loader or a narrowly recorded exception. Planned but unreachable feature implementations SHALL NOT be hidden by directory-wide ignores.

#### Scenario: Dormant Webview subsystem has no entry
- **WHEN** a Webview subsystem has no import, manifest entry, dynamic registration, or active OpenSpec owner
- **THEN** the subsystem is deleted or reported by the unused-code gate

#### Scenario: Retained active component is indirectly imported
- **WHEN** a component is reachable through an active package component such as the current Property Panel
- **THEN** Knip configuration models the real entry instead of deleting or blanket-ignoring the active component tree

### Requirement: Retained compatibility bridges are removable
Every retained compatibility or migration bridge SHALL record an owner, canonical replacement, focused validation, and a concrete removal condition. Retained bridges SHALL NOT mask canonical-path failure.

#### Scenario: User-data migration remains active
- **WHEN** an explicit command protects indexed generated output or migrates valuable local metadata
- **THEN** the bridge remains available with visible diagnostics and recorded removal criteria
- **AND** normal canonical requests do not route through it
