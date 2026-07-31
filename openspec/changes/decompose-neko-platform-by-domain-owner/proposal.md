## Why

`@neko/platform` currently combines Agent configuration, provider execution, media generation,
download, output finalization, and Desktop-owned host integration behind one package. This hides the
real owners and lets Desktop depend on a broad facade instead of explicit domain/runtime contracts.

## What Changes

- **BREAKING** Inventory every public export and consumer of `@neko/platform`, assign one owning
  package and runtime layer, and reject exports without a durable owner.
- Move Agent model/provider contracts to the Agent or AI SDK owner, generation lifecycle behavior to
  `@neko/generation`, and concrete user configuration, credential, filesystem, and platform
  integration to Desktop Main adapters.
- Expose Node-only execution through an owning package's explicit Node entry or a narrowly named Node
  adapter when a separate dependency closure is proven.
- Migrate all consumers directly to the new canonical owners, add path assertions, then delete
  `packages/neko-platform` and `@neko/platform`.
- Do not retain a facade, compatibility alias, fallback import, re-export package, or dual execution
  path.

## Capabilities

### New Capabilities

- `platform-domain-ownership`: Defines export-level ownership, runtime-layer placement, direct
  consumer migration, and fail-visible retirement of the broad Platform package.

### Modified Capabilities

None.

## Impact

- Affects `packages/neko-platform`, `packages/neko-agent-runtime`, `packages/neko-agent-types`,
  `packages/neko-ai-sdk`, `packages/neko-generation`, Desktop Main composition, manifests, imports,
  tests, package exports, quality guards, and documentation.
- This is an internal prelaunch breaking change. Project content and supported Desktop settings must
  not be deleted; configuration/storage changes require explicit migration or a fail-closed
  diagnostic.
- Must complete before package identity normalization.
