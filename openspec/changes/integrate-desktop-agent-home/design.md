## Current design

`@neko/agent-runtime` owns one program-level Pi conversation application authority and its independent
conversation/session/turn state. Desktop Main constructs it with credential, content, clock and persistence
ports and owns only sender-bound route adapters, Electron lifecycle and disposal. The fixed preload namespace
derives application, window, View instance, workspace and renderer session identity from the sender. Renderer messages never
choose an active workspace or inject Host identity.

Each conversation carries explicit conversation/branch/session/turn/run/Tool identities. Pi Session owns
the transcript; a portable conversation manifest owns user-visible title/branch/export topology; product
SQLite owns operational state and replaceable catalog projections. Multiple windows share the fenced
execution authority without sharing mutable UI selection.

The package-owned Agent Root consumes Conversation/Tab/Timeline/Tool/Approval/Skill projections.
Conversation restore resolves its exact persisted scope and attaches the requested conversation. The
standalone Home handoff and layout contract are superseded by `compose-desktop-workbench-scenes`; this
change retains only the package-owned runtime/controller/projection baseline. Unknown routes, missing
config, stale identity and unavailable capabilities fail visibly.

## Remaining gate

First move remaining controller/AppHost business state from Desktop Main into the Agent runtime public
application entry and delete the app-owned implementation. Add deterministic facts proving the shared
controller/Pi/session/permission/Tool/Skill path, then run
Content Project → conversation create/restore → Pi turn → Tool/Skill → Timeline projection in an isolated
Electron fixture. Use a real provider only where behavior/routing requires it; key-free harness results
remain infrastructure evidence only.
