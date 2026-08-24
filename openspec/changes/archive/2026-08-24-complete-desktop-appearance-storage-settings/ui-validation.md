## Scope

Settings overlay appearance, navigation, full-UI font size, storage projection, native directory actions, Provider/model forms, and generation default selectors. UI validation is applicable.

## Runtime

The authoritative boundary is an isolated visible Electron Desktop because directory selection/opening, credential persistence, root font sizing, and IPC cannot be accepted from a browser component alone.

## Inventory

- Open and close Settings; inspect overlay fit, scrolling, navigation, and adjacent scene preservation.
- Change theme and font size; inspect the whole shell, Settings, and return state.
- Open Storage; inspect empty/large usage entries, per-entry diagnostic, native open action, cancellation, and default-directory update.
- Open Agent; inspect empty/configured/invalid credential states, add/edit/cancel/error forms, API-key non-echo, restart notice, and advanced-config action.
- Select dialogue/image/video/audio defaults; inspect missing, disabled, and narrow-layout states.

## Evidence and result

Functional component, contract, and runtime tests passed, including failure states and exact canonical updates. A visible run using `pnpm test:local:ui --scenario no-active-project-catalogs` was attempted, but the Desktop CDP target did not become ready before timeout (`fetch failed`). No current screenshot was produced for direct pixel review.

Result: **blocked**. Functional test evidence is retained but is not presented as visual acceptance.

## Residual risk

Overlay sizing at supported small windows, theme/font pixel quality, native directory dialogs, credential non-echo after a real save, and dense Provider/model lists require a successful visible Desktop rerun.
