## Why

`ProviderCard` / provider-expression profile DSL no longer has a runtime registry, provider implementation, or canonical consumer, while its public contracts and `providerExpressionProfileId` configuration path still advertise a second provider-selection and prompt-adaptation system beside the frozen Pi purpose model policy. Keeping that ghost path permits stale configuration and future parallel routing to re-enter a runtime that now requires one exact provider/model and ordinary Pi Skills.

## What Changes

- **BREAKING** Delete the `ProviderCard` / provider-expression profile contracts, routing and validation DSL, Capability manifest/provider branches, public exports, fixtures, and tests.
- **BREAKING** Remove `providerExpressionProfileId` / `provider_expression_profile_id` from AI configuration, Host TOML parsing/export, Agent Turn/Webview projection, and Agent Evaluation contracts; obsolete fields fail visibly at the owning configuration record and are not migrated, defaulted, or interpreted through another profile path.
- Keep exact provider/model selection in the immutable per-Turn purpose model policy. A Skill never selects, overrides, or falls back to a provider/model.
- Move the still-live media generation intent parser types into the owning Agent media Tool implementation instead of retaining the ProviderCard contract graph.
- Extend the existing capability-neutral `image`, `video`, and `media-production` Skills with concise creative-expression guidance. Provider-specific syntax or limits remain owned by a real provider adapter/capability prompt and are never encoded as portable Skill metadata.
- Add path-absence, strict decode, Skill-boundary, and Agent Evaluation evidence proving the removed DSL cannot participate and ordinary Skill invocation remains the only reusable expression-guidance path.

## Capabilities

### New Capabilities

- `provider-expression-dsl-retirement`: Defines removal of the provider-expression DSL and configuration path, exact provider/model ownership, ordinary Skill replacement semantics, fail-visible obsolete configuration, and no-fallback verification.

### Modified Capabilities

<!-- None. -->

## Impact

- `@neko/agent-contracts` owns the canonical Agent wire/type surface and removes ProviderCard, provider-expression Capability declarations, and cross-runtime projection fields.
- `@neko/ai-contracts` and `@neko/host` own provider/model configuration contracts and native TOML parsing/export; they remove the obsolete expression-profile field without adding compatibility reads or migration.
- `@neko/agent-runtime` keeps the single Pi purpose model policy and media Tool behavior, internalizes generation-intent parsing types, and removes obsolete public exports.
- `@neko/skills` remains a content-only Pi-compatible package and receives only capability-neutral creative-expression method updates; it does not gain provider identity, routing, Tool protocol, or runtime authority.
- `@neko/agent-webview`, Desktop composition, and `scripts/agent-eval` consume the canonical shapes and remove the retired field and hard-gate branch atomically.
- Existing user configuration bytes are not rewritten or deleted. A model record containing the retired field is invalid at the Host configuration boundary with a local diagnostic; unrelated providers, models, Conversations, Workspaces, and Skills remain available.
