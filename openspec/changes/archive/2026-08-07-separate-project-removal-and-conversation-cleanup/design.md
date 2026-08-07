## Context

`@neko/host` currently builds sidebar groups by seeding one group for every Project catalog record, then appending Agent conversations. The same package-owned management service removes Project state first and then deletes every conversation captured from the Project group. Desktop exposes that coupled behavior as `projects.delete` through renderer, preload and Main IPC.

Project registration, durable Agent conversation history and Project files have different lifecycles. Registration is a reversible local navigation concern; conversation deletion is an explicit destructive lifecycle operation; files remain owned by the local directory. The implementation must preserve those boundaries without versions, migrations, compatibility aliases or fallback success paths.

## Goals / Non-Goals

**Goals:**

- Make PrimarySidebar a bounded conversation switcher whose Project rows are grouping headers rather than a duplicate Project catalog.
- Make Project removal preserve all Agent conversations and Project files.
- Provide an explicit Project-scoped cleanup command for exact Workspace-owned conversations.
- Preserve removed-Project conversations as item-local unavailable Workspace navigation instead of failing or hiding the global projection.
- Replace the old internal delete contract completely across producer and consumers.

**Non-Goals:**

- Deleting Project directories, media, generated artifacts or other local files.
- Deleting Assistant, Character or Room conversations based on presentation grouping.
- Adding cloud sync, data versions, migrations, aliases, dual paths or compatibility handling.
- Adding a second Project authority or a general conversation query framework.

## Decisions

### Keep Project and conversation lifecycle operations separate in `@neko/host`

`@neko/host` remains the host-neutral application owner because it already owns Project catalog mutation, Window projection and conversation grouping. Its public management service exposes two commands:

- `removeProjects`: delegates only to Shell Project catalog removal and returns the committed projection.
- `deleteProjectConversations`: resolves exact Workspace-owned conversation identities for the requested Project records, delegates those identities to Agent conversation authority, and returns the refreshed projection.

The alternative of implementing selection in Desktop Main would put business identity rules in the Electron composition root. Keeping the old coupled service with a boolean option would retain two semantic paths and is rejected.

### Select cleanup targets by authoritative owner, not visual membership

Project conversation cleanup selects only conversations whose owner is `workspace` and whose `workspaceId` equals the exact Project `workspaceId`. A non-Workspace conversation may be visually associated with a Project, but presentation grouping never changes transcript ownership and cannot grant deletion authority.

The Host validates the complete non-empty unique Project identity set before invoking Agent authority. An invalid identity fails visibly before any conversation is deleted.

### Project removal preserves conversations and projects them locally

Shell removal atomically removes Project catalog records, Workspace registration, Tabs and Views. It does not return conversation deletion targets and does not call Agent authority. Workspace conversations then have no exact catalog match and are projected under the existing unavailable Workspace group with an explicit diagnostic.

An explicit `groupedProjectId` that no longer resolves is handled as a local grouping failure: Workspace owners enter the unavailable Workspace group; standalone owners return to their exact standalone owner group. The projector does not substitute another Project and does not fail the whole sidebar.

### Filter empty Project groups in the package-owned projection

The grouped navigation projector builds and validates conversation placement, then emits only Project groups with at least one conversation. Unavailable Workspace and standalone owner groups are already conversation-derived. The complete Project set remains available through the Project catalog surface.

Filtering belongs in `@neko/host`, not Renderer CSS or local state, so every consumer sees the same navigation contract and group count.

### Replace the typed Desktop route without aliases

The package-owned Desktop contract, preload bridge, IPC channel, Main handler and Renderer callbacks change from `projects.delete` to `projects.remove`. A separate `projects.deleteConversations` route carries Project identities for explicit cleanup. The removed channel and method have no handler or alias.

Desktop Application code is retained only for sender-bound IPC wiring, confirmation UI, i18n and projection rendering; it owns no Project or conversation lifecycle rule.

### Reuse current UI surfaces and primitives

The existing Project catalog batch toolbar, Project row actions, sidebar Project group and `@neko/ui` icon/button primitives are extended. No new design system component or package-local menu framework is introduced. Removal uses non-destructive wording; conversation cleanup uses the existing destructive icon and an exact confirmation that states the number of affected conversations where available.

## Risks / Trade-offs

- [Removed Projects leave unavailable Workspace groups while conversations exist] -> This is intentional fail-visible retention; reopening the exact directory restores Project grouping, while explicit cleanup removes the history.
- [A multi-Project cleanup can partially complete if Agent authority fails after earlier deletions] -> Validate all Project identities and targets before deletion, fail visibly on authority failure, and keep remaining records projected for manual handling. Agent authority does not currently provide a cross-conversation transaction.
- [Sidebar no longer offers direct access to Projects without conversations] -> The complete Project catalog remains the authoritative management entry; opening a Project and submitting its first message creates a sidebar group.
- [Breaking internal IPC rename can expose stale callers during development] -> Remove all old producers, consumers and tests in the same change and run path-level Main/preload/renderer checks plus legacy-debt scans.

## Migration Plan

1. Replace the package-owned management contract and tests.
2. Replace Main/preload/renderer IPC and UI consumers in one change; delete the old route.
3. Update grouped projection behavior and regression tests for retained unavailable conversations.
4. Run focused package, Desktop, architecture and real Electron UI validation.

No user-data migration occurs. Rollback is a code rollback only and must not modify local Project, conversation or file data.

## Open Questions

None.
