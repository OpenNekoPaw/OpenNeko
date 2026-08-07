## 1. Shared Empty State Contract

- [x] 1.1 Add an opt-in fill layout to `@neko/ui/primitives` EmptyState without changing the default compact contract.
- [x] 1.2 Add producer tests for default and fill geometry, including flex growth and full grid-column span.

## 2. Management Catalog Consumers

- [x] 2.1 Switch Resource Center ready-empty rendering to the shared EmptyState with localized text and a semantic icon; update its focused test.
- [x] 2.2 Switch Agent Extension Management ready-empty rendering to the shared EmptyState while preserving the staged runtime contract changes; update its focused test.
- [x] 2.3 Switch All Projects ready-empty rendering to the shared EmptyState and update its focused test.
- [x] 2.4 Remove the replaced page-private empty-state structures and geometry CSS, and add path-level assertions that all three consumers use the canonical shared primitive.
- [x] 2.5 Use the unframed Resource Center empty-area baseline for Extensions and All Projects empty states.
- [x] 2.6 Remove the Extensions and All Projects collection-shell frame for populated states while preserving individual entry boundaries.

## 3. Verification And Review

- [x] 3.1 Run `pnpm --filter @neko/ui test`, `pnpm --filter @neko/assets-webview test`, `pnpm --filter @neko/agent-webview test`, and `pnpm --filter @neko/app-desktop test` for affected producer and consumers.
- [x] 3.2 Run `pnpm --filter @neko/ui check`, `pnpm --filter @neko/assets-webview typecheck`, `pnpm --filter @neko/agent-webview build`, and `pnpm --filter @neko/app-desktop typecheck`.
- [x] 3.3 Build and inspect the visible Electron Desktop Resource Center, Extensions, and All Projects empty states at wide and compact panel sizes; record any unavailable runtime evidence as residual risk.
- [x] 3.4 Run the Neko quality review on the scoped diff, including architecture, shared-foundation reuse, forbidden legacy/fallback terms, unrelated dirty-worktree preservation, and residual risk.
