## Verification

- `pnpm --filter @neko/host exec vitest run src/ai-model-settings-service.test.ts src/settings/__tests__/config-manager.test.ts`
- `pnpm --filter @neko/app-desktop exec vitest run src/main/desktop-media-execution-provider.test.ts src/renderer/DesktopSettingsSurface.test.tsx`
- Host and Desktop strict type checks passed.

The canonical `default_models` update validates exact Provider ownership and model type, preserves sibling defaults, and is consumed by the existing generation provider resolver. No generation routing or provider fallback is duplicated in Renderer.

## UI validation

Visible Electron validation of image/video/audio selection, missing-model state, and narrow-window presentation was attempted through the isolated Desktop functional runtime but was blocked while waiting for the CDP target. Real image/video/audio provider execution was not run and remains an explicit residual risk.
