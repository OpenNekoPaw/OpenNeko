# Agent Evaluation: Generation package path

The canonical case starts from a normal Desktop Agent or Canvas generation action, resolves one explicit
purpose/model binding, creates one `@neko/generation` Job and publishes one stable artifact. Required
facts include provider/model, Job identity, terminal state, artifact identity and zero Platform/fallback
counters. Do not run without explicit cost authorization.

Authoring decision: update and reuse `agent-runtime.workflow-controller` for Agent Tool behavior. Add
deterministic application/bridge coverage for direct generation because the current Evaluation driver has
no direct-generation control operation; do not add an Evaluation-only shortcut. A visible Desktop direct
control case remains infrastructure-blocked until the public driver can operate that real control and
capture the same Workspace owner/Job facts.

## 2026-08-08 implementation evidence

- Direct image/video/audio composer submissions use `DirectGenerationOperationPort` before any
  Conversation lookup, Draft submit, optimistic transcript update or Agent message dispatch. The old
  non-Agent `sendMessage` route is poisoned before message persistence or Agent execution.
- `WorkspaceGenerationApplicationRuntime` returns one exact `GenerationJobPort` to both Agent Tool and
  direct-operation consumers. A Workspace identity reused with another authorized root is rejected.
- Desktop resolves Draft operations through the exact launch catalog and Workspace grant, and Session
  operations through the exact live Desktop Agent connection. Stale, cross-Window and cross-Workspace
  identities fail before Job submission. Provider/model validation occurs before Job creation and has no
  provider, model, entry or Workspace fallback.
- The direct projection preserves the terminal Job id, purpose, provider/model and committed
  `generated-output` locators. Agent Tool Evaluation continues to use the indexed
  `agent-runtime.workflow-controller` GenerationJob cases; direct operation remains covered by
  deterministic package, Webview, preload and Desktop bridge tests because no public Evaluation driver
  operation exists for that control.

Key-free command:

```bash
pnpm test:agent:eval
```

Result: 44 test files and 294 tests passed; the all-suite dry-run validated 23 suites and 60 cases,
including 12 indexed `agent-runtime.workflow-controller` cases. This proves harness, strict schema,
suite discovery and hard-gate readiness only. It does not execute a provider, prove model behavior,
produce a real Generation Job/artifact, or satisfy visible Desktop acceptance.

## Blocked provider and UI evidence

Task 1.9 and authoritative UI validation remain blocked because no explicit provider/model/cost
authorization was supplied and the public Desktop Evaluation driver cannot yet operate the direct media
control. No real API or provider-backed visible Desktop run was attempted. Component and bridge tests
cover running, terminal, error, exact binding and adjacent Agent-message behavior, but they are not visual
pixel evidence and must not be reported as UI acceptance.
