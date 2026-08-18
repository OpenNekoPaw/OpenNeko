# Single Production Agent Path Poison

The Agent boundary gate scans the real Desktop production Agent/DSH source set and Desktop manifest. Desktop
may consume only the package-owned ACP application/transport boundary. The gate rejects:

- Pi runtime dependencies;
- DSH TypeScript or Python SDK clients;
- embedded Cordis or direct `ctx.agents` ownership in Desktop;
- Electron `ELECTRON_RUN_AS_NODE` and `process.execPath` Node launch paths;
- retired `agentLaunch`, `confirmTool` or `agentAutomation` direct runtime bridges.

Cordis and public `ctx.agents` remain allowed inside the separately packaged official DSH bridge/plugin
runtime, where they are the intended external runtime boundary. The poison check therefore enforces runtime
ownership rather than banning valid DSH plugin implementation APIs.

```text
pnpm check:agent-boundaries
PASS: 7 poison/contract tests, 13 extension evidence paths, 163 production files, 0 findings

pnpm --dir apps/neko-desktop exec vitest run \
  src/main/desktop-dsh-agent-runtime.test.ts \
  src/main/desktop-dsh-runtime-bootstrap.test.ts \
  src/main/desktop-dsh-subprocess-supervisor.test.ts
PASS: 3 files / 17 tests
```

The runtime matrix rejects a missing official bridge before subprocess construction, rejects a malformed ACP
frame through the default package-owned client and disposes the sole subprocess/handler assembly, and proves
unexpected exit, spawn failure and explicit restart never start a fallback client. Real provider behavior and
the broader backpressure/crash recovery product matrix remain separate W1/Evaluation work.
