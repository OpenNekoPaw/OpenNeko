# Agent Evaluation: AI SDK video task lifecycle

Authoring decision: update and reuse `agent-runtime.workflow-controller` GenerationJob coverage because
provider/model selection, asynchronous recovery and artifact delivery can affect the Agent Tool path.

The positive case must prove one approved Generation Tool call creates one exact Workspace
GenerationJob, records the selected provider/model and provider task before observation, reaches one
terminal result and commits one durable artifact. The failure case must prove an unavailable or invalid
H3/Seedance binding fails visibly without invoking another provider, model, adapter or Workspace.

Deterministic package tests own request mapping, task persistence ordering, restart reconciliation and
poisoned MiniMax V1 path. `pnpm test:agent:eval` is required for indexed suite/schema/harness readiness but
does not prove a real provider call. Real H3 or Seedance execution requires explicit cost authorization,
provider credentials, network and a configured Desktop model; absent those inputs, record
`infrastructure-blocked` rather than substituting mock output.

## Recorded result

`pnpm test:agent:eval` passed 45 files and 314 tests; its dry run indexed 27 suites and 84 cases,
including the existing `agent-runtime.workflow-controller` GenerationJob coverage. This proves only
schema, suite and harness readiness. Real H3/Seedance execution is `infrastructure-blocked` because no
explicit cost authorization or usable provider credentials were supplied; no paid provider call was made.
