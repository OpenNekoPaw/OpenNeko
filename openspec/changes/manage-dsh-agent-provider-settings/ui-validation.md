## Scope

Agent Settings progressive disclosure is applicable UI work. The acceptance inventory covers the initial compact state, separate dialogue/generation defaults, Provider expansion, model catalog expansion, mutual replacement of expanded catalogs, and the adjacent Settings overlay/navigation layout.

## Runtime

The authoritative runtime was the running OpenNeko Electron development application at `localhost:5173`. This crosses the real Settings overlay, Renderer projection, preload/Main model settings bridge, and the current canonical Provider/model data.

## Inventory

- Initial state: open Settings → Agent; dialogue and generation defaults remain visible, while Provider/model catalogs show only summary, count, and Manage action.
- Provider state: activate Provider summary; only Provider cards and Add Provider are expanded.
- Model state: activate Model catalog summary; Provider cards are removed and only model cards plus Add Model are expanded.
- Adjacent state: Settings navigation, overlay bounds, close action, and advanced config action remain visible without overlap.

## Evidence

- Focused functional test: `DesktopSettingsSurface.test.tsx` covers initial collapsed state and Provider → model replacement.
- Electron initial state: `/var/folders/26/b9fmn08x6mv2bcl771rnjyt80000gn/T/com.openai.sky.CUAService/Electron Screenshot 2026-08-24 at 6.29.43 AM.jpeg`.
- Electron Provider state: `/var/folders/26/b9fmn08x6mv2bcl771rnjyt80000gn/T/com.openai.sky.CUAService/Electron Screenshot 2026-08-24 at 6.29.51 AM.jpeg`.
- Electron model state: `/var/folders/26/b9fmn08x6mv2bcl771rnjyt80000gn/T/com.openai.sky.CUAService/Electron Screenshot 2026-08-24 at 6.29.58 AM.jpeg`.

## Visual findings

- Initial: the four default selectors fit in one compact block; dialogue and generation hierarchy is clear; catalog contents no longer dominate the viewport.
- Provider expanded: four Provider cards fit as a two-column grid, the Add Provider action remains aligned, and the model catalog stays collapsed.
- Model expanded: the Provider grid is removed before model cards appear; catalog replacement is visually unambiguous and the overlay remains contained at the observed 1220×768 application size.
- No clipping, overlap, unreadable labels, or unstable expansion was observed in the inspected light-theme states.

## Result

`blocked`: the inspected light-theme Electron states and functional transitions passed, but dark-theme and a narrower supported window were not exercised. They are not inferred from the successful light-theme artifacts.

## Residual risk

Dark-theme contrast and the narrow single-column container rule remain visually unexecuted. The application also displayed an existing fail-local notification for stale application settings before this flow; it did not prevent Settings use and was not introduced by this change.
