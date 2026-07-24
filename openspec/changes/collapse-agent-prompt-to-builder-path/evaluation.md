# Evaluation Plan

## Evaluation Scope

- Change/feature: remove parallel prompt frameworks and make Builder plus Pi Skill composition the only production path.
- Decision and owning suite: `update` `agent-runtime.prompt-composition`.
- Why real Evaluation is required: prompt composition, AGENTS.md environment guidance and explicit Skill injection can change model behavior.
- Canonical path: TUI session owner -> SystemPromptBuilder -> PiConversationRuntime -> Skill snapshot/invocation -> provider request.
- Forbidden fallback: Composer, module registry/cache, Agent/Platform PromptManager, legacy Skill fragment, hidden prompt body projection.

## Cases

- Updated canonical case: `base-and-skill-fragments`.
- Updated boundary case: `agents-md-environment-fragment`.
- Evidence: ordered secret-free base/environment/Skill fragment identities, effective runtime/model identity, non-empty output and marker behavior.
- Missing observability: none for the selected cases; the final runs bound composition facts to the actual Builder/Pi turn inputs.

## Verification

- `pnpm test:agent:eval` passed: 39 files / 277 tests and 23 suites / 48 indexed dry-runs.
- Both selected focused dry-runs passed:
  - `agent-runtime.prompt-composition/base-and-skill-fragments`
  - `agent-runtime.prompt-composition/agents-md-environment-fragment`
- The target contract is `sha256:d388519962bae4102874ce71834d32367b27e13dbbc22f7cfd18d7c0e9971d20`.
- Builder/Host deterministic coverage passed for locale, mode, AGENTS.md augmentation, Skill fragment identity, instance isolation and retired-source absence.
- Repository verification passed for `pnpm build`, all 27 `pnpm test` Turborepo tasks, `pnpm --filter neko-agent compile`, `pnpm check:deps`, `pnpm check:agent-boundaries`, strict OpenSpec validation and `git diff --check`.
- `pnpm check` was executed and stopped at the repository's existing `check:unused` debt; `pnpm check:deps` was then run separately and passed.
- `pnpm check:legacy-debt` remains blocked by four existing `neko-quality/rejectLegacyMediaPathRequest` findings outside the Agent prompt boundary.
- `pnpm check:unused` remains blocked by repository-wide baseline debt. The retired Prompt framework sources do not remain as production fallback paths.
- Both real provider-backed cases passed through the canonical TUI path with effective model `nekoapi-chat/gpt-5.6-luna` and target contract `sha256:d388519962bae4102874ce71834d32367b27e13dbbc22f7cfd18d7c0e9971d20`:
  - `base-and-skill-fragments`, run `prompt-collapse-base-skill-built-20260724`: runtime, Pi runtime, composition and answer gates passed; 15,662 ms, 5,988 input tokens, 579 output tokens and zero retries. Report: `reports/agent-eval/agent-runtime.prompt-composition/base-and-skill-fragments/prompt-collapse-base-skill-built-20260724/`.
  - `agents-md-environment-fragment`, run `prompt-collapse-agents-md-fixed-20260724`: runtime, composition and marker gates passed; 6,246 ms, 4,787 input tokens, 100 output tokens and zero retries. Report: `reports/agent-eval/agent-runtime.prompt-composition/agents-md-environment-fragment/prompt-collapse-agents-md-fixed-20260724/`.
- Earlier failed runs remain retained under their original run ids. They exposed volatile/missing composition facts and a missing AGENTS.md override before the final built/fixed runs; they were not overwritten or reclassified as success.

## Interpretation

- Deterministic source absence proves only that retired APIs cannot compile or be rediscovered.
- The final real case success additionally proves base/AGENTS/Skill behavior and actual path facts for the selected model and fixtures.
- A good final answer without complete composition facts is insufficient.

## Residual Risk

- Prompt quality is not being optimized, so no before/after quality improvement is claimed.
- Capability prompt composition outside the selected cases remains protected by its owning deterministic/provider tests.
- The focused cases provide one passing sample each; they do not establish cross-model stability or output-content quality, and no Judge stage was run.
- Repository-wide unused-code and legacy-media-path findings remain separate baseline debt; they do not restore or validate any retired Prompt path.
