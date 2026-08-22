## Context

The Host already composes one canonical `DesktopConversationNavigationProjection` from the Project catalog, recent Project context, and owner-qualified Agent Conversation catalog. Its groups are Project contexts, unavailable Workspace contexts, or standalone owner contexts. PrimarySidebar currently renders all groups below one heading and labels the group count as "Projects and conversations".

The current product scope supports Project/Workspace navigation and Personal Assistant Conversations. Character and Room contracts exist, but their product runtimes are not available; World has an active design but no package-owned Library projection or product runtime. The Desktop must reserve an explicit extension point for those future owners without exposing unsupported categories or fabricating records from `DesktopProjectProfile`, Agent Conversation, current Scene, or Project directory contents.

### Five-layer analysis

| Layer          | Decision                                                                                                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Host keeps Project/Conversation grouping authority; Desktop Renderer owns only the Window-visible section composition; future Character, Room, and World owners supply their own records. |
| Dependency     | The change stays in the sandboxed Renderer and localized product shell; no Main, preload, SQLite, Node, World, Agent runtime, or Project authority dependency changes.                    |
| Interface      | Reuse the current canonical projection and classify current group kinds; do not add placeholder DTOs, fake records, feature flags, or a cross-domain registry.                            |
| Extension      | Keep a small exhaustive owner-to-section classification boundary; a future owner becomes visible only when its own product contract, records, route, and actions are implemented.         |
| Testing        | Renderer tests prove category placement/counts and retained interactions; isolated Electron evidence covers normal, dense, unavailable, narrow, and themed presentation.                  |

## Goals / Non-Goals

**Goals:**

- Present two visually distinct current sections in the stable order Projects, Conversations.
- Keep exact Project headers, Workspace Conversation children, unavailable Workspace diagnostics, Personal Assistant Conversations, and lifecycle actions unchanged.
- Keep an unresolved Workspace context under Projects so its missing Project diagnostic cannot be mistaken for an Assistant Conversation.
- Give every visible section an unambiguous count based on rows owned by that section.
- Reserve Character, Room, and World only as future owner classifications until their owning product surfaces exist.

**Non-Goals:**

- Add a Character, Room, or World category, route, row, action, placeholder, runtime, or persistence contract.
- Move Project-owned Workspace conversations into a duplicated flat Conversation list.
- Treat unavailable Workspace contexts as standalone Conversations.
- Infer Character, Room, or World entries from Project profile, Assistant, current Scene, or local files.
- Change Project or Conversation storage, grouping, deletion, restoration, runtime residency, or user data.

## Decisions

### 1. Partition the existing projection only at the presentation boundary

`PrimaryRecentNavigation` derives `projectGroups` from both valid Project groups and unavailable Workspace context groups. It derives `conversationGroups` only from standalone Personal Assistant groups. The same existing group component renders both current partitions, so navigation, menus, status, bounded children, diagnostics, and collapse behavior retain one implementation.

Alternative considered: change the Host projection into owner-specific arrays. Rejected because the current projection already carries the required identities and diagnostics, while future Character, Room, and World owners do not yet have complete product producers. Splitting the authoritative projection would add a public contract change with no new current business fact.

### 2. Keep Workspace conversations nested under Projects

The Projects section contains valid Project headers and their existing Workspace Conversation children. It also contains unavailable Workspace context groups when a corresponding Project cannot be resolved. These groups retain their existing local diagnostic and disabled authority-dependent operations. The Conversations section contains only standalone Personal Assistant Conversations. A conversation is rendered once; Project association remains navigation placement only.

Alternative considered: flatten every conversation into the Conversations section. Rejected because it duplicates Project-owned rows, breaks the current Project context switcher, and obscures exact Workspace ownership.

### 3. Reserve future owners without exposing unsupported UI

The section classifier is exhaustive over the owner kinds known to the product composition. Its current visible mapping is `project | workspace -> Projects` and `assistant -> Conversations`, where the existing `workspace` group kind represents a Workspace context whose Project cannot be resolved. Character, Room, and World remain named future owner classifications only; they do not produce a section descriptor in the current composition and therefore cannot render a heading, zero count, placeholder row, disabled action, route, or click handler.

This is a small typed classification boundary, not a registry, feature-flag framework, optional DTO, or parallel catalog. Adding a future owner requires an explicit source-owned projection plus an atomic product change that adds its visible section, routes, operations, and acceptance coverage. A future World projection must come from the World owner's public Library contract; current Projects must not be reinterpreted as a World Experience or Run.

### 4. Counts describe their own section

Projects count visible Project-context groups, including valid Project groups and unavailable Workspace context groups. Conversations count Personal Assistant Conversation records, not owner-group headers. Project row counts continue to show their child Workspace Conversation count. Character, Room, and World have no visible section and therefore no current UI count.

### 5. Ownership and runtime boundary

| Responsibility                | Owner/public path                                               | Producer                            | Consumer             | Boundary                                              | Replaced path       | User-data impact |
| ----------------------------- | --------------------------------------------------------------- | ----------------------------------- | -------------------- | ----------------------------------------------------- | ------------------- | ---------------- |
| Project/Conversation grouping | `@neko/host/desktop-shell-contract`                             | Desktop Shell service               | preload and Renderer | host-neutral projection crossing typed Desktop bridge | none                | none             |
| Current section presentation  | `apps/neko-desktop/src/renderer/DesktopShell.tsx`               | sandboxed product-shell composition | user                 | React Renderer                                        | one mixed heading   | none             |
| Labels and layout             | Desktop Renderer i18n and existing shell stylesheet             | localized Renderer assets           | user                 | Renderer                                              | mixed category copy | none             |
| Future owner records          | future package-owned Character, Room, or World public contracts | corresponding application owner     | Desktop composition  | not implemented                                       | no current path     | none             |

The section partition stays in `apps/neko-desktop` because it is Window-visible product-shell composition over an already validated projection. It makes no host-neutral business decision and owns no Project, Conversation, or World fact.

## Risks / Trade-offs

- [Unavailable Workspace context could be mistaken for a standalone Conversation] -> Keep it under Projects with its local diagnostic and disabled operations.
- [Conversation count differs from owner-group count] -> Define and test it as the total Personal Assistant Conversation records.
- [Future owner reservation could grow into a generic navigation framework] -> Keep the classifier closed and compile-time; add a visible category only with a real owner projection and separate product acceptance.
- [Existing selectors assume groups are direct children] -> Preserve group classes and add stable section markers; update only affected tests and Electron inspection.
- [Parallel style work overlaps the same stylesheet] -> Preserve the existing uncommitted hover-action changes and add narrowly scoped section rules.

## Migration Plan

This is a source-level Renderer replacement with no stored or wire shape change. Update the two-section Renderer, owner classification, localization, tests, and Electron acceptance atomically. Rollback restores the prior mixed heading; no user data or migration is involved.

## Open Questions

None for this change. Character, Room, and World rows and actions require separate implementation changes backed by their package-owned projections and runtimes.
