## Evaluation Scope

- Change/feature: conditional, cross-domain analysis coverage discipline in the base Prompt.
- Decision and owning suite: `update` → `agent-runtime.prompt-composition`.
- Why real Evaluation is required: Prompt composition can be tested deterministically, but model behavior (partial disclosure versus boilerplate overuse) can only be trusted through the existing Desktop complete-session path.
- Canonical path and forbidden fallback: Desktop Agent assembly → base Prompt → Pi complete session → assistant answer; no direct turn runner, mock output, file-type router, Coverage store, or ExecutionReceipt.

## Cases

- Update the suite with one comprehensive request containing an unavailable bounded segment and one narrow ordinary question.
- Evidence: prompt-facts prove base composition; final-answer hard gates prove partial disclosure and absence of unnecessary coverage boilerplate.
- Missing observability: none for key-free validation; provider-backed model and cost authorization may remain unavailable.

## Verification

- Key-free validation: focused `SystemPromptBuilder` test, `pnpm test:agent:eval`, and all-suite dry-run.
- Real cases and reports: run the focused `agent-runtime.prompt-composition` suite through the Desktop complete-session driver when configured.
- Blocked or unexecuted cases: record exact `infrastructure-blocked` diagnostics when provider/model/cost authorization or Desktop launch is unavailable.

## Interpretation

- Pass requires the canonical base Prompt fragment, truthful partial result for the missing segment, and no coverage checklist for the narrow question.
- A good final answer without prompt-facts or canonical Desktop path is not acceptance.

## Residual Risk

- Natural-language coverage behavior can vary across models and paraphrases; the focused cases are boundary evidence, not a universal quality guarantee.
- No persistent Coverage or Receipt contract is introduced; future cross-restart or audit consumers require a separate owning-domain OpenSpec.

## Verification Note (This Change)

- Canonical Prompt owner: `@neko/agent-runtime`; selected suite: `agent-runtime.prompt-composition`.
- Key-free validation passed:
  - `pnpm --dir packages/agent/runtime exec vitest run src/session/__tests__/system-prompt-builder.test.ts`
  - `pnpm test:agent:eval` (vitest agent-eval suite and `node scripts/agent-eval/all-suite-dry-run.mjs`)
- All-suite dry-run now reports `caseCount: 83` with the prompt-composition suite at 5 cases.
- Provider-backed Desktop complete-session execution was not attempted: no provider/model/cost authorization or configured Desktop launch was available in this environment. Exact blocked infrastructure: `infrastructure-blocked` (`provider/model/cost authorization unavailable`; `Desktop launch not configured`).
- Final diff inspection confirms the existing `add-agent-content-document-handoff` prompt paragraphs and tests remain present; no Coverage store, Claim graph, ExecutionReceipt persistence, validator registry, workflow/session, file-type routing, or direct turn runner was added.
