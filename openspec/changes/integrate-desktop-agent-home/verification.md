# Verification

Date: 2026-07-29

## Repeated Bootstrap Regression

- User-visible symptom: the package-owned Agent Root reported
  `DesktopAgentContractError: Unknown Desktop Agent connection` when sending its initial messages.
- Root cause: React StrictMode repeated the exact Desktop Agent bootstrap. Main created a new
  connection for the same owner and epoch and disposed the connection that an in-flight bootstrap
  response could still publish to preload.
- Canonical fix: the Desktop Agent bridge now treats an exact Application/Window/Project/Workspace/
  View/ViewEpoch/RendererEpoch bootstrap as idempotent, returns the existing connection and refreshes
  its event publisher. A renderer or View epoch advance still creates a new connection and disposes
  the stale controller effects.
- Red-capable regression command:
  `pnpm --filter @neko/app-desktop exec vitest run src/main/desktop-agent-bridge-runtime.test.ts`.
  Before the fix, the StrictMode case failed because the second bootstrap returned `connection-2`
  instead of `connection-1`; after the fix it passes.

## Durable Closed Conversation Context Regression

- User-visible symptom after the bootstrap repair: Agent Root mounted, then reported
  `Desktop Agent conversation '<id>' is not open in workspace '<id>'`.
- Root cause: the Webview legitimately requests context token count while hydrating a durable
  Conversation, but Desktop routed that read-only query through `requireConversation`, which only
  recognizes process-local Pi runtime owners.
- Canonical fix: `@neko/agent` now exposes its Pi context token estimator. Desktop uses the live owner
  when one exists, otherwise builds the authoritative active-branch context and estimates it without
  creating a model runtime or execution lease.
- Red-capable regression command:
  `pnpm --filter @neko/app-desktop exec vitest run
  src/main/desktop-agent-app-host-composition.test.ts`.
  Before the fix, the cold durable Conversation case rejected with the same `is not open` error;
  after the fix it resolves to the persisted context token count.

## Canonical Tab / Projection Ordering Regression

- Runtime symptom after creating a Conversation: the Agent Root remained interactive, but logged
  `Projection frame targets unknown Tab binding tab-<timestamp>`.
- Root cause: Desktop posted `activeConversation` before its canonical `tabState`. The Webview
  therefore generated a temporary timestamp Tab from the active snapshot, attached projection to
  it, then replaced it with the Host-owned Tab identity.
- Canonical fix: every Host-owned ordinary Conversation mutation now posts the revised Tab state
  before the active Conversation snapshot. The Webview creates its render/projection runtime from
  the stable Host identity before activation.
- Red-capable regression command:
  `pnpm --filter @neko/app-desktop exec vitest run
  src/main/desktop-agent-controller-composition.test.ts`.
  Before the fix the route order was `conversationList → activeConversation → tabState`; after the
  fix it is `conversationList → tabState → activeConversation`.

## Validation

- `pnpm --filter @neko/app-desktop exec vitest run
  src/main/desktop-agent-app-host-composition.test.ts
  src/main/desktop-agent-controller-composition.test.ts
  src/main/desktop-agent-bridge-runtime.test.ts
  src/renderer/DesktopAgentSurface.test.tsx` — 4 files, 23 tests passed.
- `pnpm --filter @neko/agent exec vitest run
  src/pi/__tests__/conversation-runtime.test.ts
  src/pi/__tests__/pi-public-api-characterization.test.ts` — 2 files, 18 tests passed.
- `pnpm --filter @neko/app-desktop typecheck` — passed.
- `pnpm --filter @neko/agent typecheck` — passed.
- Real Electron development runtime — restarted with the changed Main bundle; package-owned
  Agent Root mounted, a new Conversation was created, composer input enabled Send, input was
  cleared without sending a provider request, and the previous unknown-connection, closed-runtime
  and unknown-Tab-binding diagnostics did not recur.

## Resizable Workbench Panels

- Shared primitive: `useResizable` now reports the final clamped size exactly once when pointer up,
  pointer cancel or capture loss ends a resize session; `ResizeHandle` exposes a localized accessible
  label.
- Shared Workbench: `ControlledWorkbenchShell` owns only the transient drag size for primary, left,
  right and Timeline zones. It updates the grid continuously, renders no separator for hidden zones
  and delegates only the final size to the Host adapter.
- Desktop ownership: final primary and Timeline sizes update their exact Workbench slices. A moved
  Agent/resource dock keeps its owner width; a same-side Agent/resource stack updates both owners to
  the single displayed width. Bounds come from exported `DESKTOP_WORKBENCH_LIMITS`.
- Path-level regression:
  `pnpm --filter @neko/ui test` — 35 files / 153 tests passed, including live grid resize and one
  final callback;
  `pnpm --filter @neko/app-desktop test` — 36 files / 157 tests passed, including exact owner mapping.
- Type gates:
  `pnpm --filter @neko/ui check` and
  `pnpm --filter @neko/app-desktop typecheck` — passed.
- Repository gates:
  `pnpm build` — 9 build tasks passed, including Electron production packaging;
  `pnpm check` — unused/dependency checks passed;
  `pnpm check:quality` — all architecture, strictness, boundary, orchestration and OpenSpec gates
  passed;
  `openspec validate integrate-desktop-agent-home --strict` and `git diff --check` — passed.
- Electron runtime drag validation is blocked because macOS is locked and the accessibility runtime
  cannot inspect or operate the OpenNeko window. No real pointer-drag screenshot or persisted-reload
  claim is made for this run.

## Remaining Change Gates

The existing Phase 1 Agent change still intentionally leaves tasks 6.1, 6.4 and 6.5 open. The user
excluded VS Code runtime testing while Desktop is under development, and no provider-backed Pi turn
or Tool approval is claimed by this focused lifecycle regression.
