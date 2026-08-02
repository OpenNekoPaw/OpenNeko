# Agent Evaluation: Desktop Cut context handoff

Only the structured Cut → Agent context handoff changes Agent behavior. The canonical path starts from
an explicit Electron Desktop Cut document/session/revision and selected Timeline identities, projects
`AgentContextPayload`, then enters the normal Desktop Agent input path. Required evidence includes exact
target identity, selected media/Clip roles and zero active/recent-editor or retired-host fallback.

Editing, playback, save and export remain deterministic Domain/Desktop/Electron acceptance and do not
require provider-backed Evaluation unless their implementation changes Agent routing or prompts.

The focused case is
`agent-runtime.workflow-controller/cut-context-handoff`. It supplies one explicit Clip payload through
the public Desktop Agent bridge, requires the package-owned context enhancement and Pi Session path,
and rejects active/recent-editor, `executeAIAction`, direct Cut model-call and direct Pi mutation
fallbacks. Validate its contract without provider access with:

```bash
node scripts/agent-eval/all-suite-dry-run.mjs \
  --suite agent-runtime.workflow-controller \
  --case cut-context-handoff
```

A real run additionally requires explicit provider/model/configuration/credential and cost
authorization. Missing authorization is an `infrastructure-blocked` result, not behavior evidence.

## 2026-08-03 result

`pnpm test:agent:eval` passed 245 harness tests and dry-ran 22 suites / 52 cases, including
`agent-runtime.workflow-controller/cut-context-handoff`. This proves schema, routing, artifact and
no-fallback structure without claiming provider behavior. No real provider case was launched because
the required provider/model/credential and explicit cost authorization were not supplied; task 4.2b
therefore remains open only for that external evidence.
