## Context

`@neko/agent-runtime` root entry (`src/index.ts`) and `src/runtime/index.ts` re-export the following
modules that were part of the pre-Pi provider/executor model and have no production consumer:

- `provider/` provider-card parser/registry/loader/runtime, `provider-router.ts`,
  `provider-expression-context.ts`, and `provider/cards/*.card.md`;
- `approval/` strategy-pack engine (a second approval implementation beside
  `pi/tool-confirmation-registry.ts`);
- `permission/` rule engine and `tools/tool-pattern-matcher.ts`;
- `validation/` output/image/json/length/mermaid validators;
- `perception/` pipeline (not `tools/perception/*`, which is live);
- `runtime/capability/` external-processor runtime, external-research runtime providers, and the
  `capability-runtime-registries.ts` / `capability-runtime-bindings.ts` stores;
- `profile/` registries (not `contracts/agent-profile.ts`);
- `session/conversation-control-runtime.ts` (seven legacy `run*` conversation controls);
- empty `memory/` and `events/` directories.

`@neko/agent-contracts` re-exports these dead contract files: `creative-ai-invocation.ts`,
`agent-autoheal.ts`, `prompt-schema.ts`, `agent-output-validation.ts`, `capability-kind.ts`, and
`external-processor.ts`.

`runtime-config.ts` is NOT deleted: it has a real test consumer
(`contracts/src/__tests__/runtime-isolation-contracts.test.ts`) exercising its deterministic
snapshot constructors as an L0 isolation fixture. It remains a legitimate side-effect-free
constructor module even though it has no production consumer yet.

## Goals / Non-Goals

**Goals:**

- Remove every confirmed zero-consumer module, its export, its package subpath, and its fixtures/tests.
- Collapse the runtime root entry and `runtime/index.ts` to the real public surface.
- Prove, with tests, that the deleted paths are unreachable and the remaining surface is the only one.

**Non-Goals:**

- Moving any capability to another package (nothing is moved; dead code is deleted).
- Deleting or trimming `contracts/provider-card.ts`, `contracts/agent-profile.ts`,
  `contracts/composite-artifact.ts`, or `contracts/external-research.ts` (their type graphs are consumed
  by live contracts and Host config).
- Changing Pi session/tool/capability orchestration, `PiToolConfirmationRegistry`, `schema-validator`,
  `tools/perception/*`, MCP runtime, Host config, or user data.
- Introducing any internal version, migration, compatibility shim, or fallback.

## Decisions

### 1. Delete, do not migrate

Every deleted module has zero production consumers (verified by symbol-level search against
`packages/` and `apps/` excluding tests and the module itself). Because the repository is prelaunch and
there is no consumer, the canonical action is deletion, not extraction to a new package.

### 2. Keep contracts whose type graph is live

- `contracts/provider-card.ts` stays because `ProviderExpressionProfileDescriptor` is imported by
  `agent-capability.ts` and `prompt-schema.ts`, and that descriptor extends the whole `ProviderCard`
  type graph. The orphaned `IProviderRouter`/`IProviderCardRegistry`/`ProviderSelection` DSL types remain
  as documented residual (they no longer have a runtime implementor).
- `contracts/agent-profile.ts` stays because `composite-artifact.ts` and `provider-card.ts` consume its
  identity/registry/validation types.
- `contracts/external-research.ts` stays because `host/settings/config-core/toml-config.ts` and
  `mcp/mcp-runtime-bootstrap.ts` consume its config schema types.

### 3. Surgically reduce the live capability registry

`runtime/capability/capability-registry-runtime.ts` is live (constructed by `agent-app-host.ts`) and keeps
tool/manifest/prompt-fragment registration. Only its optional `providerCardRegistry`,
`artifactProfileRegistry`, and `providerExpressionProfileRegistry` registration/unregistration branches and
their now-unused helpers/imports are removed; the core tool/manifest path is unchanged.

### 4. Verify by path absence, not result only

Add a focused architecture-boundary test in `packages/agent/runtime` that imports the public entries and
asserts the deleted symbols are absent from the root entry and subpath exports, and that the remaining
canonical symbols are present.

## Replacement Plan

1. Delete the dead runtime modules and their package subpaths.
2. Delete the dead contract files.
3. Edit the runtime root entry, `runtime/index.ts`, `session/index.ts`, `session/types.ts`, and
   `capability-registry-runtime.ts` to drop dead exports and branches.
4. Add path-absence/public-surface-convergence tests.
5. Run typecheck, build, and tests for `@neko/agent-runtime` and `@neko/agent-contracts`, plus
   `pnpm check:unused` on the affected packages.

Rollback reverts the deletions and edits; no dual export or compatibility path is retained.

## Risks / Trade-offs

- **[Contract DSL types become orphaned]** → Accepted; they are transitively live through
  `ProviderExpressionProfileDescriptor` and will be trimmed only if that descriptor is later removed.
- **[A dynamic string registration was missed]** → The path-absence test plus `pnpm check:unused` and
  `pnpm build` catch residual references; any real consumer discovered fails the build loudly rather
  than silently breaking.
