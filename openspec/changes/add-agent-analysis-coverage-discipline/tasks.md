## 1. Base Prompt Contract

- [x] 1.1 Add concise bilingual, task-semantic analysis coverage guidance to `packages/agent/runtime/src/prompt/builtin-prompts.ts` without adding tool names, schemas, fixed output templates, or file-type routing.
- [x] 1.2 Add deterministic `SystemPromptBuilder` assertions for both activation conditions (comprehensive/limited observation) and suppression conditions (ordinary/narrow responses).

## 2. Agent Evaluation Coverage

- [x] 2.1 Add one declarative `agent-runtime.prompt-composition` scenario where a comprehensive bounded analysis has an unavailable segment and the expected answer is explicitly partial.
- [x] 2.2 Add one declarative neighboring scenario for a narrow ordinary question that rejects coverage boilerplate, then update the suite contract hash and preserve all existing cases.

## 3. Verification and Evidence

- [x] 3.1 Run focused runtime tests and `pnpm test:agent:eval` plus `node scripts/agent-eval/all-suite-dry-run.mjs`; record canonical Prompt owner, selected suite, and any blocked real-provider cases in the change evaluation note.
- [x] 3.2 Inspect the final diff for preservation of existing handoff changes and confirm no new Coverage/Receipt store, registry, workflow, session, internal version field, or fallback path was introduced; record residual risk that provider-backed behavior remains unexecuted when infrastructure is unavailable.
