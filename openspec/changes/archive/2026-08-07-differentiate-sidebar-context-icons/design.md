## Context

Primary sidebar navigation is a Desktop presentation projection over the closed `DesktopConversationNavigationGroup` contract owned by `@neko/host`. Project headers already use `FolderIcon`, but every standalone owner and child Conversation currently renders `StorylineIcon`. The shared icon is semantically a branching storyline and remains valid for Canvas; changing it globally would corrupt another established meaning.

The implementation crosses two L2/Application modules but does not alter domain data or runtime behavior. `@neko/ui` owns reusable React SVG primitives, while `apps/neko-desktop` owns product-shell presentation composition.

## Goals / Non-Goals

**Goals:**

- Make Project/Workspace, Assistant, Character, Room and Conversation visually scannable through distinct outline symbols.
- Reuse the current shared icon conventions, sizing and `currentColor` behavior.
- Keep the mapping exhaustive over the closed navigation-group union.
- Preserve the existing compact sidebar geometry and interaction behavior.

**Non-Goals:**

- Changing navigation, ownership, persistence, Agent runtime or Conversation lifecycle.
- Adding avatars, icon backgrounds, colored badges, left-edge selection highlights or a new icon dependency.
- Changing `StorylineIcon` or migrating Canvas consumers.

## Decisions

### Shared icons remain business-neutral

`@neko/ui` will produce generic `BotIcon`, `UserIcon`, `UsersIcon` and `MessageIcon` React components through the canonical `@neko/ui` public entry. These names describe reusable visual primitives instead of Desktop concepts such as Assistant, Character or Room.

Alternative considered: embed four SVGs in `DesktopShell.tsx`. Rejected because icon drawing, stroke behavior and static-render verification are shared UI responsibilities and would create a package-local icon set.

Alternative considered: add Lucide. Rejected because the repository has no Lucide dependency and four simple symbols do not justify a second icon runtime.

### Desktop maps exact owner kinds

`apps/neko-desktop/src/renderer/DesktopShell.tsx` will retain only the Application-level mapping from `DesktopConversationNavigationGroup.kind` to a shared visual primitive. The function will use an exhaustive switch with no default or fallback. This code must remain in the Application renderer because it decides product-shell presentation for a package-owned contract and depends on React/UI composition; it does not decide domain results.

Producer: `@neko/ui` React icon exports. Consumer: Desktop renderer `PrimaryConversationGroups`. Runtime boundary: sandboxed Electron Renderer only. Canonical path: `@neko/ui` public entry to `DesktopShell.tsx` presentation composition.

### Conversation rows use one child-level symbol

All Conversation rows will use `MessageIcon`, independent of owner type. The parent identity remains on the group header, while the repeated child icon communicates the common Conversation role. Project and unavailable Workspace groups both use the folder icon because both represent directory-backed ownership; availability remains communicated by the existing trailing diagnostic.

### Existing layout is preserved

Icons will use the current 14-15 px budget, `currentColor`, and shared stroke conventions. A narrow identity class may stabilize flex/grid alignment, but it will not add a background, badge, extra spacing track or selected-edge decoration.

## Risks / Trade-offs

- [Small icons may become ambiguous at compact sizes] -> Use familiar outline metaphors and validate rendered Electron screenshots at regular and compact widths.
- [New icon geometry could shift the header grid] -> Keep explicit dimensions and verify existing group layout tests and screenshot alignment.
- [A future owner kind could receive the wrong icon silently] -> Keep the mapping exhaustive and omit a fallback branch.

## Migration Plan

This is a presentation-only replacement. Add shared icons and tests, switch all sidebar consumers in one change, and remove sidebar `StorylineIcon` usage. Rollback is a source revert; no user data, persisted state or migration is involved.

## Open Questions

None.
