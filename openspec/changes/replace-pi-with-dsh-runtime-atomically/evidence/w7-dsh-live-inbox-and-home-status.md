# W7 DSH Live Inbox And Agent Home Status Evidence

Date: 2026-08-21

## Scope And Canonical Path

- The retained OpenNeko Agent composer remains mounted and accepts an ordinary follow-up while the exact DSH Session has an active turn.
- The canonical execution path is retained `InputArea` -> sender-bound Desktop Session Host -> exact Conversation/DSH binding -> bridge `Agent.followup()` -> DSH `Agent.inbox.nextTurn` -> DSH claim -> the next turn in the same Session.
- DSH owns the executable inbox and durable Message identity. Desktop Main, preload, Renderer and SQLite do not retain a shadow queue.
- Agent Home running and terminal status is rebuilt from exact DSH `currentTurn` and `turn/end` projection. Primary Sidebar only renders the existing status slot.
- Model and permission controls are frozen during an active turn. Idle model selection applies the exact DSH Session configuration before settings persistence.

## Deterministic Evidence

- Strict contract coverage accepts only the canonical enqueue request and inbox snapshot, including DSH Message identity and authoritative creation time.
- Bridge coverage protects the public DSH inbox path and rejects a second Agent, Session, queue or registry authority.
- Desktop Host coverage proves an active ordinary message calls enqueue without invoking prompt, changing Session context or applying configuration.
- Runtime coverage proves exact Conversation delegation and running -> completed Agent Home projection with sibling isolation.
- Webview coverage proves the retained composer renders DSH pending messages and removes one by exact DSH Message identity.
- Renderer coverage proves a follow-up can be submitted while the first Desktop submission promise remains pending.
- Desktop Shell coverage proves the existing navigation row renders terminal status without replacing the row or sidebar design.
- The existing `agent-runtime.workflow-controller` Evaluation suite now contains the declarative `active-session-inbox-followup` case. No direct DSH storage, Pi runtime, SQLite queue or mock provider path was added.

## UI Validation

- The running Electron development product was inspected directly with Computer Use.
- The existing OpenNeko sidebar, transcript, composer, model control, permission control and send/stop placement remain unchanged; no DSH Web/UI surface was introduced.
- The inspected Session showed canonical transcript turn terminal rows and the retained composer. Live queue pixels were not generated because doing so would require a provider request without explicit provider/model/cost authorization.
- Deterministic Webview and Desktop component tests cover active queue and sidebar running/terminal presentation.

## Verification

- Strict OpenSpec validation passed.
- Typecheck passed for `@neko/agent-contracts`, `@neko/agent-runtime`, `@neko/dsh-bridge`, `@neko/agent-webview` and `@neko/app-desktop`.
- Focused tests passed: contracts 27, runtime 33, bridge 18, Webview 18 and Desktop 93.
- Agent Evaluation key-free harness passed 45 files / 314 tests; all-suite dry run passed 26 suites / 66 cases.
- Agent boundary and storage-authority gates passed; focused production/Evaluation lint and `git diff --check` passed.
- Desktop production package build passed and verified `OpenNeko.app` for `darwin-arm64`.

## Provider-Backed Evaluation Disposition

The focused visible provider command was attempted through the canonical Evaluation entry and returned `infrastructure-blocked` before Desktop/API execution because explicit provider identity, model identity and cost authorization were not provided. No mock or fallback result is claimed.

## Residual Risk

- A real visible two-message active-turn run remains required for provider-backed release evidence and final queue pixels.
- The existing running Electron process predates some completed turns, so those historical sidebar rows do not prove live terminal notification behavior; deterministic projection and Shell tests cover the change until a newly authorized provider turn is executed.
- Repository-wide internal-versioning audit remains blocked by pre-existing dirty-worktree allowance drift outside this focused change. This implementation adds no internal version field or version-dispatch path.
