# Agent Evaluation Evidence

## Applicability and disposition

- Applicability: required because AgentSession lifecycle and Agent Home projection change.
- Case disposition: `extend` the existing isolated Desktop `desktop-project-sidebar-management` scenario rather than add a provider/model case. Conversation archive is an explicit user lifecycle command and does not execute a prompt or select a Provider/model.
- Canonical path assertion: exact OpenNeko UI navigation identity reaches the DSH-bound Session archive extension, then Agent Home is rebuilt from the DSH archive projection.
- Forbidden fallback assertion: no Session close/delete, raw DSH file mutation, Renderer-local hiding, Pi runtime or retired delete IPC can produce success. SQLite removal is permitted only for a user-requested archive of an exact stale binding after the canonical DSH Session catalog proves the Session absent; the catalog/context/binding tuple is removed in one transaction.

## Evidence and blocker

Deterministic path tests and the real DSH Q0 profile prove the archive boundary, idempotency and restart recovery. The stale-record extension adds path-level evidence that valid Sessions never enter local cleanup, stale exact bindings never invoke DSH archive, and binding/catalog races roll back without sibling mutation. A visible complete Desktop execution was attempted with:

`pnpm test:local:ui --scenario desktop-project-sidebar-management`

The runner did not start the application because development process `6920` already owns this checkout's Vite bundle. The report contains zero UI checkpoints and therefore is not Agent behavior acceptance evidence. The existing process was preserved to avoid disrupting an active user runtime.

Residual risk: the exact user click-to-Home-refresh path still requires a visible Desktop rerun after the existing development process exits.
