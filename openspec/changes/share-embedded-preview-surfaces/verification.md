# Verification record

Date: 2026-08-12

## Review classification

- Risk: L3. The change crosses Preview Domain/Webview, Agent, Assets, Canvas and the Electron authorization boundary.
- Canonical owner: `@neko/preview-webview` owns media viewer behavior; each consumer owns its surrounding chrome, grouping and interaction state.
- Runtime boundary: Renderer consumers receive only authorized `PreviewMediaDescriptor` values. Desktop owns locator authorization, opaque resource projection and lease lifetime.

## Passed verification

- Focused package tests passed for Preview Domain, Preview Webview, Assets Webview, Agent runtime/Webview, Canvas domain/Webview and Cut Webview.
- Preview Domain typecheck and Preview, Assets, Canvas and Cut Webview builds passed. Agent Webview build passed before unrelated extension-management contract edits appeared in the shared worktree.
- Preview architecture poison tests passed, including descriptor-only inputs, exact Surface registration and absence of replaced Agent media renderers.
- Canvas embedded preview tests cover grouped image outputs, video/audio resolution, keyboard switching, wheel containment, descriptor release on switching/close and late-resolution release after Surface disposal.
- `pnpm test:local:media-openneko` passed in the authoritative Electron runtime, including video/audio metadata, playback/seek, Range responses, image/PDF/model resources, sender isolation, PCM cancellation and resource revocation on reload/close.
- Package, application, Webview, Canvas playback and strict OpenSpec boundary checks passed when run independently.
- Focused diff whitespace validation passed.

Media qualification report:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-11T19-46-35.248Z-openneko/report.json`

## Blocked verification

- The complete build/type command is blocked by unrelated, concurrently modified Agent extension-management contracts (`installPlugin`, `updatePlugin`, operation and delivery-source shapes) and an unrelated Desktop automation inspector type drift.
- `pnpm test:functional:headless` is blocked by the unrelated obsolete `plugin.update` route expectation in `apps/neko-desktop/src/main/app-host.test.ts`.
- `pnpm check:no-internal-versioning` is blocked by unrelated Character/Automation changes and stale allowlist entries; no new finding points to this Preview change.
- Visible `pnpm test:local:ui` runs for the full inventory and Canvas-only scenario never mounted the product Shell. The root remained blank after Vite dependency optimization/reloads, with no console exception. Therefore direct visual acceptance is classified as **blocked**, not passed.

Blocked UI report:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-11T19-46-46.148Z-cut-openneko-consumer-development/report.json`

## Residual risks

- Direct image-capable review of concurrent Agent + Canvas style isolation, immersive keyboard navigation, zoom/playback and fail-visible states must be rerun after the Desktop Shell fixture mounts reliably.
- Canvas ordinary inline playback intentionally remains Canvas-owned; convergence with the shared immersive viewer is deferred until there is evidence that its timeline/viewport lifecycle can share the same owner.
- Large text/document rendering and large multi-output collections still need performance qualification with representative project data.
- The shared worktree contains extensive unrelated edits, so release readiness requires rerunning the unchecked tasks in `tasks.md` from a coherent branch/worktree.
