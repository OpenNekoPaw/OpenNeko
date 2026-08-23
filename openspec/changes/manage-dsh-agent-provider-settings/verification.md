## Verification

- `pnpm --filter @neko/host exec vitest run src/ai-model-settings-contract.test.ts src/ai-model-settings-service.test.ts src/settings/__tests__/config-manager.test.ts`
- `pnpm --filter @neko/app-desktop exec vitest run src/main/desktop-dsh-provider-runtime.test.ts src/renderer/DesktopSettingsSurface.test.tsx`
- `pnpm --filter @neko/host exec tsc --noEmit`
- `pnpm --filter @neko/app-desktop typecheck`
- `pnpm test:agent:eval` — 45 files / 314 tests and all 27 indexed suites / 84 cases passed key-free validation.

The strict response contract rejects secret-bearing projections. Provider credentials are written only through `ProviderCredentialAuthority`; provider/model facts remain in the canonical DSH-backed `ConfigManager` path. Editing an existing Provider preserves its canonical type and builtin metadata.

## Agent and UI validation

Decision: reuse the existing `agent-runtime.model-binding` evaluation ownership and `desktop-agent-provider-ui` visible Desktop path. The canonical positive path is Settings → ConfigManager/credential authority → DSH provider profile → new Agent session. The forbidden path is a Renderer secret store, `models.json`, or implicit provider fallback.

Real visible execution is `infrastructure-blocked`: `~/.neko/config.toml` is readable, but `OPENNEKO_AGENT_EVAL_PROVIDER_ID`, `OPENNEKO_AGENT_EVAL_MODEL_ID`, and explicit cost approval are absent. A separate visible Electron attempt also timed out waiting for the CDP target. API-key non-echo, native Settings interaction, and a real provider response are therefore not claimed as accepted.
