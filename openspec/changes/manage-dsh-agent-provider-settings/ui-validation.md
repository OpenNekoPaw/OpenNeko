## Scope

Agent Settings model-management simplification is applicable UI work. The acceptance inventory covers the compact initial state, removal of separate default selectors, dialogue/generation grouping inside model management, per-model default markers and actions, and the adjacent Settings overlay layout.

## Runtime

The authoritative runtime was the running OpenNeko Electron development application at `localhost:5173`. This crosses the real Settings overlay, Renderer projection, preload/Main model settings bridge, and current canonical Provider/model data.

## Inventory

- Initial state: open Settings → Agent; only compact Provider/model management summaries and the advanced entry remain visible.
- Model state: open model management; configured entries are grouped into dialogue and generation models.
- Default state: each configured default is marked on its model card; enabled non-default models expose a Set as default action.
- Adjacent state: Provider remains collapsed, model management can still be collapsed, and overlay navigation and bounds remain usable.

## Evidence

- Focused functional test: `DesktopSettingsSurface.test.tsx` proves the initial state has no model selectors, model management reveals both groups, projected defaults receive markers, and a non-default model invokes the existing `setDefault` bridge with its exact type and identity.
- Electron initial state: `/var/folders/26/b9fmn08x6mv2bcl771rnjyt80000gn/T/com.openai.sky.CUAService/Electron Screenshot 2026-08-24 at 6.45.44 AM.jpeg`.
- Electron model state: `/var/folders/26/b9fmn08x6mv2bcl771rnjyt80000gn/T/com.openai.sky.CUAService/Electron Screenshot 2026-08-24 at 6.45.51 AM.jpeg`.

## Visual findings

- Initial: the removed selector block leaves a clear two-entry configuration surface with no redundant default controls.
- Model expanded: seven dialogue and three generation models remain readable in compact two-column cards; the section hierarchy is clear.
- Default markers are visually distinct through a subtle accent border, surface tint, and compact badge; non-default actions remain subordinate to model identity.
- No clipping, overlap, unreadable labels, or overlay-boundary regression was observed at the inspected 1220×768 light-theme size.

## Result

`blocked`: the inspected Electron light-theme states and component-level default action passed, but the real user configuration was not mutated to exercise a default switch and restore cycle. Dark theme and a narrower supported window were also not exercised.

## Residual risk

Real canonical-config mutation through the new card action, dark-theme contrast, and the narrow single-column presentation remain visually unexecuted. The action reuses the previously verified `setDefault` bridge and introduces no new authority or mutation contract.
