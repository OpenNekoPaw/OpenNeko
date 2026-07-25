# Verification

## Passed

- `pnpm --filter @neko-canvas/webview test`
- `pnpm --filter @neko-canvas/webview build`
- `pnpm --filter @neko-canvas/extension build`
- `pnpm --filter neko-canvas compile`
- `pnpm exec vitest run packages/neko-canvas/packages/extension/src packages/neko-canvas/packages/webview/src/components/nodes/CanonicalContentNodes.test.ts packages/neko-canvas/packages/webview/src/components/selection/SelectionMaterialGenerationBar.test.tsx packages/neko-canvas/packages/webview/src/components/playback packages/neko-canvas/packages/webview/src/stores/__tests__/playbackStore.test.ts`
- `pnpm build`
- `pnpm test`
- `pnpm check`
- `pnpm check:legacy-debt`
- `pnpm test:agent:eval`
- `git diff --check`

The Canvas tests cover the canonical six-node renderer registry, the 2/3/2
user add catalog without empty Job authoring, shared toolbar/context-menu
catalog projection, node transforms and ports, connection rendering/editing,
shared Markdown rendering, Preview workspace, route/storyboard matrix,
generation provenance, and the Engine/`@neko/neko-client` media path without
native `<audio>` or `<video>` fallback.

## Runtime blocker

Extension Development Host acceptance remains `configuration-invalid`.

The debugger preflight could not connect to port 9222. A temporary local,
gitignored `Debug Dev (All)` configuration was then used to launch the current
Canvas bundle, but VS Code reused a Host rooted at
`~/OpenNekoProjects/neko-git-compatibility-acceptance` instead of the required
isolated `~/Git/neko-test` workspace. The Host was closed before opening a
Canvas or running any assertions, and the temporary debug files were deleted.

No ordinary browser, Vite page, or wrong-workspace screenshot is counted as
Webview acceptance. Tasks 5.4 and 6.5 remain open until a verified VS Code
Workbench page and Canvas iframe are available against the isolated fixture.
