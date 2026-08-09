## Evaluation Disposition

This change affects Agent launch intent, exact Workspace binding, configuration visibility, and first
submit gating. It therefore requires Agent Evaluation coverage in addition to deterministic Webview
tests and visible UI acceptance.

### Reused indexed coverage

- Suite: `agent-runtime.launch-binding`
- Assistant lane: unbound Entry first submit proves no active/current/recent Workspace is consulted.
- Workspace lane: exact target, grant, binding receipt, Conversation owner, and Scene handoff evidence.
- Forbidden paths: stale binding, mismatched grant, unbound fallback, and active Project inference.

The four-mode segmented control, blocked-send copy, input editability, responsive layout, and
Character/World unavailable presentation are deterministic UI behavior. They SHALL be asserted by
component tests and visible Electron acceptance, not by an LLM Judge.

### Provider-backed evidence

A real-provider visible Desktop run is required for Assistant and Workspace first submit when explicit
model/cost authorization is available. The matching hidden full-Desktop lane may supplement the visible
run for transcript and runtime evidence but cannot replace the user-operable Home path. If authorization
is absent, report `infrastructure-blocked` with the exact suite/case gap; key-free or dry-run success only
proves harness and artifact readiness.

### Adjacent regression matrix

- Entry Draft reopen preserves unsent input and canonical experience presentation.
- Switching modes does not cancel or redirect an already running Conversation Turn.
- Switching Conversations and Workspace Scenes preserves exact identity and transcript isolation.
- Character/World selection creates no Conversation or domain Run while their providers are unavailable.
