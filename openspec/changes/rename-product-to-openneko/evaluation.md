## Evaluation Scope

- **Change/feature:** Rename the product-facing Agent prompt identity from the retired top-level brand to `OpenNeko`; no prompt method, tool protocol, routing, Skill policy, or output contract changed.
- **Decision and owning suite:** `reuse` — `agent-runtime.prompt-composition`, focused case `base-and-skill-fragments`.
- **Why Evaluation applies:** The mechanical rename changes the builtin base prompt bytes and golden snapshot, so prompt-composition evidence is required even though semantic behavior is intended to remain unchanged.
- **Canonical path and forbidden fallback:** Canonical TUI Pi runtime assembly → base prompt fragment → explicit storyboard activation → `skill.injection` fragment → assistant output. The case forbids a replaced base prompt, legacy Skill fragment, hidden prompt body projection, and `skill:comic-to-storyboard` participation.

## Cases

- **Reused:** `agent-runtime.prompt-composition / base-and-skill-fragments`.
- **Evidence and coverage:** The focused dry-run resolved the indexed suite, `empty-workspace` fixture, markdown runtime profile, configured-default model profile, canonical Pi runtime assertion, required `base` and `skill:storyboard` fragments, forbidden fragment, runtime-error-empty assertion, and non-empty final-answer assertion.
- **Deterministic prompt evidence:** `prompt-golden-snapshot.test.ts` passed 6/6 and confirms the updated builtin prompt snapshots.
- **Missing observability:** None for key-free composition contract validation. Provider-backed output behavior remains unexecuted.

## Verification

- **Key-free validation:** `pnpm test:agent:eval` passed 40 test files / 277 tests and dry-ran all 23 suites / 43 cases.
- **Focused selection:** `node scripts/agent-eval/protocol-smoke.mjs --suite agent-runtime.prompt-composition --case base-and-skill-fragments --dry-run` passed.
- **Real cases and reports:** Not run. The local user config and TUI build are present, but none of the documented provider credential environment variables are set. A provider-backed run could incur external cost and was not authorized as part of this naming-only change.
- **Blocked or unexecuted cases:** Real TUI/model execution is unexecuted; no real report was produced.

## Interpretation

- The canonical prompt-composition contract, required fragment identities, forbidden fragment, and deterministic prompt snapshots remain valid after the product-name substitution.
- No model-output quality comparison is claimed. Key-free validation and dry-runs are harness/contract evidence, not real Agent behavior acceptance.

## Residual Risk

- A real configured model has not consumed the renamed prompt, so provider-specific behavior is not directly observed. The residual risk is low because the only prompt delta is the product-name token and all deterministic composition and snapshot checks passed.
