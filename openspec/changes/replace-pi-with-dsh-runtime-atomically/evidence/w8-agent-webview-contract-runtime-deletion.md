# W8 Agent Webview, Contract And Runtime Deletion

## Deleted Product Paths

The Agent Webview package now exposes only `./extension-management/root`. The retired Chat root,
Assistant Resources root, Composer, message handlers, stores, presenters, render runtimes, standalone
Vite/Tailwind build and their dependencies were deleted. Desktop Agent messaging remains native and uses
only the DSH Session/Permission bridges.

The following Pi/Webview product contracts and runtimes were also deleted rather than translated:

- Webview-to-Host protocol, route matrix, `confirmTool`, message queue, Tab and Chat projection contracts;
- Agent launch and Assistant Resources Host IPC contracts and subpath exports;
- Draft Entry target and Assistant Resources application services;
- Pi-era message-turn, config bridge, conversation route/tab, Agent state and SubAgent Webview runtimes;
- Desktop Agent facts and old state/context projections.

The still-required LLM parameter shape moved to the focused `agent-llm-configuration.ts` contract. Existing
purpose-model types are exported from their canonical `agent-purpose-model.ts` owner. No compatibility
export, throwing stub, no-op adapter or DSH result translator was introduced.

## Deterministic Evidence

```text
pnpm --dir packages/agent/webview typecheck
PASS

pnpm --dir packages/agent/webview test
PASS: 1 file / 6 tests

pnpm --dir packages/agent/contracts typecheck
PASS

pnpm --dir packages/agent/contracts test
PASS: 40 files / 209 tests

pnpm --dir packages/agent/runtime typecheck
PASS

pnpm --dir packages/agent/runtime test
PASS: 47 files / 385 tests

pnpm --dir apps/neko-desktop typecheck
PASS

pnpm check:no-internal-versioning
PASS: 0 baseline / 0 new occurrences
```

The dependency and protocol-boundary audit also removed unused `@neko/preview-domain`,
`@neko/entity-node` and the three DSH extension API qualification packages from package manifests. Desktop
Main no longer imports `@agentclientprotocol/sdk`; ACP permission and Session update wire types are exposed
only through the package-owned `@neko/agent-runtime/acp` surface, while the Session Host projects only the
`stopReason` it consumes. The unused Agent input reference helper was deleted rather than retained as an
unreachable utility.

```text
pnpm check:unused
MIGRATION FINDINGS: 0 unused dependency, unlisted ACP dependency or unused Agent runtime file
REPOSITORY BASELINE: still fails on 6 unrelated unused files and 149 unrelated unused exports

pnpm check:agent-boundaries
PASS: 163 files

pnpm check:package-boundaries
PASS: 47 packages

pnpm check:application-boundaries
PASS: 1328 files

pnpm check:legacy-debt
PASS: 0 blocking production findings

openspec validate replace-pi-with-dsh-runtime-atomically --strict
PASS

pnpm check:openspec
PASS: 106 items

git diff --check
PASS
```

Package manifests no longer export the retired Agent Webview roots, Agent Host contracts or message
runtime. The Webview dependency closure was reduced to React, `@neko/ui`, `@neko/agent-contracts` and test
dependencies. Generic standalone Webview smoke discovery no longer treats this Desktop-imported
presentation package as an independent distributable artifact.

## Remaining Blockers

W8 is not complete. The source and production Evaluation scans now reject `agentLaunch`, `confirmTool`,
Pi authority, queue/Draft DSL and the removed projection facts. The current generated renderer bundles and
packaged `app.asar` still contain retired bridge/queue markers and therefore fail the explicit
`check:agent-retired-output` gate. They must be regenerated only after the machine release guard passes;
the old bytes cannot be accepted as release evidence or hidden through scanner exceptions.

Real provider/API and visible Electron acceptance were not executed by user direction and remain release
blockers.
