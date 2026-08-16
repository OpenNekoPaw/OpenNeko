## 1. Remove the Shadowed Second Stack

- [x] 1.1 Remove the `OpenAICompatMediaAdapter` import and the five registrations for `openai`/`generic`/`newapi`/`xai`/`kling` from `media/index.ts`.
- [x] 1.2 Delete `media/adapters/openai-compat-media-adapter.ts`.

## 2. Inline the Single-Tier Registry

- [x] 2.1 Rewrite `media/adapters/media-adapter-registry.ts` as a one-tier `Map<ProviderType, MediaAdapter>` (drop the `BaseRegistry` base and custom tier).
- [x] 2.2 Delete `core/base-registry.ts` and `core/__tests__/base-registry.test.ts`.

## 3. Path-Level Verification

- [x] 3.1 Update `media-adapter-registry.test.ts` to the single-tier surface; assert the registry never owns AI SDK types after `createMediaPlatform`.
- [x] 3.2 Assert a MediaAdapter provider hits its canonical adapter and, on canonical failure, does not fall back to the AI SDK stack.
- [x] 3.3 Keep/verify explicit provider+model selection is not rewritten by routing.

## 4. Gates

- [x] 4.1 `pnpm --filter @neko/generation run typecheck` and `pnpm --filter @neko/generation run test`.
- [x] 4.2 Direct-dependency typecheck (Desktop / `@neko/ai-sdk` consumers).
- [x] 4.3 `pnpm check:no-internal-versioning`, `pnpm check:unused`, `pnpm check:legacy-debt`, `pnpm check:openspec`.
