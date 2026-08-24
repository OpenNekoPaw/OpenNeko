# Verification

Date: 2026-08-22

## Passed

- `pnpm exec openspec validate finish-dsh-agent-contract-cleanup --strict`
- `pnpm --filter @neko/agent-contracts typecheck`
- `pnpm --filter @neko/agent-runtime typecheck`
- `pnpm --filter @neko/agent-webview typecheck`
- `pnpm --filter @neko/dsh-bridge typecheck`
- `pnpm --filter @neko/cut-domain typecheck`
- `pnpm --filter @neko/app-desktop typecheck`
- `pnpm --filter @neko/agent-contracts test` — 17 files, 101 tests
- `pnpm --filter @neko/agent-runtime test` — 50 files, 368 tests
- `pnpm --filter @neko/agent-webview test` — 4 files, 47 tests
- `pnpm --filter @neko/app-desktop exec vitest run src/architecture-boundary.test.ts` — 1 file,
  23 tests
- `git diff --check` for the cleanup paths

## Repository gates with unrelated failures

- `pnpm typecheck` reached packages outside the cleanup scope and failed in the unmodified
  `packages/entity/webview/src/inspector/EntityInspector.tsx`: an object with `kind` is not assignable
  to `ContentLocator`. All direct cleanup consumers were typechecked separately and passed.
- `pnpm check:unused` completed Knip analysis and reported existing repository-wide unused files,
  dependencies and 160 exports. It reported no deleted Agent contract as reachable and no new
  cleanup-only file as unused, but exits non-zero for the existing findings.
- `pnpm check:deps` failed on three existing `agent-runtime-no-chara-domain` imports in
  `dsh-domain-tool-handlers.ts`, `dsh-acp-application-client.ts` and `character-host-adapter.ts`.
  None is modified by this cleanup.
- `pnpm check:legacy-debt` found no `delete-now`, `migrate-now`, `migration-only` or `current-bridge`
  production occurrence. It exits non-zero because the current lexical scan classifies `DshImage*`
  identifiers as 25 `shim`/`needs-review` matches in existing DSH image paths.

## Dirty-worktree isolation

The worktree already contained concurrent Generation/Job/DSH changes, including Desktop domain Tool
tests, Agent runtime domain Tool adapters, Generation, Cut export and shared Job lifecycle files. The
cleanup does not edit or reformat those files. Validation results above describe the combined worktree;
the cleanup diff is reviewed by exact Agent Contracts/runtime legacy/Webview/OpenSpec paths.

## Residual risk

- Root barrels are private and all workspace sources were searched, but an undocumented consumer
  outside this monorepo would break because no compatibility export is retained. The packages are
  private/prelaunch, so this is intentional.
- Prompt-file runtime and some other retained Agent root exports still appear to have low production
  reachability. They were excluded to keep this change to one closed deletion graph and need the next
  inventory pass.
- Skill/MCP management still uses the stale `extension-management` name; only naming/product-scene
  cleanup remains, not an old generic Extension runtime success path.
