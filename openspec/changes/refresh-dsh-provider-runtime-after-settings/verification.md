# Verification

## Automated evidence

- `pnpm --filter @neko/host exec vitest run src/ai-model-settings-contract.test.ts src/ai-model-settings-service.test.ts` — 2 files / 19 tests passed.
- `pnpm --filter @neko/app-desktop exec vitest run src/main/desktop-dsh-agent-runtime.test.ts` — 9 tests passed, including idle refresh, pending refresh, exact Conversation binding preservation and fail-visible refresh failure.
- `pnpm --filter @neko/agent-runtime exec vitest run src/acp/dsh-acp-projection.test.ts` — 24 tests passed, including active-turn detection across sibling sessions.
- `pnpm --filter @neko/app-desktop exec vitest run src/renderer/DesktopSettingsSurface.test.tsx` — 10 tests passed, including the pending-refresh notice and removal of application-restart semantics.
- `pnpm --filter @neko/app-desktop typecheck` and `pnpm --filter @neko/agent-runtime typecheck` passed.
- Scoped ESLint passed for the DSH runtime, projection, Host settings contracts/services and Settings Renderer files.
- `pnpm check:application-boundaries` passed with 1,369 files and no findings.
- `pnpm check:openspec` passed all 173 governed changes/specs.
- `pnpm test:agent:eval` passed 45 files / 314 tests and the 27-suite / 84-case key-free dry-run inventory.
- `git diff --check` passed for the worktree.

The Host response no longer accepts `restartRequired`. Provider, model and default mutations report an execution configuration change; Desktop rereads the canonical ConfigManager and credential authority for each DSH generation. The stable execution catalog is replaced only after ACP connection succeeds. Pending refresh blocks new session/prompt work until the projected active turn ends, while durable Conversation identity and binding remain owned by the existing application service.

## Runtime evidence limits

The visible `desktop-ai-model-settings` Electron scenario was attempted but could not start because process `29004` already owns this checkout's Vite bundle. The launcher timed out waiting for CDP; no screenshot or real settings mutation is claimed. Failure report:

- `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-24T16-29-06.629Z-desktop-ai-model-settings-development/report.json`

Real provider-backed evaluation is `infrastructure-blocked`: `~/.neko/config.toml` is readable, but explicit evaluation Provider/model identity and cost authorization are absent. Key-free evaluation proves harness and contract readiness only, not a live Provider response.

## Repository-wide blockers

Full-file ESLint for concurrently modified `app-host.ts` remains red on unrelated unused Character imports, a non-null assertion and an empty block outside this change's hunks. The internal-versioning and Agent inventory gates are also blocked by pre-existing worktree changes and stale allowances; this change adds no internal version field, alternate Provider path or retired Tool registration.
