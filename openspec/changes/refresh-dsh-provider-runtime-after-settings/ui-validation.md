# Advisory UI Validation

## Scope and inventory

This change is UI-applicable only for the Agent Settings status message. The inventory is:

- idle save reports no restart requirement and returns to the Provider/model surface;
- save during an active turn shows that DSH will refresh after the task finishes;
- the notice states that new conversations use the latest model catalog after refresh;
- the Settings overlay remains usable while the DSH runtime refresh is local to Agent.

## Evidence

- `DesktopSettingsSurface.test.tsx` renders the real Settings component with the strict preload projection, performs a destructive Provider confirmation, receives `runtimeEffect: pending`, and verifies the localized pending-refresh status.
- Host contract tests reject the removed `restartRequired` response.
- Runtime tests prove that `applied` corresponds to a connected replacement generation and that `pending` blocks new work until turn end.

## Result

`blocked` for fresh authoritative pixels. The isolated visible Electron scenario could not start because another Development process owns the checkout's Vite bundle, so no screenshot is inferred from component tests. No layout or visual token changed; the remaining visual risk is limited to the status notice's placement in the current Agent Settings viewport.
