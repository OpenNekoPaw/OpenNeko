## Why

`@neko/agent-runtime` and `@neko/agent-contracts` still re-export several pre-Pi subsystems that have
no production consumer. They are "exported but never wired": the ProviderCard/ProviderRouter scoring and
fallback routing, a second approval strategy-pack engine, a Claude-Code-style permission rule engine,
the validation/perception pipelines, external processor/research runtime providers, and the profile
registries. The ProviderRouter fallback chain in particular violates the accepted
`adr-pi-agent-runtime.md` rule against execution-time provider fallback. These modules were left behind
when Pi became the single Agent/LLM/Skill/Session canonical path, and they now only inflate the public
surface, defeat unused-code checks (they are reachable through `export *` chains), and mislead consumers
about which capability is canonical.

## What Changes

- Delete the zero-consumer Agent public surface and their fixtures/tests, exports, and package subpaths.
  No capability is moved to another package; dead code is deleted.
- Keep the real canonical paths: Pi conversation authority, `PiToolConfirmationRegistry` (approval),
  `schema-validator` (tool validation), `tools/perception/*` (image understanding), MCP runtime
  (including external-research tool creation options), and the live contract types still consumed by
  `composite-artifact.ts`, `agent-capability.ts`, and Host config.
- Keep `contracts/provider-card.ts`, `contracts/agent-profile.ts`, `contracts/composite-artifact.ts`,
  and `contracts/external-research.ts`: their type graphs are consumed by live contracts or Host config.
  The dead provider-card DSL types become orphaned there and are left as a documented residual (they
  are transitively referenced by the still-live `ProviderExpressionProfileDescriptor`).
- Add path-absence and public-export-convergence tests that reject re-exports of the deleted modules.

## Capabilities

### New Capabilities

- `agent-dead-public-surface-removal`: Rules and verification for deleting the unwired pre-Pi Agent
  provider routing, approval/permission/validation/perception pipelines, external processor/research
  runtime, profile registries, and dead contracts without disturbing canonical Agent runtime, third-party
  provider adapters, the canonical approval path, or user data.

### Modified Capabilities

<!-- None. -->

## Impact

- Owning responsibility: `@neko/agent-runtime` keeps Pi session/tool/capability orchestration;
  `@neko/agent-contracts` keeps the L0 wire/schema/codec boundary.
- Affected package roles: `packages/agent/runtime` (public entries, subpaths, tests), and
  `packages/agent/contracts` (dead contract files). No Host, Webview, or Desktop behavior changes.
- No persistent user-data shape changes; no internal version, migration, compatibility, or fallback path
  is introduced.
