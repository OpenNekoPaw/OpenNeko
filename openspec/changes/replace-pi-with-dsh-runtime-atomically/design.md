## System boundary

Desktop Main supervises an isolated DSH subprocess and communicates through the canonical ACP boundary. DSH owns Agent execution, Session context, Tool/Skill/MCP runtime, queue, and transcript mechanics. OpenNeko application services own product Conversation identity, permissions, domain bindings, durable projections, and Host trust decisions.

## Core invariants

- One production Agent execution path exists; Pi and shadow Agent runtimes cannot remain reachable.
- ACP messages bind exact process, Session, Conversation, turn, Tool call, permission, and domain context identities.
- Reverse Tools cross Host trust only through typed, validated, owner-qualified requests.
- Credentials, raw paths, Host handles, and private product state do not enter portable DSH content.
- Process crash, restart, cancellation, malformed messages, and individual extension failures remain fail-visible and locally isolated.
- Protected user records are preserved while obsolete runtime/config/cache authorities are removed from product reachability.

## Product composition

Desktop projects DSH execution into the existing Agent UI and domain workflows without creating a second product shell or domain authority. Skill and MCP management reflect the effective DSH runtime. Domain authoring remains owned by each domain service.

## System acceptance

The replacement is complete when normal conversation, multi-turn context, Tool/approval, Skill/MCP, generation/domain workflows, queue, restart/recovery, and transcript projection operate through the single DSH/ACP path and no Pi success path remains.

## Non-goals

This change does not embed arbitrary extension code in Electron Main, add a remote Agent server, or preserve Pi compatibility.
