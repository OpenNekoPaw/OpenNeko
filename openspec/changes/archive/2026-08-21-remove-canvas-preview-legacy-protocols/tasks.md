## 1. Canvas legacy variant preview

- [x] 1.1 Delete `canvas/webview/src/preview/previewResolver.ts` and `previewRuntime.ts` with their tests; trim dead types from `preview/types.ts`; drop the `runtime` prop and import from `PreviewRendererRegistry.tsx`; remove the `preview:resolveVariant` case from `host-runtime/canvas-webview-host.ts`.

## 2. Desktop variant handler/channel

- [x] 2.1 Remove `resolvePreviewVariant` (and `previewLeaseKey`/`canvasPreviewDisplayName`) from `desktop-canvas-runtime.ts`; remove `resolveCanvasPreviewVariant` from `app-host.ts`; remove the `previewVariantResolve` channel registration from `ipc.ts`.
- [x] 2.2 Remove the variant method, channel, request/result types and parsers from `canvas-bridge-contract.ts` and the preload bridge `resolvePreviewVariant`; remove the variant branch from `desktop-canvas-webview-delegate.ts`.
- [x] 2.3 Remove variant fixtures/tests from `desktop-canvas-runtime.test.ts`, `canvas-bridge-contract.test.ts`, `desktop-canvas-webview-delegate.test.ts`, and `DesktopAgentSurface.test.tsx`.

## 3. Preview Engine playback

- [x] 3.1 Delete the `EngineVideoPlayer`/`EngineAudioPlayer` branches from `VideoPlayer.tsx`/`AudioPlayer.tsx`; remove the legacy `preview:init`/`playbackReady`/`frameData`/`operationFailed` message types; remove `useHostReady`; delete `video/main.tsx`/`audio/main.tsx` if unconsumed.
- [x] 3.2 Remove Engine fixtures/tests.

## 4. Path-level verification

- [x] 4.1 Assert `preview:resolveVariant`/`preview:variantResolved` are absent from canvas host and desktop delegate/contract; assert `preview:resolveResource` canonical path remains.
- [x] 4.2 Assert the Preview Engine messages and `Engine*` components are unreachable; canonical source-URL players remain.

## 5. Gates

- [x] 5.1 `pnpm --filter @neko/canvas-webview --filter @neko/preview-webview run typecheck` and tests.
- [x] 5.2 `pnpm typecheck:desktop`.
- [x] 5.3 `pnpm check:canvas-playback-boundary`, `check:content-access-boundaries`, `check:webview-boundaries`, `check:no-internal-versioning`, `check:unused`, `check:legacy-debt`, `check:openspec`.
