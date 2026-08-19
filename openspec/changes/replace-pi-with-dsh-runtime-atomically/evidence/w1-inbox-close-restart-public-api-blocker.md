# W1 Inbox Close And Restart Public API Blocker

## Public API Audit

DSH rc.7 exposes `Agent.cancel(cause, { keepInbox: true })`, which preserves pending `nextTurn` and
`nextStep` messages for an explicit cancellation. It separately exposes `AgentHandle.dispose()` with no
options. The public handle is the only lifecycle capability that stops/drains the loop, unregisters the
Agent and Session, and unwinds its scoped owner.

The installed rc.7 implementation of that public handle unconditionally invokes the internal Agent
machine's disposed cancellation without `keepInbox` before teardown. The Agent loop clears both inbox
partitions and appends the durable inbox splice. A preceding explicit keep-inbox cancellation therefore
cannot protect the messages from handle disposal.

## Rejected Workarounds

- Not disposing the handle leaks the active Agent/Session and its scoped resources, so ACP close and
  subprocess quiescence would report success while the runtime remains owned.
- Editing raw Session events or persistence files would make OpenNeko a second Session/queue authority.
- Copying pending messages into an OpenNeko shadow queue and reinserting them after resume creates a
  parallel success path and changes exact DSH Message identity.
- Importing private `dsh-agent-loop` internals would violate the frozen public API and packaged closure
  boundary.

## Required Upstream Seam

Completion requires a public DSH lifecycle operation that both disposes the exact `AgentHandle` and
preserves the durable inbox, or a public disposal option with that invariant. Until then, active-session
snapshot/replace/remove remains usable, while close/restart inbox preservation and tasks 1.6/4.6 remain
open and release-blocking.

This is a dependency-contract audit only. No direct ACP, mock provider, or hidden UI run is claimed as
Agent behavior evidence.
