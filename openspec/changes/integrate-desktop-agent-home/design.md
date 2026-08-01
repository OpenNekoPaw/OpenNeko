## Current design

Desktop Main owns one program-level Pi conversation authority and composes responsibility-specific
route handlers. The fixed preload namespace derives application, window, view, workspace and renderer
epoch from the sender. Renderer messages never choose an active workspace or inject Host identity.

Each conversation carries explicit conversation/branch/session/turn/run/Tool identities. Pi Session owns
transcript; product SQLite owns catalog and replaceable projections. Multiple windows share the fenced
execution authority without sharing mutable UI selection.

The package-owned Agent Root consumes Conversation/Tab/Timeline/Tool/Approval/Skill projections. Home
handoff switches the exact Project View, waits for catalog hydration and activates the requested
conversation. Unknown routes, missing config, stale identity and unavailable capabilities fail visibly.

## Remaining gate

Add deterministic facts proving the shared controller/Pi/session/permission/Tool/Skill path, then run
Content Project → conversation create/restore → Pi turn → Tool/Skill → Timeline projection in an isolated
Electron fixture. Use a real provider only where behavior/routing requires it; key-free harness results
remain infrastructure evidence only.
