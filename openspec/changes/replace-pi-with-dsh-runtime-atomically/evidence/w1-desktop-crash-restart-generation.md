# W1 Desktop Crash And Restart Generation

## Stable Runtime Owner

Desktop now exposes one stable Agent runtime facade over exactly one current subprocess/ACP-client
generation. The persistent Conversation-to-DSH-Session binding store and Renderer-facing Host facade keep
their identity; the subprocess, ACP connection, projection and pending permission state do not.

When either the subprocess or ACP connection closes unexpectedly, the generation is retired atomically:

- the stable facade becomes unavailable before another operation can delegate;
- all process-local ACP projection state is discarded;
- every pending permission is cancelled and the reusable permission owner is reset;
- the exact old subprocess is disposed;
- no child process or alternate client starts implicitly.

Explicit `runtime.restart()` waits for retirement, resets a manually stopped generation when necessary,
starts only the same verified supervisor, performs the same ACP handshake, and publishes the new generation
only after connection success. A failed handshake disposes that child and leaves the stable facade
unavailable. Persistent exact bindings remain unchanged, so sibling Conversation records are neither
deleted nor rebound.

## Product Management Path

The stable runtime owner also owns one canonical runtime-control projection. It publishes only
`running`, `restarting`, or fail-visible `unavailable` with a bounded diagnostic. A sender-bound Main
Host exposes status and explicit restart over typed IPC; preload strictly decodes both results and
events. Renderer keeps the current Conversation and transcript mounted, disables new runtime actions,
shows the exact diagnostic, and offers one explicit restart control. It never infers process state from
a failed Session call and never starts another supervisor or client.

## Negative Evidence

- Injected crash makes stable `listSessions` reject with `runtime is unavailable`.
- Old Session projection events are absent before restart/replay.
- Restart starts/connects exactly one second generation and preserves the same SQLite binding.
- Restart handshake failure starts no third process and cannot restore a fallback client.
- Crash cleanup failure remains visible through restart and final disposal instead of publishing a new
  generation or being swallowed.
- Permission reset crossing an asynchronous binding lookup rejects with `DSH_PERMISSION_OWNER_RESET`;
  pending permissions resolve cancelled and the same owner remains reusable afterward.
- Runtime state tests prove crash publishes `unavailable`, explicit restart publishes
  `restarting -> running`, and handshake failure publishes `desktop-dsh-runtime-restart-failed`.
- Main Host rejects stale sender identity before restart; preload rejects unknown runtime fields;
  Renderer preserves transcript, disables composer and keeps failed restart diagnostic visible.

## Verification

```text
pnpm --dir apps/neko-desktop typecheck
PASS

pnpm --dir apps/neko-desktop exec vitest run \
  src/main/desktop-dsh-agent-runtime.test.ts \
  src/main/desktop-dsh-runtime-host.test.ts \
  src/main/ipc-dsh-runtime.test.ts \
  src/preload/dsh-session-bridge.test.ts \
  src/renderer/DesktopAgentSurface.test.tsx \
  src/architecture-boundary.test.ts
PASS: 6 files / 42 tests

pnpm --dir packages/agent/contracts exec vitest run \
  src/dsh-runtime-host.test.ts \
  src/dsh-session-host.test.ts
PASS: 2 files / 4 tests

pnpm --dir packages/agent/runtime exec vitest run \
  src/application/dsh-permission-owner.test.ts \
  src/acp/dsh-acp-projection.test.ts
PASS: 2 files / 21 tests
```

The deterministic product management path is complete and Pi-free, so task 1.10 is closed. Real
provider/API, authoritative visible Electron UI and release/package validation remain unexecuted and
release-blocking; component tests are not visual acceptance evidence.
