## Context

The Host already composes one canonical `DesktopConversationNavigationProjection` from the Project catalog, recent Project context, and owner-qualified Agent Conversation catalog. Its groups are either Project contexts, unavailable Workspace contexts, or standalone Assistant/Character/Room owners. PrimarySidebar currently renders all groups below one heading and labels the group count as "Projects and conversations".

World has an active design but no package-owned Library projection or product runtime. The Desktop must expose the requested World category without fabricating a World from `DesktopProjectProfile`, Agent Conversation, current Scene, or Project directory contents.

### Five-layer analysis

| Layer          | Decision                                                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Host keeps Project/Conversation grouping authority; Desktop Renderer owns only the Window-visible section composition; the future World owner supplies World Library records. |
| Dependency     | The change stays in the sandboxed Renderer and localized product shell; no Main, preload, SQLite, Node, World, Agent runtime, or Project authority dependency changes.        |
| Interface      | Reuse the current canonical projection and discriminate existing group kinds; do not add a placeholder World DTO or optional cross-domain registry.                           |
| Extension      | A future World projection fills the reserved section through its own public contract; it does not become another Conversation group or Project profile interpretation.        |
| Testing        | Renderer tests prove category placement/counts and retained interactions; isolated Electron evidence covers normal, dense, unavailable, narrow, and themed presentation.      |

## Goals / Non-Goals

**Goals:**

- Present three visually distinct sections in the stable order Projects, Conversations, World.
- Keep exact Project headers, Workspace Conversation children, standalone owner groups, diagnostics, and lifecycle actions unchanged.
- Give every section an unambiguous count based on rows owned by that section.
- Reserve World honestly as an empty category until its owning projection exists.

**Non-Goals:**

- Add a World Library, World route, World record, placeholder, runtime, or persistence contract.
- Move Project-owned Workspace conversations into a duplicated flat Conversation list.
- Infer World entries from Project profile, Character, Room, Assistant, current Scene, or local files.
- Change Project or Conversation storage, grouping, deletion, restoration, runtime residency, or user data.

## Decisions

### 1. Partition the existing projection only at the presentation boundary

`PrimaryRecentNavigation` derives `projectGroups` from `kind === 'project'` and `conversationGroups` from every remaining canonical group kind. The same group component renders both partitions, so navigation, menus, status, bounded children, and collapse behavior retain one implementation.

Alternative considered: change the Host projection to three arrays. Rejected because World has no producer and because splitting an already authoritative Project/Conversation projection would add a public contract change with no new business fact.

### 2. Keep Workspace conversations nested under Projects

The Projects section contains Project headers and their existing conversation children. The Conversations section contains standalone Assistant, Character, Room, and unavailable Workspace groups. A conversation is rendered once; Project association remains navigation placement only.

Alternative considered: flatten every conversation into the Conversations section. Rejected because it duplicates Project-owned rows, breaks the current Project context switcher, and obscures exact Workspace ownership.

### 3. Render World as an explicit empty owner section

The World heading is visible with count `0`. It has no placeholder row, disabled action, inferred entry, or click handler. A later World change must replace that empty projection using the World owner's public Library contract and normal product acceptance.

Alternative considered: hide World until implemented. Rejected because the requested information architecture requires three visible categories. Alternative considered: list `profile: world` Projects. Rejected because a World authoring Project is not an installed World Experience or Run.

### 4. Counts describe their own section

Projects count visible Project groups. Conversations count conversation records inside standalone groups, not owner-group headers. World counts World-owned records and is therefore zero in the current implementation. Project row counts continue to show their child conversation count.

### 5. Ownership and runtime boundary

| Responsibility                | Owner/public path                                   | Producer                            | Consumer             | Boundary                                              | Replaced path       | User-data impact |
| ----------------------------- | --------------------------------------------------- | ----------------------------------- | -------------------- | ----------------------------------------------------- | ------------------- | ---------------- |
| Project/Conversation grouping | `@neko/host/desktop-shell-contract`                 | Desktop Shell service               | preload and Renderer | host-neutral projection crossing typed Desktop bridge | none                | none             |
| Three-section presentation    | `apps/neko-desktop/src/renderer/DesktopShell.tsx`   | sandboxed product-shell composition | user                 | React Renderer                                        | one mixed heading   | none             |
| Labels and layout             | Desktop Renderer i18n and existing shell stylesheet | localized Renderer assets           | user                 | Renderer                                              | mixed category copy | none             |
| Future World records          | future package-owned World Library public contract  | World application owner             | Desktop composition  | not implemented                                       | no current path     | none             |

The section partition stays in `apps/neko-desktop` because it is Window-visible product-shell composition over an already validated projection. It makes no host-neutral business decision and owns no Project, Conversation, or World fact.

## Risks / Trade-offs

- [Three headings consume more vertical space] -> Keep headings compact and reuse the existing scroll container; validate narrow and dense layouts.
- [World appears empty] -> Show only the category and exact zero count, with no fake empty record or unavailable action.
- [Conversation count differs from owner-group count] -> Define and test it as the total standalone conversation records.
- [Existing selectors assume groups are direct children] -> Preserve group classes and add stable section markers; update only affected tests and Electron inspection.
- [Parallel style work overlaps the same stylesheet] -> Preserve the existing uncommitted hover-action changes and add narrowly scoped section rules.

## Migration Plan

This is a source-level Renderer replacement with no stored or wire shape change. Update the three-section Renderer, localization, tests, and Electron acceptance atomically. Rollback restores the prior mixed heading; no user data or migration is involved.

## Open Questions

None for this change. World Library rows and actions remain owned by `define-ai-native-interactive-world` and require a separate implementation change.
