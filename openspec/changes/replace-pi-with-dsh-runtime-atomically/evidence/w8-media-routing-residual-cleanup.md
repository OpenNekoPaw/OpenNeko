# W8 Media Routing Residual Cleanup

Date: 2026-08-25

## Contract audit

- Host configuration now validates every `default_model_purposes` key against the single canonical purpose registry. Unknown entries fail locally with the existing unsupported-purpose diagnostic while valid siblings remain usable.
- The decoder no longer owns a retired media-purpose name list, dedicated diagnostic code, template warning, compatibility reader, or alternate success path.
- Repository-wide producer/consumer scans found that the Search media-analysis card projector, its reference field, and its dedicated refresh work kind had no external production consumer. They were deleted; Media semantic index retains source-attributed text segments, entity mentions, and semantic tags.
- Quality's `perception` evaluator class is retained because it classifies visual/semantic evidence only. It does not select a model, store a provider route, call an LLM, or participate in Agent media routing.
- Current tests and Evaluation cases now validate the canonical registry/current-model Tool behavior without embedding retired field or Tool identities. Archived OpenSpec and historical evidence remain historical records rather than runtime contracts.
- Active proposal/spec text that still required the deleted media-analysis card collection was updated to the canonical locator-backed attachment and artifact projection; no active requirement asks a producer to restore the retired field.

## Canonical path

```text
registered purpose binding -> Host canonical purpose registry -> exact model reference
current Agent model -> native attachment or package-owned media Tool block -> same model
Search semantic evidence -> text segments / entity mentions / semantic tags
```

No second model selector, provider fallback, media-purpose compatibility list, or Search card bridge participates.

## Verification

- Host TypeScript and five focused settings suites passed: 5 files / 73 tests.
- Search typecheck and focused semantic-index/cache-search suites passed: 2 files / 20 tests. The full Search suite reached an unrelated existing architecture test that still opens a deleted Agent capability-provider file; the remaining 17 files / 87 tests passed.
- Agent contracts passed typecheck and 19 files / 118 tests. Agent Webview passed typecheck and 9 files / 73 tests. Agent runtime passed typecheck and the focused public-surface suite passed 1 file / 7 tests.
- AI contracts passed typecheck and 1 file / 2 tests. DSH bridge passed typecheck and 5 files / 52 tests. Desktop passed typecheck and the provider projection suite passed 1 file / 8 tests.
- `pnpm test:agent:eval` passed 45 files / 315 tests and the all-suite dry-run passed 27 suites / 82 cases.
- Targeted ESLint, `check:application-boundaries`, `check:strict-tsconfig`, `check:openspec`, strict change validation, formatting, and `git diff --check` passed.
- `check:package-boundaries` passed its fixtures and 58-package scan, then failed on the unrelated existing `@neko/agent-dsh-plugin` active-product reachability record.
- `check:no-internal-versioning` passed all 13 self-tests, then reported the pre-existing dirty-worktree allowance/debt mismatch (31 stale allowances and 124 new occurrences). The generated debt/allowance files already contain unrelated user edits, so this slice did not overwrite or regenerate them.

## Residual classification

- Historical OpenSpec archives and evidence may retain terminology that accurately records a previous design or executed suite identity; they are not registered production paths.
- Source/path poison tests may name deleted contracts so that reintroducing them fails visibly; those names do not expose runtime fields or alternate handlers.
- Quality evidence taxonomy remains intentional domain vocabulary and is not a configurable model field.
