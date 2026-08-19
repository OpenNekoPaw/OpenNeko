# W4 Desktop DSH Session And Permission Cutover

## Scope

This slice replaces the Desktop Renderer Agent path with the package-owned DSH ACP projection. It does not complete Conversation creation/publication, Character Session ownership, extension inventory, reverse credential access, inbox, or real-provider acceptance.

## Canonical Path

```text
exact Conversation identity
-> sender-bound DSH Session/Permission IPC
-> preload strict contract parsing
-> DesktopDshSessionHost / DesktopDshPermissionHost
-> persistent Conversation-to-DSH-Session binding
-> ConversationDshSessionBoundClient / DshAcpProjection
-> ACP stdio DSH subprocess
```

The Renderer consumes only bounded message, Tool, turn, cancel and diagnostic events. Permission controls use the exact Conversation/DSH Session/turn/toolCall identity and only ACP-advertised option ids/kinds. Draft scenes without a Conversation do not call a Host bridge and show a local unavailable diagnostic.

## Deleted Path

- Desktop-local Agent bootstrap/send/detach contract and preload bridge.
- Agent launch and Assistant resource preload bridges.
- Renderer Agent host/launch runtime adapters and Agent Webview module preloader.
- Pi-era Agent automation IPC injection, event cursor and Tool accessory bridges.
- Entry composer Workspace/authoring callbacks that had no DSH Conversation publication path.
- Unwired Desktop Agent Entry target and Assistant Preview Main runtimes.

The architecture boundary test asserts that the DSH Session/Permission bridges exist and the retired bridge files/symbols do not.

## Deterministic Evidence

```text
pnpm --dir apps/neko-desktop typecheck
PASS

pnpm --dir apps/neko-desktop exec vitest run \
  src/renderer/DesktopAgentSurface.test.tsx \
  src/renderer/DesktopShell.test.tsx \
  src/renderer/desktop-renderer-startup.test.ts \
  src/preload/dsh-session-bridge.test.ts \
  src/preload/dsh-permission-bridge.test.ts \
  src/preload/extension-management-bridge.test.ts \
  src/architecture-boundary.test.ts
7 files / 80 tests passed
```

## Residual Risk

- DSH rc.7 has no durable Session delete, so provisional Session cleanup and canonical new-Conversation publication remain blocked.
- Character/Room Conversation adapters still require a DSH-backed lifecycle design; no throwing or Pi fallback adapter was added.
- Assistant Preview now reports its missing DSH Host Tool locally; it cannot preview resources until that Tool exists.
- Real provider/API, visible Electron interaction and graphical review were not executed by user direction and remain release blockers.
