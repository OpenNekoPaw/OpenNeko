## Verification

- `pnpm --filter @neko/host exec vitest run src/application-settings-contract.test.ts src/application-settings-state.test.ts`
- `pnpm --filter @neko/app-desktop exec vitest run src/renderer/DesktopSettingsSurface.test.tsx src/renderer/desktop-renderer-startup.test.ts src/renderer/desktop-theme.test.ts src/main/desktop-storage-settings-runtime.test.ts`
- `pnpm --filter @neko/host exec tsc --noEmit`
- `pnpm --filter @neko/app-desktop typecheck`
- `pnpm check:openspec`
- `git diff --check`

Focused tests and type checks passed. The storage runtime test proves directory usage projection, `${HOME}` locator persistence, and rejection of a default directory outside HOME. Existing projects are only read from metadata and are never rewritten by the setting update.

## UI validation

Authoritative runtime: visible isolated Electron Desktop, because native directory selection/opening and root sizing cross Main/preload/Renderer.

`pnpm test:local:ui --scenario no-active-project-catalogs` was attempted. The runtime was blocked before application interaction because the Desktop CDP target did not become ready before timeout (`fetch failed`). Component rendering and contract tests passed, but they do not substitute for visual Desktop acceptance. Overlay fit, native directory actions, small-window layout, and pixel-level font-size review remain blocked.
