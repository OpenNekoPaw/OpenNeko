# W8 Host Controller Deletion

## Deleted Path

The package-owned `runtime/host-controller` directory, public package subpath and runtime barrel exports were deleted atomically. This removes the retired Webview message controller for Conversation, queue, Tool confirmation, configuration, Skill, content and projection effects. Its only remaining external consumer was a Desktop test-only content-effects path, which was deleted rather than migrated to another Agent controller.

No compatibility export, throwing stub or DSH translation adapter was added.

## Deterministic Evidence

```text
pnpm --dir packages/agent/runtime typecheck
PASS

pnpm --dir packages/agent/runtime test
PASS: 54 files / 485 tests

pnpm --dir apps/neko-desktop typecheck
PASS

pnpm --dir apps/neko-desktop exec vitest run \
  src/architecture-boundary.test.ts \
  src/renderer/DesktopAgentSurface.test.tsx \
  src/preload/dsh-session-bridge.test.ts \
  src/preload/dsh-permission-bridge.test.ts
PASS: 4 files / 29 tests

pnpm check:agent-boundaries
pnpm check:no-internal-versioning
pnpm check:package-boundaries
PASS
```

The repository source scan contains no `runtime/host-controller` import, package export or directory. The subsequent Webview/contracts slice deleted product `confirmTool` and queue contracts; remaining occurrences are confined to the not-yet-migrated Evaluation driver and continue to block W8 completion. See `w8-agent-webview-contract-runtime-deletion.md`.
