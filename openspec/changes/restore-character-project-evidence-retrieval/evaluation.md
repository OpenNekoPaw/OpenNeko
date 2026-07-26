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

The VS Code-only product path was validated in a rebuilt `Debug Dev (All)` Extension Development Host
against the isolated `/Users/feng/Git/neko-test` fixture:

- the Header role-session menu exposed the confirmed `小橘` Entity;
- a new Character Dialogue session accepted `今天去哪里了？`;
- the completed response cited `猫猫小学`, `毛线球`, and the new friend `小灰`;
- those facts match `cases/test.fountain` lines 61, 111, 136, and 161.

This is VS Code Host runtime evidence, not a replacement for the blocked TUI Evaluation.

## Verification

- `pnpm --filter @neko/chara test:run`: passed, 10 files / 90 tests.
- `pnpm --filter @neko/chara typecheck`: passed.
- `pnpm --filter @neko/search test:run`: passed, 12 files / 57 tests.
- `pnpm build`: passed.
- `pnpm check` and `pnpm check:unused`: passed.
- `pnpm test:agent:eval`: passed, 39 files / 280 tests and 24 suites / 53 dry-run cases.
- strict OpenSpec validation and scoped `git diff --check`: passed.
- `pnpm test`: blocked by the concurrent Generation boundary test scanning the deleted
  `packages/neko-types/src/domain-activity` directory; Chara and Search suites passed.
- `pnpm check:legacy-debt`: blocked by four pre-existing `rejectLegacyMediaPathRequest` matches in
  `packages/neko-quality`; the scoped Chara change adds no blocking legacy-debt match.

## Quality Review

- Risk is L3 because the change affects Character AI evidence and provider/model readiness.
- Entity remains stable identity owner, Search remains locator owner, and Chara owns safe content
  materialization, relevance, budget, prompt injection, and role-session failure projection.
- Existing Entity/Search/Content and Chara evidence adapters were reused; no parallel Dashboard
  reader, workspace search, model switch state, cache/path service, or Agent loop was added.
- Controller regressions prove both profile-launch and turn evidence failures stop before session/tab
  or responder success. The deterministic path test proves the exact new adapter chain reaches the
  responder prompt.
- Findings: no remaining scoped blocking or suggestion finding after launch-time evidence errors were
  projected explicitly by both controllers.

## Residual Risk

- Lexical CJK bigrams improve bounded relevance but do not provide semantic memory or full-text Search.
- Provider-backed response quality remains outside deterministic evidence and requires the available
  Character runtime plus configured purpose model.
- The rebuilt Webview marked the role turn complete but left the message input/send control disabled.
  This is an overlapping Tab/Projection terminal-state defect and does not invalidate the observed
  project-evidence response; multi-turn UI acceptance remains open in that owning change.
