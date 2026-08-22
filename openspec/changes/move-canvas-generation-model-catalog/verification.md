## Verification

- `pnpm test` in `packages/canvas/domain`: passed, 38 files / 306 tests.
- `pnpm typecheck` in `packages/canvas/domain`: passed.
- `pnpm test` in `apps/neko-desktop`: passed, 102 files / 616 tests.
- `pnpm typecheck` in `apps/neko-desktop`: passed.
- `pnpm check:package-boundaries`: passed.
- `pnpm check:application-boundaries`: passed.
- `pnpm check:openspec`: passed, 136 items.
- `rg` for the deleted Desktop module and `projectDesktopCanvasGenerationModels`: no matches.

Residual risk: no visible Electron run was performed. The change preserves the pure projection shape
and has no user-visible layout or interaction impact, so UI validation is not applicable.
