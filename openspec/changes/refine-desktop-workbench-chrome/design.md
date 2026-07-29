## Context

The Desktop Workbench composes project navigation, Chat docking, Main view groups, resource docking, and Cut Timeline state through `DesktopWorkbenchLayoutProjection`. The display-mode selector currently floats over the Main content next to a Timeline toggle, while `WorkbenchEditorTabs` provides the canonical cross-package tab semantics but uses a visually heavy segmented treatment.

This change crosses the shared UI primitive and the Desktop renderer, but it does not change persisted state or host contracts. Existing Home, Agent, theme, and sidebar work in the dirty worktree must remain intact.

## Goals / Non-Goals

**Goals:**

- Give Main tabs a compact editor-native hierarchy with clear active, hover, focus, close, overflow, and drag affordances.
- Place project layout selection in the application primary sidebar footer immediately above Settings.
- Remove content-overlay layout controls and the standalone Timeline toggle.
- Preserve the existing Workbench display-mode state owner and Cut-owned Timeline behavior.
- Keep open creative view instances mounted across tab activation and bind Cut Timeline to the owning Cut instance.
- Keep the implementation reusable, accessible, and testable without introducing a Desktop-local tab system.

**Non-Goals:**

- Changing the Workbench v2 persistence schema or display-mode operations.
- Adding a persistent application preference for project layout.
- Removing Timeline rendering or changing Cut session ownership.
- Adding more than two Main view groups or changing split behavior.
- Redesigning Home navigation, Settings, Agent, resource browsing, or domain Webviews.

## Decisions

### 1. Keep display state in the project Workbench; move only its trigger

`DesktopWorkbenchLayoutProjection.display` remains the sole state owner. `WorkbenchDisplayMenu` continues to call the existing `applyWorkbenchDisplayMode` path, but the project sidebar supplies it to the primary-sidebar footer as a project-only layout control.

This is preferred over adding a Settings preference because display mode is window/project presentation state and must restore with the Workbench. It is preferred over a new global store because the existing mutation contract already carries revision and window identity.

### 2. Primary sidebar footer owns workspace-level layout affordances

The primary sidebar footer renders an optional semantic layout control before the existing Settings action. Home does not provide this control. Compact and hover-expanded sidebar modes reuse the same footer placement, tooltip, and accessible label.

This reduces coupling between Main document content and window layout. A generic toolbar or registry is not introduced because there is one stable layout control and one current owner.

### 3. Remove the floating control container and standalone Timeline action

`ProjectWorkbenchControls` and its absolute-positioned chrome are removed. The display menu moves to the sidebar; the Timeline button has no replacement in general Workbench chrome. Cut runtime operations continue to show and attach Timeline through `showWorkbenchTimeline`, and Main rendering continues to project the owned Timeline.

This prevents two competing authorities: general layout chrome selects Chat/Main composition, while Cut owns whether a Cut Timeline is part of the active creative workflow.

### 4. Enhance the shared tab primitive through styles, not a parallel component

`@neko/ui` remains the canonical semantic and interaction owner for tabs. The existing API, DOM roles, drag-and-drop, close handling, and keyboard selection are retained. Shared styles are refined to provide:

- a compact fixed-height editor strip;
- transparent inactive tabs and a surface-backed active tab;
- a restrained active indicator;
- visible hover/focus states;
- close affordances that appear for the active, hovered, or keyboard-focused tab;
- bounded width with ellipsis and horizontal overflow.

Desktop only aligns its group action strip with the shared tab height and theme tokens. No package-local tab component or duplicate theme token set is added.

### 5. Verification follows the real Desktop boundary

Component and renderer tests assert semantic ownership and absence of the removed controls. CSS tests assert the stable selectors that encode active and close-button behavior. The packaged Electron application provides black-box evidence for visual hierarchy and menu placement. VS Code Webview debugging is not applicable because this surface is the Electron Desktop shell, not an Extension Webview.

### 6. Tab activation selects visibility, not runtime ownership

Each Main group renders a stable keyed stack for every open view in that group. The active view controls which stack item is visible and accessible; it does not control whether the view runtime exists. Closing a view or removing it from the group remains the lifecycle boundary that unmounts and disposes its runtime.

Cut Preview and Timeline are two regions of the same Cut root. The Timeline portal target is supplied to the Cut owner according to group membership, even while another tab is active. Desktop does not mount a second `timeline-only` Cut root when the owning Cut view is already retained in a Main group.

This follows the repository's instance-ownership rule: active selection is a display projection, not a mutable-state owner. A runtime registry is unnecessary because React keys and the canonical Main group view list already define identity and lifecycle.

## Risks / Trade-offs

- **Shared tab styling can affect another future consumer** → Keep the styles expressed through existing Workbench theme variables and validate all current `@neko/ui` tests.
- **Compact sidebar can make the layout icon ambiguous** → Retain the tooltip and accessible label, and place the control consistently next to Settings.
- **Removing the Timeline toggle eliminates manual hide/show from general chrome** → Preserve Cut-owned automatic Timeline presentation and cover that projection path in existing Workbench tests.
- **Retaining open views consumes more renderer resources than active-only mounting** → Bound lifetime to the explicit open-tab list, hide inactive surfaces from layout and accessibility, and dispose immediately when a tab closes.
- **Existing dirty Home/Agent edits overlap Desktop files** → Use focused patches, inspect the final diff, and avoid rewriting unrelated hunks.

## Migration Plan

1. Update renderer tests to require the sidebar-owned display menu and absence of floating/Timeline controls.
2. Move the existing menu trigger without changing its mutation functions or stored schema.
3. Remove obsolete floating control markup and CSS.
4. Refine shared tab styles and focused tests.
5. Build and run the packaged Desktop application against a synthetic project fixture.
6. Add a lifecycle regression test that switches from Cut to Canvas and proves the same Cut root remains attached to Timeline.

Rollback restores the former trigger placement and shared tab styles; no stored data migration is needed.

## Open Questions

None. The layout trigger is project-only and belongs immediately before Settings in the primary sidebar footer.
