# Agent Evaluation

## Scope

- Decision: `update` the existing `agent-runtime.prompt-composition` suite because removing Mermaid
  and fenced-JSON instructions changes the canonical base prompt seen by real Agent turns.
- User behavior: a request for a named Markdown document returns ordinary Markdown and does not emit
  the retired NEKO/JSON composite transport.
- Canonical path: Desktop-owned complete session -> base prompt composition -> Pi turn -> final
  assistant Markdown.
- Forbidden fallback: no Mermaid feedback/SVG protocol, Markdown fence parsing, typed-artifact
  promotion, alternate Agent runtime, or mock final answer may produce success.

## Cases

- Updated suite: `agent-runtime.prompt-composition`.
- Added case: `named-markdown-without-fenced-transport`.
- The active prompt/Skill composition change continues to own the suite target hash; this cleanup only
  adds its regression case and does not stage that concurrent composition implementation.
- Deterministic coverage additionally proves that both localized base prompts omit Mermaid guidance
  and retired fenced-transport markers, removed Webview messages fail decode, Markdown-like JSON is
  not collected as a typed artifact, and typed artifact/Tool validation remains canonical.
- No new runtime observability is required; existing prompt-fragment and final-answer facts are
  sufficient for this behavior.

## Verification

- Key-free harness: validate the new case and indexed case count with `pnpm test:agent:eval` against the
  isolated cleanup commit tree.
- Focused dry-run: `agent-runtime.prompt-composition / named-markdown-without-fenced-transport` passed
  strict selection and schema validation without provider execution.
- Real provider case: requires explicit provider/model identity and cost authorization; absence of that
  authorization is an infrastructure blocker and must not be replaced with a mock or direct turn run.

## Foundational Matrix

- Basic real conversation: affected only at base-prompt output behavior; covered by the focused case
  when authorized.
- Multi-turn, compaction, owner/application reopen, generation recovery, conversation switching, and
  conversation-scoped isolation: unaffected because this change does not alter session, persistence,
  queue, projection, artifact identity, or task lifecycle contracts.

## Residual Risk

- Until the focused case runs through the complete Desktop session with a real provider, deterministic
  tests and key-free validation prove contract removal but do not prove model adherence.
