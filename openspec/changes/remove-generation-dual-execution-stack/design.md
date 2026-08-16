## Context

Media generation runs through two stacks keyed by provider type:

- AI SDK stack (`@neko/ai-sdk` `resolveProvider`) supports `openai` (image + speech, video returns null),
  and `newapi`/`oneapi`/`generic`/`xai`/`kling` (image + video + speech via the NewAPI provider models,
  including NewAPI video polling). These run through `MediaGenerationExecutor.executeAiSdk`.
- MediaAdapter stack (`getMediaAdapterRegistry().getForType`) supports `runway`, `luma`, `minimax`,
  `liblib`, `suno`, `vidu`, `midjourney`, `fal`, `dashscope` via polling adapters. These run through
  `MediaGenerationExecutor.executeMediaAdapter`.

The executor dispatch (`media-generation-executor.ts:204-235`) checks `resolveProvider(provider.type)`
first and falls through to the MediaAdapter registry only when the AI SDK does not support the type. That
dispatch itself is a static disjoint capability check, not a failure fallback. The defect is that
`createMediaPlatform` (`media/index.ts:171-176`) also registers `OpenAICompatMediaAdapter` for the five AI
SDK types. That second registration is unreachable in `executePayload` but reachable in
`describeExternalTask`/`cancelExternalTask` (`media-generation-executor.ts:163,176`), so the same provider
type has two inconsistent success paths.

## Goals / Non-Goals

**Goals:**

- Each provider type has exactly one canonical executor.
- Delete the shadowed adapter registration, the now-dead `OpenAICompatMediaAdapter`, and the single
  consumer generic `BaseRegistry`/custom tier.
- Prove with path tests that the second stack cannot succeed for a canonical type.

**Non-Goals:**

- Moving or mocking the AI SDK providers or any real adapter to make tests pass.
- Removing the download, HTTP, credential, timeout, abort, or third-party protocol logic.
- Changing routing (explicit/default provider+model selection) or provider config shapes.
- Touching the Agent cleanup batch or the `extract-generation-domain-package` change.

## Decisions

### 1. Disjoint stacks by provider type

- AI SDK types: `openai`, `newapi`, `oneapi`, `generic`, `xai`, `kling` → AI SDK only. `openai` video is
  unsupported and fails visibly (the AI SDK already returns `video: () => null`).
- MediaAdapter types: `runway`, `luma`, `minimax`, `liblib`, `suno`, `vidu`, `midjourney`, `fal`,
  `dashscope` → polling adapter only.
- Unsupported types (`anthropic`, `google`, `azure`, `ollama`, `jimeng`, and any unknown) fail with
  "No owning media runtime is registered for provider type ..." and never switch stacks.

### 2. Delete the shadowed adapter, not migrate it

`OpenAICompatMediaAdapter` has no consumer after removing its five registrations; it is deleted together
with its tests. The five AI SDK types are already served by the AI SDK stack, so nothing is moved.

### 3. Inline the single-tier registry

`BaseRegistry` is a generic base class serving only `MediaAdapterRegistry`; its custom tier
(`register`/`getCustom`/`unregister`/`getAllCustom`/`clearCustom`) has no production consumer. It is
deleted and `MediaAdapterRegistry` becomes a one-tier `Map<ProviderType, MediaAdapter>` with
`registerBuiltin`/`unregisterBuiltin`/`getForType` (names kept for call-site stability) and the existing
singleton/test factories.

## Replacement Plan

1. Create the OpenSpec artifacts.
2. Remove the five `OpenAICompatMediaAdapter` registrations and its import from `media/index.ts`.
3. Delete `openai-compat-media-adapter.ts`; inline `media-adapter-registry.ts`; delete `base-registry.ts`
   and its test.
4. Update `media-adapter-registry.test.ts` to the single-tier surface and add path-level assertions.
5. Run generation typecheck/test, direct-dependency typecheck, `check:no-internal-versioning`,
   `check:unused`, `check:legacy-debt`, `check:openspec`.

Rollback reverts the deletion and inline; no compatibility re-export is retained.

## Risks / Trade-offs

- **`openai` video is unsupported** → already true before this change (the AI SDK `video()` returns null
  and the shadowed adapter was unreachable in `executePayload`); this change makes that explicit.
- **Registry surface shrinks** → only the three production-used methods remain; any future consumer adds
  an exact-identity method rather than re-introducing a generic base or custom tier.
