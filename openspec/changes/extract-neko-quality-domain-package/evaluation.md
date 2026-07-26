# Evaluation Evidence

## Evaluation Scope

- Change: extract canonical Quality runtime/model/project orchestration from Agent Extension into `@neko/quality`.
- Decision: `reuse` `agent-runtime.perception-routing`; Tool schema, prompt and model policy are unchanged, while the implementation route is verified separately by deterministic package tests.
- Canonical path: Host -> Pi Tool Call -> Agent thin capability -> `@neko/quality/model` -> configured `image.understand` model -> revision-bound evidence -> `@neko/quality/core` Gate.
- Forbidden fallback: Agent-owned Gate runtime, deprecated `MediaQualityRuntime`, chat model substituted for `image.understand`, mock evaluator acceptance, direct model construction or path-only legacy request.

## Required Evidence

- `@neko/quality` architecture tests prove core/model/project depend only on shared contracts and retired Agent files are absent.
- Agent provider tests prove `QualityCheck` reaches the configured `image.understand` purpose model and new Quality package.
- Perception routing evaluation proves provider-backed purpose routing still selects the configured perception model rather than the chat model.

## Verification

### Deterministic package and repository evidence

- `pnpm --dir packages/neko-quality typecheck`: passed.
- `pnpm --dir packages/neko-quality test`: passed, 3 files and 18 tests.
- Agent Quality focused tests: passed, 3 files and 13 tests.
- Agent architecture boundary guards: passed, 1 file and 58 tests.
- Agent Extension TypeScript check: passed.
- `pnpm --dir packages/neko-types exec vitest run --maxWorkers=2`: passed, 171 files and 1455 tests after removing the unused shared Quality DTO.
- `pnpm build`: passed, 10 build tasks.
- `pnpm test`: passed, 27 test tasks.
- `pnpm check:deps`: passed, 1564 modules and 5535 dependencies with no violations.
- `pnpm exec knip --workspace packages/neko-quality`: passed.
- `pnpm check:strict-tsconfig`: passed.
- `pnpm check:content-access-boundaries`: passed, 1105 files checked.
- `pnpm check:test-orchestration`: passed, including 78 orchestration tests; inventory reports 31 workspaces and 26 owners.
- `pnpm check:openspec`: passed, 38 changes validated.
- Focused formatting check and `git diff --check`: passed.
- `pnpm check:quality`: stopped at the pre-existing code-debt ledger gate because
  `quality/ledgers/code-debt-surface-ledger.json` still contains four `migrate-now`
  records. This change does not add or modify those records.

### Agent evaluation evidence

- `pnpm test:agent:eval`: passed, 39 files and 278 key-free harness tests; the
  generated dry-run inventory contained 23 suites and 48 cases.
- Focused dry-run for
  `agent-runtime.perception-routing/external-perception-when-chat-differs`: passed.
- A real run of that same case was attempted and classified as
  `infrastructure-fail`, report id `report-run-mrxdpma0`, under
  `reports/agent-eval/agent-runtime.perception-routing/external-perception-when-chat-differs/run-mrxdpma0/`.
- Exact blocker: TUI session initialization rejected the configured
  `deepseek-chat/deepseek-v4-flash` profile because Pi requires explicit
  `contextWindow` and `maxOutputTokens`. No effective model/tool facts were
  emitted, so this is not a Quality behavior failure and is not reported as a
  behavior pass.

## Interpretation

Deterministic tests prove the new package ownership, public entry separation,
Agent-to-Quality import path and absence of retired fallback implementations.
They do not prove provider-backed model behavior. The real evaluation attempt
therefore remains infrastructure-blocked; dry-run and mocked evidence are not
substituted for acceptance.

## Residual Risk

- Provider-backed perception routing must be rerun after the evaluation model
  profile supplies Pi's required token limits.
- Cross-package evidence/resource contracts intentionally remain in shared
  contract packages; only the unused parallel `types/quality/qa-types` contract
  was deleted.
- Domain-specific rubric authoring, repair planning and mutation/apply remain
  with their owning domains. Future domains should integrate through the narrow
  Quality ports instead of growing a generic repair framework in this package.
- No Webview runtime acceptance was required because this change does not alter
  Webview UI, messages, focus, CSP or media behavior.
