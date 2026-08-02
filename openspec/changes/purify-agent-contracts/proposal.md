## Why

`@neko/agent-contracts` is declared as a pure L0 contract package, but it also owns domain projections,
plan derivation, review-artifact construction, and state transitions. Consumers therefore depend on a
package whose name and layer promise schemas/codecs while its implementation also changes business
behavior.

## What Changes

- Restrict `@neko/agent-contracts` to Agent-owned types, discriminated unions, codecs, validation,
  identity helpers, protocol constants, and side-effect-free wire construction.
- Move multi-step projection, planning, review-artifact assembly, and lifecycle transition logic to a
  host-neutral Agent domain package with an explicit public entry.
- Keep domain facts with their owning packages; the Agent domain may compose validated snapshots into
  Agent artifacts but cannot become a second Canvas, Generation, Chara, Entity, or Content authority.
- Update runtime and Webview consumers to import behavior from the Agent domain entry and contracts from
  `@neko/agent-contracts`; remove the replaced contract-package exports without compatibility re-exports.
- Add boundary and poison tests that reject business-operation exports from the contracts package and
  prove production consumers execute the new canonical path.

## Capabilities

### New Capabilities

- `agent-contract-domain-separation`: Layer, ownership, public-entry, dependency, and verification rules
  separating Agent wire contracts from host-neutral Agent domain behavior.

### Modified Capabilities

<!-- None. -->

## Impact

- Owning responsibility: `@neko/agent-contracts` remains L0 contract owner; a host-neutral
  `@neko/agent-domain` package owns Agent-specific pure behavior; `@neko/agent-runtime` owns session and
  host orchestration; domain packages remain authoritative for their facts.
- Affected package roles: `packages/agent/contracts`, new `packages/agent/domain`, Agent runtime/Webview
  consumers, package exports, workspace configuration, dependency rules, and focused producer/consumer
  tests.
- No persistent user-data schema is changed; serialized Agent artifacts must retain codec compatibility
  unless an owning contract is explicitly versioned in this change.
