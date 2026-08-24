## Context

OpenNeko separates a Draft presentation from a durable Conversation. A Draft has an exact Agent Surface and optional Workspace binding, but intentionally has no `conversationId`. DSH command definitions are Agent-scoped because the mounted preset can shadow global commands; user-invocable Skills are also resolved by the DSH catalog. The existing bridge exposes only `readInputCatalog(sessionId)`, and Desktop suppresses the read when a Conversation is absent.

The result is not a DSH limitation: it is an OpenNeko adapter restriction. Creating an OpenNeko Conversation merely to populate a menu would corrupt product lifecycle semantics, while caching or rebuilding the catalog in Desktop would create a second authority.

## Goals / Non-Goals

**Goals**

- Expose the effective DSH preset command and Skill catalog before the first turn.
- Keep Draft, Conversation and DSH Session identities distinct.
- Preserve one canonical execution path: first submission creates and binds the exact durable Conversation/DSH Session, then executes against that Session.
- Fail visibly and locally when pre-turn discovery fails.

**Non-Goals**

- Do not create a durable Conversation or persisted DSH Session on Draft open.
- Do not execute a command or Skill against a catalog-only runtime scope.
- Do not copy DSH command or Skill definitions into Desktop or Renderer.
- Do not change Workspace mention authority, provider selection, permission semantics or transcript projection.

## Five-layer analysis

| Layer          | Decision                                                                                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | DSH bridge computes the effective preset catalog; Agent runtime transports it; Desktop chooses Draft or exact-Conversation scope; Renderer only displays it.                                                                                |
| Dependency     | The pre-turn probe stays inside the DSH runtime process and depends on the same preset composition as `session/new`; no Electron or Workspace dependency enters DSH.                                                                        |
| Interface      | The existing input-catalog extension accepts exactly one target: `{ cwd }` means pre-turn preset scope and `{ sessionId }` means the exact live Session. The projection shape is unchanged.                                                 |
| Extension      | A bounded, non-published probe Agent is created only for a pre-turn read and disposed before return. It is not registered in OpenNeko catalogs and must not remain in DSH persistence.                                                      |
| Testing        | Contract/client tests cover the optional identity; bridge qualification proves preset composition and no durable Session leak; Desktop tests prove correct scope selection; visible Electron covers user interaction and identity creation. |

## Canonical path and ownership

- Public entry: sender-bound `composer-snapshot` request from the active Agent Surface.
- Producer: `@neko/dsh-bridge` input-catalog extension.
- Consumer: Desktop composer configuration, then the existing `DshComposerConfigurationProjection` consumed by `@neko/agent-webview`.
- Runtime boundary: ACP extension between Electron Main and the DSH subprocess.
- Draft path: exact Agent Surface scope → authoritative Session-cwd resolver → stable Desktop DSH client `readInputCatalog({ cwd })` → bridge pre-turn preset probe → unchanged composer projection.
- Conversation path: exact Agent Surface scope → Conversation-bound client → exact bound DSH Session → the same bridge input-catalog extension.
- Execution path: existing atomic `create` request → Conversation publication → exact DSH Session binding → Session-scoped command or Skill execution.
- Replaced path: `conversationId === undefined ? undefined : readInputCatalog(conversationId)` is removed. No legacy Draft catalog remains.

Desktop retains only the composition decision because it owns the Electron sender-bound Agent Surface and knows whether that surface is a Draft or a durable Conversation. Catalog computation remains host-neutral and DSH-owned.

## Probe lifecycle

For a pre-turn read, the Host supplies the same authoritative absolute cwd that a first submitted Conversation would use. The bridge prepares an unpublished Agent with a fresh process-local identity, the same configured preset, default Session configuration and the same session runtime setup used by `session/new`. It reads commands and user-invocable Skills, then aborts publication at the setup boundary so DSH rolls back the complete scope. The Agent is never inserted into the bridge-owned ACP Session map, never returned to the Host and never flushed. Qualification must assert that the DSH persisted Session list is identical before and after the read. A discovery or teardown failure rejects the current composer snapshot; it does not return an empty catalog or fall back to a global/legacy catalog.

## First-submit validation

The Draft menu is advisory discovery. Selection does not reserve execution authority. On submission the existing atomic creation path creates the durable Conversation and DSH Session. `executeCommand` or `invokeSkill` resolves the entry again from the exact Session-scoped catalog; an entry that disappeared is rejected visibly. No catalog-only Agent handles user input.

## User-data impact

There is no user-data shape change or migration. Draft reads must not add Conversation rows, bindings, DSH persisted Sessions or transcript events. Existing Conversations, transcripts and Workspace bindings remain unchanged. A malformed catalog affects only the current composer snapshot and must not disable sibling Conversations or Workspaces.

## Evaluation and UI validation decision

- Evaluation disposition: `reuse/update`.
- Owning visible Desktop scenario: `desktop-agent-entry-workspace-skill`.
- Canonical checks: unbound Entry Draft `/`; unbound `@` local empty state; Workspace-bound Draft `@`; Workspace-bound Draft `$storyboard`; first submit creates one exact Conversation/DSH Session and completes through the real provider; existing Conversation triggers remain available.
- Forbidden fallback: hidden Conversation creation, persisted probe Session, Renderer hard-coded catalog, global-only catalog substituted after preset failure, legacy input controller, direct runtime execution or mocked terminal text.
- UI review covers wide and narrow layouts, menu placement/readability, Escape dismissal, draft preservation and adjacent Conversation behavior.
