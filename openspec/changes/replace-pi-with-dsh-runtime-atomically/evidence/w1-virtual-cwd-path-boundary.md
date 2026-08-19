# W1 Virtual CWD And Path Boundary

## Canonical Path

Desktop creates one DSH-owned virtual working directory at `userData/dsh/workspace`. The same absolute
directory is used as the subprocess cwd and injected once into the package-owned ACP application client.
Conversation application APIs no longer accept cwd, so Workspace selection and physical Workspace paths
cannot participate in Session lifecycle identity.

The ACP client overwrites any runtime caller-supplied cwd on `session/new`, `session/list`, `session/load`
and `session/resume`. The official DSH bridge independently derives the expected cwd from the subprocess
and rejects every other lifecycle cwd without echoing the rejected path. DSH Session metadata therefore
stores only the virtual cwd. Catalog entries with missing or mismatched cwd fail locally as diagnostics;
the mismatched physical path is not projected.

Renderer `DshSessionHostRequest`, `DshSessionHostProjection` and event contracts contain no cwd or physical
Workspace path. Domain Tools continue to receive exact Workspace authority only inside Host adapters; that
separate trust-boundary path is not Session metadata or model-authored lifecycle input.

## Negative Evidence

- A JavaScript caller bypassing TypeScript and supplying `/Users/private/real-workspace` is overwritten
  before all four ACP lifecycle requests; captured connection calls contain only the virtual cwd.
- A relative configured virtual cwd is rejected before ACP connection creation or handshake.
- A DSH profile Session carrying `/Users/private/project` is excluded from the catalog; its diagnostic
  does not contain that path.
- Missing and stale bindings remain fail-local, and a sibling Conversation still loads by exact identity.

## Verification

```text
pnpm --dir packages/agent/runtime exec vitest run \
  src/acp/dsh-acp-application-client.test.ts \
  src/application/conversation-dsh-session-client.test.ts \
  src/application/conversation-dsh-session-application.test.ts
PASS: 3 files / 31 tests

pnpm --dir packages/dsh-bridge test
PASS: 1 file / 9 tests

pnpm --dir apps/neko-desktop exec vitest run \
  src/main/desktop-dsh-agent-runtime.test.ts \
  src/main/desktop-dsh-runtime-bootstrap.test.ts \
  src/main/desktop-dsh-session-host.test.ts
PASS: 3 files / 11 tests
```

No real provider/API or visible Electron UI validation was run by current development direction. Those
release acceptance lanes remain blocked and this evidence claims only the deterministic lifecycle/path
contract.
