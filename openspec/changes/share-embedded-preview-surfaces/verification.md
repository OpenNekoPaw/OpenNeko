# Verification record

Date: 2026-08-14

## Review classification

- Risk: L4. The change replaces media rendering and authorization paths across Preview, Canvas, Agent, Assets and Electron, including a core Canvas playback workflow.
- Canonical owner: `@neko/preview-webview` owns one image/video/audio Viewer kernel and exposes `LightweightPreview` through its existing public root. Main Preview adds its own shell and persistent snapshot only.
- Runtime boundary: Renderer consumers receive exact authorized `PreviewMediaDescriptor` values. Desktop owns locator authorization, opaque `openneko://resource` projection, Range and lease lifetime.

## Passed verification

- Preview Webview: 20 files / 109 tests; build passed. Tests cover identical Main/Lightweight WebM `<video>` implementation, native lightweight video controls, Resource Browser ambient video parameters, Preview-owned lightweight audio waveform controls, non-source `play()` rejection, controlled playback, projection rerender without pause/restart, image containment with no component margin, loading/error and unmount cleanup.
- Canvas Webview: 65 files / 409 tests; build passed. Focused Preview registry, fullscreen and Host tests: 26 passed. Canvas Domain: 34 files / 285 tests.
- Desktop: typecheck passed; focused Canvas runtime: 27 tests. Descriptor cleanup remains idempotent after the active Workbench grant disappears, while cross-Window release is rejected before touching the lease.
- Agent focused media collection tests: 2 passed. Assets Webview: 7 files / 63 tests and production build passed. Asset Center catalog no longer owns a hover media renderer; selected Asset preview remains on the authorized Main Preview composition.
- Package, application, Webview and updated Canvas playback boundary checks passed. The Canvas boundary now requires `LightweightPreview` plus `preview:resolveResource` and rejects Canvas-local players or `media:*` preparation paths.
- OpenSpec strict validation passed for all changes.
- Authoritative Electron media qualification passed with a generated VP9/Opus WebM: native playback advanced and sought, WebGL/canvas frames changed, Range returned `206`, sender isolation held and leases were revoked on reload/close.
- Resource Browser audio hover now uses the same ambient `LightweightPreview` media parameter as video: the shared native `<audio>` starts automatically and no waveform, thumbnail card, title or transport controls are rendered. Pointer leave pauses the element and releases the exact hover lease. Assets Webview now passes 64 tests.
- Shared audio/video command arbitration classifies controlled `play()` / `pause()` acknowledgements separately from manual native-control interaction. Canvas hover can no longer promote itself to the manual owner, pointer leave cannot stop a manual owner, and a pending asynchronous play completion obeys a newer pause intent. Preview Webview now passes 20 files / 112 tests; Canvas remains 65 files / 409 tests.

Media qualification report:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-13T23-09-06.577Z-openneko/report.json`

## UI validation

- Direct inspection of the already-running OpenNeko development window caught a Vite package-export cache failure caused by a new `./lightweight` subpath. The component was moved to the existing `@neko/preview-webview/root` public entry; reload then restored the Desktop Shell without restarting the user-owned process.
- The isolated `canvas-openneko-consumer` scenario could not launch because an existing user development process owned this checkout's Vite bundle. The runner failed before CDP or product checkpoints. The full post-change Canvas visual matrix is therefore **blocked**, not passed.
- A focused retry after the lightweight control adjustment also failed before CDP became ready and produced no product checkpoints or screenshots. This is recorded as blocked runtime evidence rather than a media assertion pass or failure.
- The latest retry was blocked because an existing development process owned this checkout's Vite bundle; the isolated process exited before exposing a CDP target. The user-owned process was not stopped. No product checkpoint or screenshot was produced.
- Direct inspection of that development window opened the existing `test.nkc` Canvas through the product UI. The native video was visible with the expected Canvas compact presentation. Starting playback with its native control and moving the pointer outside the node left the control in the `暂停` state, confirming pointer leave did not overwrite the manual owner. The media was then paused through the native control and showed `播放` at the retained playhead.
- The current project resource list does not contain a standalone audio file at its top level, so audible Resource Browser audio hover and its no-overlay appearance remain blocked in the authoritative Desktop UI. The package-owned hover lifecycle and presentation assertions pass, but browser tests are supporting evidence only for this host-authorized path.

Blocked report:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-13T22-16-04.091Z-canvas-openneko-consumer-development/report.json`

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-13T22-47-06.662Z-canvas-openneko-consumer-development/report.json`

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-13T23-09-29.932Z-canvas-openneko-consumer-development/report.json`

## Blocked or unrelated gates

- Agent Webview full build is blocked by the pre-existing `extension-management/root.test.tsx` value `plugin-tools`, which is outside this media change; the affected media tests pass.
- `check:no-internal-versioning` is blocked by extensive unrelated Character/Project worktree findings and stale allowances. No reported new finding is in the changed preview/media paths.
- The Desktop package script ran the entire package despite a requested file argument and reported two unrelated existing assertions in Character authoring placement and Resource Browser Project View composition. The directly targeted Canvas runtime suite passed.

## Residual risk

- Rerun the visible isolated Canvas scenario after the development/CDP startup blocker is resolved to capture screenshots for WebM native inline playback, fullscreen playback, image centering, compact waveform audio controls and pointer release in one authoritative fixture.
- Browser codec support remains Chromium/Electron dependent; the canonical path no longer applies a caller-specific extension restriction, and VP9/Opus WebM is proven in the current Electron runtime.
