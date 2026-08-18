# Q0 ACP Subprocess Qualification

## Deterministic Result

- Exact runtime: `@deepseek-ai/dsh@0.1.0-rc.7`.
- Exact ACP bridge: workspace `@neko/dsh-bridge`, compiled before qualification against DSH `0.1.0-rc.7` public entrypoints.
- Exact protocol SDK: `@agentclientprotocol/sdk@0.25.1`, protocol 1.
- Public composition: the recovery profile uses `@deepseek-ai/dsh-base` plus the sole `@neko/dsh-bridge` ACP transport; an isolated W2 profile additionally loads the first-party `@neko/generation-dsh-plugin` and `@neko/canvas-dsh-plugin` bundles; a third isolated profile registers a deterministic Q0 provider through the public DSH `LlmAdapter` boundary. Upstream `@deepseek-ai/dsh-acp` is not installed or mounted.
- Result: subprocess boot, ACP initialize/capability negotiation, `session/new`, per-session close, two recovery restarts plus isolated W2 and Prompt-admission processes, `session/list`, `session/resume` without replay, `session/load` with standard ACP history replay, exact event replay, typed reverse Host Tool success/failure, real W2 ToolRuntime registration/delegation, standard Prompt concurrency/FIFO/queued-cancel admission, stdout JSON-RPC purity, disconnect disposal, and clean exit pass.
- Deterministic materialization: a Q0-only Cordis contributor uses public `agent/session-start`, `Session.append`, `defineTool`, `ctx.tools.register` and `ctx.tools.execute` APIs to write non-provider history and execute the reverse Host Tool fixture. It does not own ACP, Agent loop, Session store, persistence, Tool registry or product behavior.
- Provider/API contact: not performed. Standard Prompt requests use the Q0-only deterministic adapter and never contact the network or user credentials.
- User configuration: not read. The fixture replaces both `DSH_HOME` and `HOME` with one temporary directory and passes only a minimal environment allowlist.

## Exact Commands

```bash
pnpm --dir scripts/dsh-q0 install --offline --ignore-workspace --ignore-scripts
pnpm --dir scripts/dsh-q0 test
pnpm --dir scripts/dsh-q0 qualify
```

The qualifier result was:

```json
{"qualified":true,"dsh":"0.1.0-rc.7","acp":"0.25.1","protocolVersion":1,"sessionId":"redacted","jsonRpcMessages":162,"sessionRecovery":true,"historyReplay":true,"toolProgress":true,"inboxReadReplaceRemove":true,"reverseHostTools":true,"reverseHostToolFailLocal":true,"reverseHostToolCancellation":true,"reverseHostToolLateResultIsolation":true,"reverseHostToolOversizeInputRejected":true,"reverseHostToolOversizeOutputRejected":true,"reverseHostToolSuccessAfterCancellation":true,"standardPromptConcurrentAdmission":true,"standardPromptFifoAdmission":true,"standardPromptQueuedCancellation":true,"generationDomainTool":true,"canvasDomainTool":true,"processRestarts":3,"providerContacted":false,"isolatedDshHome":true}
```

## Remaining Qualification Gaps

The new bridge now covers deterministic standard ACP recovery, but these required paths remain unqualified:

- live reasoning, plan, title, and usage projection beyond the qualified Tool call/result lifecycle;
- permission and cancellation during real activity;
- pending inbox preservation across per-session close and process shutdown;
- extension inventory/readiness/configuration/diagnostics;
- additional workspace roots and client-provided MCP servers.

These gaps keep tasks 1.6 and 1.9–1.10 open. They are implementation inputs for W1-W3, not permission to restore Pi, embed Cordis, add a TS SDK runtime or create a fallback path. Recovery, Tool call/result projection, reverse Host Tool and standard Prompt admission consumers may consume tasks 1.4–1.5 and 1.7–1.8 as evidence; production inbox preservation, extension management and user-reachable crash policy remain blocked.

## Residual Risk

- Real provider/API behavior is intentionally unverified and is not release evidence.
- Clean restart proves stored-session recovery, while the isolated W2 profile proves deterministic Generation/Canvas registration and reverse delegation. The Prompt profile proves standard ACP/DSH-loop admission but not real model quality, credentials, provider behavior, permission, injected process crash policy or real domain service execution.
- The deterministic seed is Q0-only and is not part of the OpenNeko product profile.
- The reverse Host Tool fixture registers one Q0-only definition in the official DSH ToolRuntime, then executes `success → typed failure → success`. All three requests preserve exact Session/turn/call/Tool/operation identity; their standard ACP projections settle `completed → failed → completed`, proving the middle domain rejection is fail-local and no alternate handler or runtime supplies success.
- The separate W2 profile loads the packaged Generation and Canvas plugins through their DSH bundle patches and executes `openneko.generation/describe` plus `openneko.canvas/query` through `ctx.tools.execute`. This is deterministic path readiness, not provider, Desktop UI or owning-service acceptance.
- This qualification exposed and fixed a bridge projection defect: DSH domain failures are authoritative in the Tool result block's `isError`, not only in optional internal error metadata.
- This qualification also exposed and fixed an ESM runtime-closure defect: the Bridge's split Prompt admission module must use a canonical `.js` specifier so the compiled package can load in the real DSH subprocess.
- Active-session inbox read/replace/remove uses the public DSH `Agent.inbox` API and exact message identities. However, DSH rc.7 `AgentHandle.dispose()` internally invokes `cancel({ kind: 'disposed' })` without `keepInbox`, durably clearing pending messages. The bridge cannot truthfully preserve pending inbox across close/restart through public APIs; raw Session edits and parallel queue state are forbidden, so task 1.6 remains open pending an upstream public lifecycle seam or an accepted product-semantics change.
- The fixture is source-only development evidence and is not included in Desktop release artifacts.
