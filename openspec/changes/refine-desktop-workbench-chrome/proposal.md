## Why

The Desktop Workbench currently mixes global layout controls with document content and renders editor tabs as heavy segmented blocks. This makes the main surface visually noisy and leaves the Chat/Main display selector detached from the primary navigation that owns workspace-level layout affordances.

## What Changes

- Refine the shared editor-tab presentation with clearer active, hover, focus, close, overflow, and drag affordances while preserving the existing tab contract and interactions.
- Move the Chat/Main display-mode trigger from the floating main-content control to the project primary sidebar footer, adjacent to Settings.
- Remove the standalone Timeline toggle from the Workbench chrome; Cut continues to own Timeline visibility through its explicit Workbench view state.
- Keep display-mode state project-Workbench-scoped rather than persisting it as an application setting.
- Preserve each open Main view's runtime instance across tab activation so Cut Preview and Timeline remain attached to one owner and switching tabs does not reload creative state.
- Add focused component, renderer, style, and runtime acceptance coverage for the new ownership and visual hierarchy.

## Capabilities

### New Capabilities

- `desktop-workbench-chrome`: Defines editor-tab visual behavior and the primary-sidebar ownership of project Workbench display controls.

### Modified Capabilities

None.

## Impact

- `packages/neko-ui` shared Workbench editor-tab styles and tests.
- `apps/neko-desktop` project primary sidebar composition, layout menu placement, stable Main-view lifecycle, renderer styles, localization, and tests.
- No Workbench persistence schema, Extension/Engine bridge, project file, or application-settings contract changes.
