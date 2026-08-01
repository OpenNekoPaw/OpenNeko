## Verification

Passed:

- `pnpm check:test-orchestration` (72 tests)
- `pnpm typecheck`
- `pnpm build:ui`
- `pnpm build` (includes Electron Forge darwin-arm64 packaging)
- `pnpm check:deps`
- `pnpm check:quality`
- `pnpm check:legacy-debt`
- `pnpm format:check`
- `git diff --check`
- `openspec validate simplify-workspace-orchestration-to-pnpm --strict --no-interactive`

Executed with unrelated worktree failures:

- `pnpm lint` / `pnpm ci:local`: two Desktop files outside this change fail `prefer-const` and unused-variable rules.
- `pnpm test`: 429/430 Desktop tests pass; the existing global-library CSS/header assertion fails.
- `pnpm check:unused`: concurrent Desktop functional work leaves two files and four exports reported as unused.

No Agent prompt/capability/Skill behavior or Renderer runtime interaction changed, so Agent evaluation and a live Electron
interaction scenario are not applicable. The full build exercised the canonical native Desktop package path.
