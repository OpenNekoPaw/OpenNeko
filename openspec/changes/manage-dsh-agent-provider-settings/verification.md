## Verification

- `pnpm --filter @neko/host exec vitest run src/ai-model-settings-contract.test.ts src/ai-model-settings-service.test.ts src/settings/__tests__/config-manager.test.ts`
- `pnpm --filter @neko/app-desktop exec vitest run src/main/desktop-dsh-provider-runtime.test.ts src/renderer/DesktopSettingsSurface.test.tsx`
- `pnpm --filter @neko/host exec tsc --noEmit`
- `pnpm --filter @neko/app-desktop typecheck`
- `pnpm check:openspec` — 168 governed changes/specs passed strict validation.
- `pnpm test:agent:eval` — 45 files / 314 tests and all 27 indexed suites / 84 cases passed key-free validation.

The strict response contract rejects secret-bearing projections. Provider credentials are written only through `ProviderCredentialAuthority`; provider/model facts remain in the canonical DSH-backed `ConfigManager` path. Editing an existing Provider preserves its canonical type and builtin metadata.

## Agent and UI validation

Decision: reuse the existing `agent-runtime.model-binding` evaluation ownership and `desktop-agent-provider-ui` visible Desktop path. The canonical positive path is Settings → ConfigManager/credential authority → DSH provider profile → new Agent session. The forbidden path is a Renderer secret store, `models.json`, or implicit provider fallback.

Real visible execution is `infrastructure-blocked`: `~/.neko/config.toml` is readable, but `OPENNEKO_AGENT_EVAL_PROVIDER_ID`, `OPENNEKO_AGENT_EVAL_MODEL_ID`, and explicit cost approval are absent. A separate visible Electron attempt also timed out waiting for the CDP target. API-key non-echo, native Settings interaction, and a real provider response are therefore not claimed as accepted.

## Progressive settings follow-up

The live Electron Settings overlay was inspected for the initial collapsed state, Provider-only expansion, and model-only replacement expansion. The full catalogs are no longer rendered until requested. Functional component tests cover the same state cycle.

## Default-model card follow-up

The standalone default selectors were removed. Focused Renderer tests assert that the compact state contains no model selector, the model catalog separates dialogue and generation entries, projected defaults are marked on their cards, and a non-default model sends its exact type and identity through the existing `setDefault` bridge. Visible Electron inspection covered the simplified initial state and dense grouped model catalog at 1220×768 in the light theme. See `ui-validation.md` for artifact mapping and remaining evidence gaps.

## Provider-scoped editor follow-up

The parallel model-management summary was removed. Focused Renderer tests assert that selecting a Provider
reveals only its exact models, model defaults continue to use the canonical type/ref bridge, and a custom
Provider cannot configure models before its canonical Provider record is saved. Typecheck, focused ESLint,
13 Settings/theme tests, formatting, diff check and strict OpenSpec validation passed. Visible Electron
inspection covered the compact catalog, configured Provider, collapsed/expanded connection fields, model
catalog, custom Provider and scrollable footer at 1220×768. The final post-polish recapture was blocked by
macOS lock; see `ui-validation.md`.

## Title action and responsive model groups follow-up

The redundant Agent advanced-settings row was removed and its existing Host action moved to the Agent
group heading. Focused tests assert the action location, removed copy and exact dialogue/generation group
count. Typecheck, focused Renderer tests, ESLint, formatting and diff checks passed. The real Electron
initial Agent state was inspected successfully; configured-Provider and narrow-window recapture were
blocked by concurrent development-runtime reloads that closed the overlay or navigated to unrelated scenes.

## Provider capability groups follow-up

Provider management now derives dialogue, generation, mixed and unconfigured groups from the canonical model
catalog. Focused component tests prove exact group membership and non-duplication; renderer style tests prove
the wide two-column and narrow single-column rules. Typecheck, focused ESLint, strict OpenSpec and diff checks
passed. A real Electron capture verified the current wide layout with 2 dialogue, 1 generation and 1
unconfigured Provider. Narrow-window recapture was blocked when the shared development Electron was replaced
by its default page during resize; no credentials or Provider facts were changed during validation.

## Flattened Provider catalog follow-up

The outer Provider summary card, count and disclosure state were removed. Provider capability groups and Add
Provider now render directly in the Agent settings group, while the Provider editor remains absent until a card
or add action is selected. Focused Renderer tests, Desktop typecheck, focused ESLint, strict OpenSpec and diff
checks passed. The current Electron runtime at `localhost:5174` directly showed the flattened 2/1/1 grouped
catalog and then exposed the scoped DeepSeek Chat editor only after selection. No credential or Provider fact
was changed during validation.
