## Context

The current Agent home projection exposes one flat `conversations` array whose navigation identity always contains `projectId`, `workspaceId` and `conversationId`. `@neko/agent-runtime` fabricates `projectId` as `content:${workspaceId}` even for the managed Assistant Space, while `@neko/host` validates every lifecycle action against a stored Project. PrimarySidebar then renders `catalog.projects` and `agentHome.conversations` as two separate lists. This is why Assistant conversations cannot participate in exact delete/group operations and why future Character/Room sessions have no valid navigation representation.

The authoritative facts already have separate owners:

- Pi/Agent runtime owns conversation, branch, transcript, execution lease and attention.
- `AgentConversationContext` owns immutable execution context (`assistant | workspace` today).
- Host Project catalog owns `projectId -> workspaceId` membership and display metadata.
- Future Chara/Room owners must provide exact CharacterRun/RoomRun identity before Desktop may restore them.
- Desktop Window Shell owns the visible grouped navigation projection and typed Scene transition.

The implementation crosses `@neko/agent-contracts`, `@neko/agent-runtime`, `@neko/host` and the Desktop composition/renderer boundary. No renderer may read SQLite or infer owner identity from current selection.

### Five-layer analysis

| Layer          | Decision                                                                                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Agent owns conversation catalog facts and context identity; Host owns Project membership composition and Window navigation; Desktop renderer only presents the validated groups.    |
| Dependency     | Agent contracts/runtime remain host-neutral or Node/SQLite; Host consumes public Agent contracts; renderer consumes typed preload projection without Node/Electron imports.         |
| Interface      | Replace nullable/project-shaped fields with a closed owner union and optional Project grouping; lifecycle operations carry exact conversation + owner identity and revision fences. |
| Extension      | Character/Room variants require stable run identity and qualified owner adapters; adding a producer does not change Workspace/Assistant or sidebar grouping algorithms.             |
| Testing        | Contract codecs, SQLite catalog join/migration, Agent producer, Host grouping/restore/delete, renderer interaction and isolated Electron scenarios provide path-level evidence.     |

## Goals / Non-Goals

**Goals:**

- Render Codex-style Project rows with their exact Workspace conversations nested below them.
- Render unbound Assistant, Character and Room conversations under owner-qualified standalone groups.
- Permit a non-Workspace conversation to carry an optional Project association without changing its context owner, capabilities or memory scope.
- Restore/delete an exact conversation without requiring a synthetic Project for Assistant/Character/Room.
- Preserve every valuable existing Assistant and Workspace conversation and fail visibly for unresolved or mismatched context/group identity.
- Keep PrimarySidebar as the only top-level conversation navigation; hide session tabs in Draft and avoid adding another Desktop-owned Agent tab system.

**Non-Goals:**

- Implement CharacterProject, CharacterRun, RoomRun, relationship memory, room timeline or their Desktop product Roots.
- Convert Assistant/Character/Room conversations into Workspace conversations in place.
- Merge transcripts, memories, permissions, resources or undo histories because entries share a Project group.
- Introduce a generic tree/route DSL, app-owned conversation database, or a second Agent catalog.
- Change Pi transcript/branch/session storage layout beyond the catalog metadata needed for owner-qualified projection.

## Decisions

### 1. Separate transcript owner, context owner and navigation group

The canonical contract uses three orthogonal identities:

```ts
type AgentConversationOwnerRef =
  | { kind: 'assistant'; assistantSpaceId: string }
  | { kind: 'workspace'; workspaceId: string }
  | { kind: 'character'; characterId: string; characterRunId: string }
  | { kind: 'room'; roomId: string; roomRunId: string };

interface AgentHomeConversationSummary {
  navigation: {
    conversationId: string;
    owner: AgentConversationOwnerRef;
  };
  groupedProjectId?: string;
  // title, updatedAt, attention, lastActivity
}
```

`conversationId` selects AgentSession facts. `owner` selects the capability/memory/Scene boundary. `groupedProjectId` changes only navigation placement. Four nullable IDs are rejected because they permit zero or multiple owners.

For Workspace conversations, Host derives and validates the effective Project group from the exact Project catalog `workspaceId` match. A persisted `groupedProjectId`, when present, must match that Project. Assistant/Character/Room entries may omit grouping and remain standalone. An explicit future association operation may set or clear their grouping, but it cannot mutate `owner`.

Alternative considered: make Project the owner of every conversation. Rejected because AssistantSpace, CharacterRun and RoomRun have independent permission, memory and lifecycle authorities.

### 2. Agent runtime produces owner-qualified catalog entries from exact context metadata

`@neko/agent-contracts` owns `AgentConversationOwnerRef`, the versioned home projection and strict codecs. `@neko/agent-runtime` remains the producer through its public application entry.

The Node Pi catalog reader reads conversation rows and the canonical `agent_conversation_context` metadata from the same user-level SQLite snapshot. New conversations must have exact context metadata. Existing Workspace records without context continue through the already-defined explicit Workspace context migration; unresolved records are excluded only through a visible catalog diagnostic, never projected as Assistant or assigned to a recent Project. Existing Assistant lifecycle records resolve to `assistantSpaceId`, not a synthetic Workspace Project.

Character/Room owner refs include run identity rather than only `characterId`/`roomId`. Their navigation parser/summary variants are closed and testable, but they are not added to executable `AgentConversationContext` until Chara/Room packages provide qualified context and Scene adapters. Current Desktop composition rejects successful restore before reading them as an executable Agent context.

Alternative considered: let Desktop query lifecycle records per conversation and build Agent summaries. Rejected because it makes the Electron composition root own catalog business projection and creates an N+1 asynchronous restore/read path.

### 3. Host composes one grouped navigation projection

`@neko/host` adds a Window-level projection:

```ts
type DesktopConversationNavigationGroup =
  | {
      kind: 'project';
      projectId: string;
      workspaceId: string;
      label: string;
      conversations: readonly Summary[];
    }
  | {
      kind: 'assistant';
      assistantSpaceId: string;
      label: string;
      conversations: readonly Summary[];
    }
  | { kind: 'character'; characterId: string; label: string; conversations: readonly Summary[] }
  | { kind: 'room'; roomId: string; label: string; conversations: readonly Summary[] };
```

All stored Projects remain visible even when they have no conversations. Conversations inside every group are sorted by `updatedAt`. Project groups retain deterministic Project catalog order and remain ahead of standalone groups; standalone groups follow the Agent home projection's first-owner occurrence, which is determined by each owner's most recent conversation. PrimarySidebar receives this projection instead of independently joining Projects and conversations.

Host rejects duplicate placement, unknown Project associations, a Workspace owner whose `workspaceId` resolves to zero/multiple Projects, and navigation identities that do not exactly match the Agent projection. No active/first/recent fallback participates.

Alternative considered: group inside React with `useMemo`. Rejected because deletion, restore, reload and other consumers would continue to use a different unvalidated interpretation.

### 4. Container activation and session restoration stay distinct

- Selecting a Project header sends `open-project-workspace` and enters/reuses the exact Workspace-bound Draft; it does not choose a previous conversation.
- Selecting a conversation sends `restore-conversation(conversationId)`. Desktop Main reads exact lifecycle context, validates any Workspace grant, and asks Host to commit the complete owner-qualified Scene.
- Same-Workspace restore reuses Workspace runtime/Main/Resources while switching the Agent conversation and conversation-scoped Preview/artifact projections.
- Cross-owner restore replaces the complete Scene.
- Character/Room restore returns `desktop-scene-owner-unavailable` until their owners are composed.

Agent-internal conversation Tabs are not a navigation authority. PrimarySidebar owns user-visible session selection; package-internal background sessions and Room participant AgentSessions remain independent runtimes.

### 5. Lifecycle actions use exact owner identity

Delete and future association operations carry `conversationId + owner`, Agent home revision and Window/endpoint revision. Host compares the complete identity against the authoritative projection before delegating to Agent lifecycle/Pi deletion. Assistant deletion no longer requires a Project catalog record. Owner mismatch, stale revision or missing summary fails visibly.

The renderer retains confirmation presentation only; it cannot alter the owner or synthesize group membership.

### 6. Ownership and production path

| Responsibility                       | Owner/public path                                                        | Producer                                                         | Consumer                      | Runtime boundary                            | Replaced path                                                          |
| ------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| Owner-qualified conversation summary | `@neko/agent-contracts` + `@neko/agent-runtime/application`              | Pi catalog/context reader and Agent projection                   | `@neko/host`                  | host-neutral contract + Node/SQLite adapter | Workspace-only `AgentHomeNavigationIdentity` and fabricated Project ID |
| Project/standalone navigation groups | `@neko/host/desktop-shell-contract`                                      | Desktop Shell service using Project + Agent projections          | preload/renderer              | Host-neutral state/application service      | renderer-side two-list interpretation                                  |
| Scene/lifecycle delegation           | `@neko/host` contracts, Desktop concrete adapters                        | Host transition authority + Desktop exact context/grant adapters | Agent/Workspace/Preview Roots | Electron sender/Window boundary             | Project-required Assistant validation                                  |
| Sidebar presentation                 | existing Desktop `ApplicationPrimarySidebar` using `@neko/ui` primitives | validated Host projection                                        | user                          | sandboxed renderer                          | separate recent Projects/recent conversations JSX                      |

Production code retained in `apps/neko-desktop` is limited to Electron sender/Window identity, native grant restoration, typed bridge calls and React slot composition. Grouping, owner validation, sorting and lifecycle rules remain in package-owned contracts/services because they do not require Electron.

## Risks / Trade-offs

- [Existing Pi row lacks lifecycle context] -> Reuse the explicit exact Workspace migration authority; surface a catalog diagnostic and block restore when identity cannot be resolved.
- [Project removed while an associated non-Workspace conversation remains] -> Keep the conversation under its standalone owner group and expose the broken association diagnostic; never delete the conversation with the Project.
- [Character/Room union appears before product owner exists] -> Codec support does not imply availability; current producer cannot create these contexts and Desktop restore returns owner-qualified unavailable.
- [Sidebar becomes long] -> Show a bounded recent subset per group with explicit expand/collapse; preserve stable dimensions and scrolling without adding nested card shells.
- [Same Workspace has multiple active conversations] -> Conversation runtime state remains isolated; Workspace document editing continues through one Workspace/DocumentSession owner and one editable View policy.
- [Breaking stored/UI projection] -> Migrate exact supported records once and bump strict contract versions; unknown versions/kinds fail instead of dual-reading old navigation identities.

## Migration Plan

1. Add strict owner/navigation codecs and producer tests before changing consumers.
2. Extend the canonical SQLite catalog read to join exact conversation context and add explicit project-association metadata only where a real association operation exists.
3. Produce new Agent home summaries; poison the fabricated `content:${workspaceId}` Agent-side Project path.
4. Add Host grouped projection and exact lifecycle validation; migrate every consumer in one boundary.
5. Replace PrimarySidebar two-list rendering and remove old labels/helpers/styles/tests.
6. Bump Desktop shell wire/stored projection versions only where serialized shape changes; migrate supported Assistant/Workspace state, preserving user conversations.
7. Validate producer/consumer paths, key-free Agent Evaluation, real Electron navigation/reload/delete, full quality gates and documentation before accepting the change.

Rollback is source-level before release. User conversation/context rows are not destructively rewritten; reverting the binary may require rebuilding the derived sidebar projection, while unknown newer contract versions fail visibly.

## Open Questions

- A user-facing “associate with Project / remove from Project” action is deferred until its interaction entry and product copy are specified; the contract keeps grouping optional without inventing drag/drop behavior.
- Character and Room labels/avatars must come from their owning projections when those runtimes are qualified; Agent/Desktop must not fabricate them from transcript text.
