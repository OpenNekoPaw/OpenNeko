# Agent Evaluation: adopt-pi-agent-runtime

## Current Desktop scope

- Canonical path: Electron Desktop Agent surface → sender-bound Main controller → conversation-scoped
  Pi Agent → Pi provider or product Tool → Pi Session and Desktop projection.
- Forbidden paths: legacy AgentSession/Executor, Platform chat/auth adapter, Vercel AI SDK chat,
  legacy Skill activation, Journal transcript authority, nested model fallback, mock provider, or a
  retired Host composition root.
- Deterministic coverage owns Pi runtime identity, Tool routing, permission, Skill receipt, session,
  lease, credential redaction, cancellation, and no-fallback assertions.

## Remaining acceptance

The change remains open only for task 5.5: measure the production Desktop Agent bundle and startup,
audit Pi/provider licenses, credential and OAuth boundaries, cancellation, and path disclosure, then
record residual risk. A key-free harness or browser-only render does not replace a packaged Electron
Desktop measurement.

If provider credentials, network, OAuth callback support, or a packaged target are unavailable, the
result must be recorded as infrastructure-blocked. No TUI, VS Code, mock-provider, or direct-turn
substitution counts as acceptance.
