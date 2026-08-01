# Agent Evaluation

## Evaluation Scope

- Change/feature: strict build gate fixes in Agent file-reference parsing and prompt-file heading
  projection.
- Decision and owning suite: `excluded`; existing deterministic tests in the Agent runtime own the
  affected parsing behavior.
- Why real Evaluation is not required: the edits only make mandatory regular-expression captures
  and glob segments explicit under `noUncheckedIndexedAccess`. They do not change prompt content,
  Skill selection, capability/tool routing, provider/model configuration, AgentSession lifecycle,
  or Desktop event projection.
- Canonical path and forbidden fallback: `InputProcessor` and prompt-file projector remain the only
  paths; no compatibility parser, default capture, or alternate input route was added.

## Cases

- Reused: line range, single-line mention, durable reference exclusion, workspace input processing,
  and Markdown heading extraction unit cases.
- Evidence and coverage: focused Agent runtime tests plus Agent/Desktop typecheck.
- Missing observability: none for the deterministic parser contract.

## Verification

- Key-free validation: `pnpm test:agent:eval` remains a repository gate and will be recorded in
  `verification.md`.
- Real cases and reports: not run; no user-visible Agent behavior is changed.
- Blocked or unexecuted cases: provider-backed Desktop complete-session case is not applicable to
  this parser-only correction.

## Interpretation

- Result and quality comparison: no prompt/output quality comparison applies.
- Confirmed failures vs attribution hypotheses: the confirmed failure was strict TypeScript
  indexing; no runtime quality defect is asserted.

## Residual Risk

- Existing deterministic tests must continue to prove line-reference and prompt-heading behavior
  after the strict capture checks.
