# Agent Evaluation Disposition

## Scope

- Change: conditional ordinary-document handoff through the existing exact receipt and
  approval-gated core `Write`, plus final effective-Prompt facts.
- Decision: `reuse` deterministic exact target-receipt Runtime cases, reuse screenplay authoring
  only for approval-gated durable Workspace mutation, and update prompt-composition only where its
  assertions can prove the new guidance. The current Evaluation driver cannot bind or observe an
  exact `content-document` receipt.
- Canonical path: immutable Turn snapshot -> exact `content-document` receipt -> current Tool list
  contains `Write` -> final composed Prompt -> approval -> successful core `Write` -> durable
  Workspace-relative identity -> exact Desktop facts.
- Forbidden paths: UI/entry changes, Project or document inference, another writer, Skill-owned Tool
  protocol, controller-time base-prompt facts and direct runtime Evaluation execution.

## Cases

- Positive case: an existing exact content target receives `Write`, the composed Prompt contains the
  conditional handoff, and successful mutation evidence carries the exact durable identity.
- Unbound case: the same save request has no `Write`, cannot infer active/current/recent authority,
  and must not claim chat content was saved.
- Prompt facts case: the callback binds the final effective Prompt to the same Turn identity; omission
  fails with a specific prompt-composition diagnostic before completion projection.

## Verification

- Agent Runtime tests prove that only an exact `content-document` receipt admits `Write`, while
  Character, World and unbound Turns do not receive it, inspect the composed Prompt, and prove a
  receipt-bound `Write` cannot mutate a different Workspace-relative path.
- Desktop composition tests prove final-Prompt binding, buffered event projection and missing-callback
  failure without a base-prompt fallback.
- Key-free validation uses `pnpm test:agent:eval`; it validates suite/Scenario/assertion structure,
  not provider behavior.
- The screenplay Evaluation case proves `Write`, approval, CAS/create results and final bytes, but
  does not prove the exact receipt that admitted `Write`; no Evaluation-only receipt setup or direct
  runtime path is added to mask this gap.
- Provider-backed execution requires explicit provider/model/cost authorization. No UI validation is
  applicable because this change intentionally leaves Renderer and Webview behavior unchanged.
- No provider/model/cost authorization was supplied, so provider-backed and visible Agent execution
  are `infrastructure-blocked` and were not attempted.

## Interpretation

- A chat answer or composite artifact does not satisfy the durable authoring assertion.
- Only the existing approved `Write` with an exact successful mutation proves saved content.
- A missing final-Prompt callback is a runtime contract failure, not permission to record a weaker
  controller-time Prompt.

## Residual Risk

- Real-model selection of `Write`, final wording and provider-backed compliance remain unverified
  without provider/model/cost authorization.
- Provider-backed exact-receipt handoff remains coverage-blocked until the canonical Desktop public
  input path can establish and project that receipt without an Evaluation-only authority path.
