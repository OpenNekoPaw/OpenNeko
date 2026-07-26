# Verification

Date: 2026-07-26

## Risk and review

- Risk class: L4. The change replaces a core Canvas playback/navigation surface
  and removes a large legacy path, but does not change persisted Canvas data,
  Proto, Engine, or Extension/Webview messages.
- Quality review findings: none in the changed production path.
- Canonical-path review confirmed that Storyline, the single playback control
  presentation and Preview all belong to one Overlay. No persistent route or
  Preview panel exists outside it.
- `PlaybackWorkspace` mounts one `StorylinePlaybackOverlay` presentation
  component. That component owns the Storyline graph, controls, collapsible
  Preview markup and footer; the removed `StorylineGraph` and `PlaybackStage`
  component composition cannot be mounted independently.
- The Overlay renders Storyline first, controls/progress second, conditional
  Preview media third and title/full-bleed/close actions last. Idle, paused and
  stale states dock the same Overlay at the Canvas top without a dimming
  backdrop, modal semantics or pointer interception outside the compact strip.
  Playing centers the same Overlay, enables its modal backdrop and mounts the
  existing Preview surface; pausing returns it to the top-docked state.
- Previous, play/pause and next controls occupy the true horizontal center.
  Route position remains secondary at the right edge. Current/total time text
  and time-formatted Seek tooltips are absent, while relative Seek progress and
  internal playback timing remain functional.
- Story nodes use `sourceNodeId` as graph identity and Canvas reveal identity.
  Routes provide branch lanes and `unitId` occurrences without creating a
  second persisted route model. Node spacing is structural rather than
  duration-proportional.
- No Matrix store, renderer, projection, CSS, localization key, hidden
  compatibility flag, fallback renderer, persistent Storyline panel,
  independent Preview visibility state, resizable Preview pane, or second
  playback controller remains.
- Reuse review: the existing `PlaybackWorkspace`, playback controller, viewport
  store, localization runtime, theme tokens, keyboard-boundary metadata, shared
  Toolbar primitives and Canvas selection path were extended in place. The only
  new shared UI assets are generic fullscreen/restore and Storyline branch
  icons in the existing shared icon package. The Canvas Toolbar now uses the
  Storyline icon instead of a generic play triangle.

## Automated checks

- Focused Canvas Webview run:
  `pnpm exec vitest run src/components/playback/storylineGraphLayout.test.ts src/components/playback/CanvasPlaybackController.test.tsx src/components/playback/PlaybackWorkspace.test.tsx src/components/toolbar/CanvasToolbar.test.tsx src/stores/__tests__/playbackStore.test.ts src/CanvasApp.layout.test.ts --maxWorkers=1`
  - Passed: 6 files, 62 tests.
  - Covers shared prefixes, branches, merges, same-label source identities,
    route emphasis, compact node content, top-docked non-modal collapsed state,
    centered modal playing state, pause return, full-bleed/close/Escape,
    dedicated Toolbar icon, single presentation component, centered time-free
    controls, relative Seek, single controller ownership and source-node reveal.
- `pnpm test` in `packages/neko-canvas/packages/webview`
  - Passed: 55 files, 307 tests.
- `pnpm test` in `packages/neko-canvas`
  - Passed: 19 files, 102 tests, including the Extension protocol path.
- `pnpm test` in `packages/neko-types`
  - Passed: 170 files, 1,412 tests, including the shared Storyline icon.
- `pnpm compile` in `packages/neko-canvas`
  - Passed: Extension build, Webview TypeScript/Vite production build and
    staged package assets.
- `pnpm build:vscode:dev`
  - Passed and staged the seven-feature development extension, including the
    changed Canvas Webview.
- `pnpm check`
  - Passed: unused-code scan completed with configuration hints only; dependency
    cruise checked 1,297 modules and 4,316 dependencies with zero violations.
- `pnpm check:quality`
  - Passed, including Canvas playback, Webview, application, content-access,
    strict TypeScript, test-ownership and all OpenSpec boundaries.
- `pnpm check:legacy-debt`
  - Passed with zero blocking findings.
- `pnpm lint` in `packages/neko-canvas`
  - Passed with zero errors. It reports 33 pre-existing warnings outside the
    changed Storyline production path; the three hook warnings in
    `PlaybackWorkspace` were removed during review.
- `pnpm exec openspec validate replace-canvas-route-matrix-with-storyline-graph --strict`
  - Passed.
- Scoped Prettier write, `git diff --check` and residual identifier scan
  - Passed. Remaining Matrix and resize terms are documentation or negative
    regression assertions.
- Root `pnpm test`
  - Did not complete: Turbo stopped after an unrelated `neko-assets` protocol
    test expected `onView:neko.entityInspector` in the current package manifest.
    The failure is outside the changed files. All affected Canvas and shared
    package suites passed independently.

Vite reported the existing chunk-size and stale `caniuse-lite` advisories.
Existing React test-environment `act(...)` warnings also appeared in unrelated
packages; neither warning class failed a changed package.

## Extension Development Host

No VS Code instance was launched, reloaded or manipulated for the corrected
Overlay/branch-graph design. This intentionally follows the safety constraint
established after the user's current VS Code/Webview service-worker conflict.

An earlier isolated-host run validated the superseded right-panel design. It is
not accepted as runtime evidence for the corrected layout.

## Remaining risk

- The top-docked Overlay sizing, compact-to-centered transition, click-through
  Canvas behavior, visual branch routing, focus containment and real media
  playback have component and build coverage but no fresh Extension Development
  Host visual acceptance.
- Root test health remains red because of the unrelated `neko-assets` activation
  event assertion described above.
- No local project, generated-output record, extension state or VS Code user data
  was changed as part of this UI correction.
