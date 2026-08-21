# Validation Evidence

## Functional and contract checks

- `pnpm --filter @neko/agent-contracts typecheck` passed.
- `pnpm --filter @neko/agent-contracts test` passed: 32 files, 181 tests.
- `pnpm --filter @neko/agent-runtime typecheck` passed.
- `pnpm --filter @neko/agent-runtime test` passed: 52 files, 356 tests.
- `pnpm --filter @neko/dsh-bridge typecheck` passed.
- `pnpm --filter @neko/dsh-bridge test` passed: 4 files, 31 tests.
- `pnpm --filter @neko/dsh-bridge build` passed.
- `pnpm --filter @neko/agent-webview typecheck` passed.
- `pnpm --filter @neko/agent-webview test` passed: 3 files, 37 tests.
- `pnpm --filter @neko/app-desktop typecheck` passed.
- `pnpm --filter @neko/app-desktop test` passed: 102 files, 610 tests.
- Strict OpenSpec validation passed.

## UI validation

- Applicability: applicable because the existing composer usage indicator now displays authoritative DSH pressure.
- Acceptance inventory: missing pressure keeps the existing zero/unknown state; `projectedTokens` is preferred over `pressureTokens`; the exact `contextWindow` drives the denominator; the tooltip remains reachable even though DSH exposes no manual-compress callback; model, permission, attachment, and send controls retain their existing behavior.
- Functional result: pass. The focused Webview test projects `41,100 / 256,000` and verifies the existing tooltip reports `16.1%` after hover.
- Visual result: not independently executed in a visible packaged Electron runtime. No layout, class, color, typography, or component replacement was introduced; only data binding and hover ownership moved to the existing wrapper. This remains advisory visual risk, not a functional failure.

## Quality review

- Package, application, Agent, Webview, strict TypeScript, strict Agent, and OpenSpec architecture gates passed.
- Full `pnpm check:quality` stopped at the repository-wide internal-versioning audit because the dirty worktree contains 78 baseline-drift findings across pre-existing unrelated changes. No new `any`, `console.log`, compatibility path, fallback path, or version field was found in the scoped production diff.
