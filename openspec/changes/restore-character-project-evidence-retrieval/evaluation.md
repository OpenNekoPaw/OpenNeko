# Evaluation Evidence

## Evaluation Scope

- Change: restore project-backed Character evidence after the Chara ownership refactor.
- Decision: `create` a target-scoped `character.role-session.project-evidence` case.
- Canonical path: stable Entity identity -> identity-only Project Search -> safe project-local text read
  -> Chara ranking and budget -> Character responder system prompt.
- Forbidden fallback: turn-question or internal Entity-ID Search queries, Dashboard evidence, broad
  workspace search, Agent memory, Agent/default model selection, or responder invocation after an
  Entity/Search dependency failure.

## Cases

- Positive: selected Character `小橘` discovers its Fountain scene through canonical name/alias
  queries, reads the project-local scene text, ranks `今天在学校` for `今天去哪里了？`, and injects the
  bounded evidence into the current role-session prompt.
- Boundary: a missing Entity or unavailable Project Search rejects the turn before responder
  invocation.
- Empty project state: a successful identity-scoped search with no matching scene produces explicit
  empty evidence and does not activate a fallback.

## Available Evidence

- Core regressions assert exact identity-only Search queries, stable result dedupe, CJK relevance,
  safe path materialization, and bounded evidence.
- Host regressions assert script-backed occurrences/profile facts and fail-visible controller
  behavior.
- A controller path regression composes the real Chara evidence strategy and proves Entity identity,
  Search locator, safe text read, ranking, evidence bundle, and responder system prompt participation.
- `pnpm test:agent:eval` is required as key-free harness validation only; it is not real Character
  behavior acceptance.

## Real Execution

Real Evaluation remains blocked because the canonical TUI has no Character role-session input
operation or bounded Chara evidence facts. Direct strategy construction, a mock responder, or ordinary
Agent chat input must not be recorded as a provider-backed Evaluation pass.

The current VS Code-only product path must instead be validated in an Extension Development Host
against an isolated synthetic project. That runtime check is separate evidence and does not remove the
TUI Evaluation blocker.

## Residual Risk

- Lexical CJK bigrams improve bounded relevance but do not provide semantic memory or full-text Search.
- Provider-backed response quality remains outside deterministic evidence and requires the available
  Character runtime plus configured purpose model.
