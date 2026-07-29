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
  Preview media third and title/full-bleed/close actions last. Each Overlay
  mount starts with Preview collapsed. First playback or full-bleed entry
  reveals Preview for the rest of that mount; pause, end, stale and restore do
  not hide it. Closing and reopening Storyline creates a new collapsed mount.
  The same Overlay remains docked at the Canvas top without a dimming backdrop,
  modal semantics or pointer interception outside its shell.
- Preview visibility is a single local latch owned by
  `StorylinePlaybackOverlay`; it is not playback-session/store state and is no
  longer directly derived from `playbackState`. This keeps playback lifecycle
  and transient presentation lifecycle separate without adding another
  surface or compatibility path.
- Previous, play/pause and next controls occupy the true horizontal center.
  Route position remains secondary at the right edge. Current/total time text
  and time-formatted Seek tooltips are absent, while relative Seek progress and
  internal playback timing remain functional.
- Story nodes use `sourceNodeId` as graph identity and Canvas reveal identity.
  Routes provide branch lanes and `unitId` occurrences without creating a
  second persisted route model. Node spacing is structural rather than
  duration-proportional.
- Storyline node activation, route selection and previous/next navigation issue
  one viewport reveal. Playback start/pause, automatic advance and Seek only
  synchronize the session. The reveal path does not write Canvas selection or
  persistent playback-highlight state, so it cannot open node action controls.
- No Matrix store, renderer, projection, CSS, localization key, hidden
  compatibility flag, fallback renderer, persistent Storyline panel,
  persisted or parallel Preview visibility state, resizable Preview pane, or
  second playback controller remains.
- Reuse review: the existing `PlaybackWorkspace`, playback controller, viewport
  store, localization runtime, theme tokens, keyboard-boundary metadata and
  shared Toolbar primitives were extended in place. Session synchronization
  and one-shot viewport navigation are explicit paths; the obsolete
  `activePlayingNodeId` Canvas store state was deleted. The only new shared UI
  assets are generic fullscreen/restore and Storyline branch icons in the
  existing shared icon package. The Canvas Toolbar now uses the Storyline icon
  instead of a generic play triangle.
- Audio-node follow-up risk is L1 within the existing L4 change. The Canvas
  node now selects an explicit `node-card` layout while Storyline keeps the
  default compact transport. Both layouts reuse `PreviewSurface`,
  `useMediaStream`, `InlineAudioPlayer`, the Engine audio lifecycle, theme
  tokens, shared icons and shared `ProgressBar`; no message, Engine, path or
  persisted Canvas contract changed.
- The node card owns one title row, a seekable waveform silhouette and a
  three-column time / centered play-pause / volume row. The waveform is an
  audio/navigation silhouette rather than an asserted amplitude analysis.
  Neither the node nor Storyline contains a nested playback card, and the node
  intentionally exposes no download action.

## Automated checks

- Focused Canvas Webview run:
  `pnpm exec vitest run src/components/playback/PlaybackWorkspace.test.tsx src/components/playback/CanvasPlaybackController.test.tsx src/CanvasApp.layout.test.ts src/stores/__tests__/canvasStore.test.ts src/stores/__tests__/runtimeViewportStore.test.ts src/stores/__tests__/playbackStore.test.ts`
  - Passed: 6 files, 64 tests.
  - Covers shared prefixes, branches, merges, same-label source identities,
    route emphasis, compact node content, top-docked non-modal collapsed state,
    in-place non-modal Preview expansion, persistence across pause and
    full-bleed restore, close/reopen reset, stable Storyline geometry,
    full-bleed/close/Escape, dedicated Toolbar icon, single presentation
    component, centered time-free controls, relative Seek, single controller
    ownership, one-shot source reveal and selection-free playback sync.
- Preview lifecycle regression:
  `pnpm exec vitest run src/components/playback/PlaybackWorkspace.test.tsx`
  - Confirmed red before implementation: 2 failed, 18 passed.
  - Passed after implementation: 1 file, 20 tests.
- Audio layout focused run:
  `pnpm --filter @neko-canvas/webview exec vitest run src/components/media/InlineMediaPlayer.test.tsx src/preview/PreviewRendererRegistry.test.tsx src/components/nodes/CanonicalContentNodes.test.ts src/CanvasApp.layout.test.ts`
  - Red evidence: the new Canvas node waveform-card assertion failed before
    the explicit layout was implemented.
  - Passed after implementation: 4 files, 33 tests.
- `pnpm test` in `packages/neko-canvas-webview`
  - Passed: 56 files, 321 tests.
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
    cruise checked 1,297 modules and 4,315 dependencies with zero violations.
- `pnpm check:quality`
  - Passed, including Canvas playback, Webview, application, content-access,
    strict TypeScript, test-ownership and all OpenSpec boundaries.
- `pnpm check:legacy-debt`
  - Passed with zero blocking findings.
- `pnpm check:unused`
  - Passed with configuration hints only.
- `pnpm check:canvas-playback-boundary` and `pnpm check:webview-boundaries`
  - Passed.
- `pnpm lint` in `packages/neko-canvas`
  - Passed with zero errors. It reports 33 pre-existing warnings outside the
    changed Storyline production path; the three hook warnings in
    `PlaybackWorkspace` were removed during review.
- `pnpm exec openspec validate replace-canvas-route-matrix-with-storyline-graph --strict`
  - Passed.
- Scoped Prettier write, `git diff --check` and residual identifier scan
  - Passed. Remaining Matrix and resize terms are documentation or negative
    regression assertions.
- Root `pnpm ci:local`
  - Passed after aligning the `neko-assets` protocol test with VS Code's
    contribution-inferred View activation contract.
  - Format, lint, build, 28/28 full-repository test tasks, repository quality,
    85/85 test-orchestration checks, 58/58 strict OpenSpec validations and 4/4
    local VS Code configuration checks completed successfully.

Vite reported the existing chunk-size and stale `caniuse-lite` advisories.
Existing React test-environment `act(...)` warnings also appeared in unrelated
packages; neither warning class failed a changed package.

## Extension Development Host

- Host: isolated `[扩展开发宿主] Untitled.nkc — neko-test`, VS Code CDP port
  `9222`, Canvas Webview target `7F594E002549A56D59CC81CDA1861E20`.
- `pnpm smoke:vscode:targets -- --skill vscode-extension-debugger` and
  `pnpm smoke:webview:targets` passed. The target inventory identified the
  Extension Development Host and its Canvas iframe without using the normal
  VS Code window.
- `pnpm build:vscode:dev` passed and staged all seven development features.
  Only the isolated Extension Development Host was reloaded.
- Collapsed Overlay measurement:
  `x=241.5`, `y=12`, `width=1080`, `height=261.25`,
  `storylineHeight=148`, `aria-modal=null`, layer `z-index=1000`.
- Playing Overlay measurement:
  `x=241.5`, `y=12`, `width=1080`, `height=820`,
  `storylineHeight=148`, `aria-modal=null`, transparent layer with
  `pointer-events:none`. Preview was mounted below the unchanged Storyline and
  controls.
- Clicking Storyline node 2 moved the Canvas viewport once from
  `translate(177.5px, 236px) scale(1)` to
  `translate(-291.5px, 244px) scale(1)`. Starting playback did not change that
  transform. Manual previous navigation returned the viewport to the first
  node.
- Canvas selected-node count, persistent playback-active count and selection
  context toolbar presence all remained zero after Storyline navigation and
  playback. No Canvas toolbar was painted above the expanded Preview.
- Preview lifecycle observations after reloading only the isolated development
  host:
  - opening Storyline: `expanded=false`, `presentation=overlay`, Preview absent;
  - starting playback: `expanded=true`, Preview mounted;
  - pausing: `expanded=true`, Preview remained mounted;
  - closing and reopening Storyline: `expanded=false`, Preview absent;
  - entering full-bleed before playback: `expanded=true`, Preview mounted;
  - restoring the top-docked Overlay: `expanded=true`, Preview remained mounted.
- Canvas Webview console contained only VS Code's known
  `local-network-access` warning and an autoplay-policy `AudioContext` warning
  while validating the audio fixture; neither represented a Canvas CSP,
  resource or runtime failure.
- Audio-node runtime follow-up used the same isolated host after staging and
  reloading only the development extension. The current Canvas iframe target
  was `4817021C7235464C2CAC8792C3E472A3`.
- Host UI exposed the Canvas audio title, disabled pre-stream Seek, `0:00 /
--:--`, centered Play and disabled pre-stream Mute. After playback started,
  the same controls became an enabled Seek slider, `0:00 / 3:05`, Pause and
  Mute without opening node selection actions.
- CDP measured the node player as `border-width: 0`, transparent background and
  `box-shadow: none`, with `40` waveform bars, one accessible Seek slider,
  three control columns, zero nested `.canvas-audio-transport` elements and
  zero download controls.
- Storyline route `Untitled 2` remained on the compact transport path. Its
  expanded Preview contained zero node waveform/title elements, a transparent
  borderless horizontal transport and only Pause/Mute media controls.
- The audio-node and Storyline regression console contained only VS Code's
  known `local-network-access` warning.
- Evidence screenshot:
  `reports/webview-functional/canvas-storyline/in-place-playing-overlay.png`
  (gitignored raw runtime evidence).
- Preview-latch evidence screenshot:
  `reports/webview-functional/canvas-storyline/preview-visibility-latched.png`
  (gitignored raw runtime evidence; paused transport with Preview still
  expanded).

### Storyline navigation simplification follow-up

- Risk: L2 Webview interaction/media presentation change within the existing
  Storyline Overlay. The route plan, playback store, Extension messages,
  Engine stream and persisted Canvas contract were unchanged.
- Reuse review: the existing `StorylinePlaybackOverlay`,
  `CanvasPlaybackControls`, `PreviewSurface`, route-selection callback,
  localization runtime and theme tokens were modified in place. No new
  component, playback owner, route model or package-local UI foundation was
  introduced.
- Regression tests were red before implementation for the redundant heading,
  missing conditional selector and duplicate controlled Preview launch. After
  implementation,
  `pnpm exec vitest run src/components/playback/PlaybackWorkspace.test.tsx src/preview/PreviewRendererRegistry.test.tsx`
  passed 2 files / 29 tests.
- `pnpm exec vitest run` in
  `packages/neko-canvas-webview` passed 56 files / 323 tests.
- `pnpm --filter @neko-canvas/webview build` and
  `pnpm --dir packages/neko-canvas compile` passed. The latter rebuilt and
  copied the Webview assets consumed by the Extension Development Host.
- `pnpm check:legacy-debt`, `pnpm check:unused`,
  `pnpm check:canvas-playback-boundary`,
  `pnpm check:webview-boundaries`, strict OpenSpec validation,
  scoped Prettier, residual selector scans and `git diff --check` passed.
  `check:unused` reported existing configuration hints only.
- Runtime host: isolated `[扩展开发宿主] Untitled.nkc — neko-test`; only this
  host was reloaded. CDP page target
  `21F0F967C6D4E434EBF088345CF4175C`, Canvas iframe target
  `BD43D386B996948B10830A68F1F9A6CD`.
- Host UI showed one compact `故事路线` selector for the two-route fixture,
  no “故事线 + 当前路线” heading/Tab row, and only the centered
  previous-node / play-pause / next-node transport.
- In full-bleed idle video Preview, CDP measured
  `headingRows=0`, `routeSelectors=1`, `routeTabs=0`,
  `controllerButtons=3`, `controlledIdleSurfaces=1` and
  `previewPlayButtons=0`.
- Dispatching the selector's second valid route changed the selected route to
  the audio source, updated the current Storyline node and footer to
  `test.aac`, and kept the same Overlay/session.
- Canvas iframe console contained only VS Code's known
  `local-network-access` warning; no Neko CSP, resource, media or runtime error
  was observed. Escape closed the entire verification Overlay.

### Compact Storyline and explicit Preview reveal follow-up

- Risk: L1 Webview layout and local interaction change. The playback plan,
  route/session store, Extension messages, media lifecycle and persisted Canvas
  contract were unchanged.
- Architecture review:
  - Responsibility: `StorylinePlaybackOverlay` continues to own the temporary
    Preview-revealed latch for one mounted Overlay lifecycle.
  - Dependency: the change remains inside the Canvas Webview and reuses
    `@neko/ui` `IconButton`, the shared `EyeIcon`, existing theme tokens and
    localization runtime.
  - Interface: no store field, Webview message, public component contract or
    Engine/Proto contract was added.
  - Extension: height remains one CSS invariant across top-docked, full-bleed
    and narrow layouts; additional lanes continue through the existing
    scrollable viewport.
  - Testing: component behavior, static layout boundaries, production build,
    repository quality gates and the real Extension Host path were all
    exercised.
- Regression tests were red before implementation for the missing reveal
  action and old 204–240px Storyline height. After implementation,
  `pnpm exec vitest run src/components/playback/PlaybackWorkspace.test.tsx src/CanvasApp.layout.test.ts`
  passed 2 files / 43 tests.
- `pnpm exec vitest run` in
  `packages/neko-canvas-webview` passed 56 files / 324 tests.
- `pnpm --filter @neko-canvas/webview build`,
  `pnpm --dir packages/neko-canvas compile`,
  `pnpm check:legacy-debt`, `pnpm check:unused`,
  `pnpm check:canvas-playback-boundary`,
  `pnpm check:webview-boundaries`, strict OpenSpec validation, scoped Prettier
  and `git diff --check` passed. `check:unused` reported existing
  configuration hints only.
- Runtime host: isolated `[扩展开发宿主] Untitled.nkc — neko-test`; only this
  host was reloaded. CDP page target
  `21F0F967C6D4E434EBF088345CF4175C`, Canvas iframe target
  `A83B5B544543743C66DEBBA663BD70C9`.
- Collapsed Overlay measured `storylineHeight=168`,
  `viewportOverflowY=auto`, `expanded=false`, Preview absent and one localized
  `显示预览` action. Clicking that action changed the same Overlay to
  `expanded=true` and mounted the current Preview while the main transport
  remained `播放`; no hide-Preview action appeared.
- Full-bleed kept `storylineHeight=168`, Preview mounted and both reveal/hide
  actions absent. Restoring did not collapse Preview. Closing and reopening the
  Overlay returned to `expanded=false` with `显示预览` present.
- Canvas iframe console contained only VS Code's known
  `local-network-access` warning.
- Evidence screenshot:
  `reports/webview-functional/replace-canvas-route-matrix-with-storyline-graph/compact-storyline-collapsed.png`
  (gitignored raw runtime evidence).

### Stable media facts and presentation-preserving playback follow-up

- Risk: L3 Canvas Webview media lifecycle and playback-state correction within
  the existing L4 Storyline change. Engine/Proto messages, persisted Canvas
  data and Extension ownership were unchanged.
- Architecture review:
  - Responsibility: Engine probe results own media facts; the mounted
    `PreviewSurface` owns the presentation-local description; the playback
    session owns playing/paused state and current playhead; Overlay/full-bleed
    presentation owns none of those facts.
  - Dependency: Canvas and Storyline surfaces reuse the existing
    `media:probe` / `media:play` path and the same audio/video renderer hooks.
    No second metadata cache, media client or playback component was added.
  - Interface: the only new component option suppresses the duplicate
    controlled Preview play action. No cross-package or host message contract
    changed.
  - Extension: audio and video share idle probing, controlled state, duration
    projection and pause-intent semantics. Presentation changes remain a CSS
    state change around one mounted Preview instance.
  - Testing: regressions cover idle metadata, controlled media state,
    paused-stream closure, playhead preservation and Preview identity.
- Regression evidence was red before implementation:
  - idle audio/video cases failed because no `media:probe` was sent;
  - the Storyline resume case reset `0.75s` to `0`;
  - paused audio/video stream-end cases incorrectly invoked completion.
    After implementation,
    `pnpm exec vitest run src/components/media/InlineMediaPlayer.test.tsx src/components/playback/PlaybackWorkspace.test.tsx src/preview/PreviewRendererRegistry.test.tsx`
    passed 3 files / 45 tests.
- `pnpm test` in the Canvas Webview passed 56 files / 334 tests.
  `pnpm test` in `packages/neko-canvas` passed 19 files / 102 tests.
  `pnpm compile` in `packages/neko-canvas` passed and rebuilt the Extension
  and Webview assets.
- `pnpm lint` in `packages/neko-canvas` passed with 0 errors and 27 existing
  warnings. `pnpm check:legacy-debt`, `pnpm check:unused`,
  `pnpm check:canvas-playback-boundary`, `pnpm check:webview-boundaries`,
  strict OpenSpec validation and `git diff --check` passed.
  `check:unused` reported existing configuration hints only.
- Runtime host: isolated `[扩展开发宿主] Untitled.nkc — neko-test`; only this
  host was reloaded. CDP page target
  `21F0F967C6D4E434EBF088345CF4175C`; final Canvas iframe target
  `3D34501A8F5EDE203CE67F5381DE4458`.
- Before playback, Canvas video and audio nodes independently exposed probed
  durations `26.3s` and `185.96589s` without sending `media:play`. The
  Storyline controlled audio Preview showed `0:00 / 3:05` with only the main
  Storyline transport as a start action.
- Audio runtime verification played in full-bleed, paused at `0:08 / 3:05`,
  restored the Overlay and retained the same Preview DOM node, duration,
  paused state and playhead.
- Video runtime verification played in full-bleed, paused at `0:12 / 0:26`,
  retained the live Preview rather than falling back to the poster, then
  restored the Overlay with the same Preview DOM node, `26.3s` duration,
  paused state and playhead.

### Persistent Preview visibility toggle follow-up

- Risk: L1 Canvas Webview interaction correction. The existing
  `StorylinePlaybackOverlay` local latch remains the only Preview visibility
  owner; playback store, Preview request identity, Extension messages,
  Engine/Proto and persisted Canvas data were unchanged.
- Architecture review:
  - Responsibility: starting playback and entering full-bleed may reveal the
    local latch; the top-docked footer can explicitly set it visible or hidden.
    Full-bleed only forces presentation visibility and does not become another
    state owner.
  - Dependency and reuse: the existing `IconButton`, shared `EyeIcon` /
    `EyeOffIcon`, localization runtime and one mounted Preview surface were
    reused. No new component, store field or fallback path was introduced.
  - Testing: the regression asserts action replacement in both directions,
    manual hiding while playback remains active, and the existing full-bleed
    no-hide invariant.
- Red evidence: the focused suite failed because expanded top-docked mode had
  no `hide-preview` action and because `isPlaying` kept `expanded=true` after a
  manual hide attempt. After the fix,
  `pnpm exec vitest run src/components/playback/PlaybackWorkspace.test.tsx src/CanvasApp.layout.test.ts`
  passed 2 files / 46 tests.
- `pnpm test` in the Canvas Webview passed 56 files / 335 tests.
  `pnpm test` in `packages/neko-canvas` passed 19 files / 102 tests.
  `pnpm compile` and `pnpm typecheck` in `packages/neko-canvas` passed.
- `pnpm lint` in `packages/neko-canvas` passed with 0 errors and 27 existing
  warnings. Canvas playback/Webview boundary checks, strict OpenSpec
  validation and `git diff --check` passed.
- Runtime host: isolated `[扩展开发宿主] Untitled.nkc — neko-test`; only this
  host was reloaded. CDP page target
  `21F0F967C6D4E434EBF088345CF4175C`, Canvas iframe target
  `2E4658C49BA5A0D4E615951166CCAD9C`.
- Black-box UI verification observed `显示预览` in the collapsed Overlay,
  `隐藏预览` after reveal, and `显示预览` again after explicit hide. Reopening the
  Preview and entering full-bleed removed both visibility actions while
  retaining Preview content and the restore action.
- CDP confirmed full-bleed state
  `presentation=fullscreen`, `expanded=true`, Preview mounted, and only
  `toggle-overlay-fullscreen` plus `close-overlay` footer actions. The Canvas
  iframe console contained only VS Code's known `local-network-access`
  warning.

## Remaining risk

- Root test health remains red because of the unrelated `neko-assets` activation
  event assertion described above.
- The runtime scenario used the isolated synthetic `neko-test` workspace and
  its two-node/two-route fixture. The single-route selector omission and dense
  branch routing remain covered by deterministic component/layout tests rather
  than separate visual fixtures.
- The Canvas waveform is currently a deterministic silhouette used for media
  recognition and Seek position, not decoded per-file amplitude data. A real
  waveform would require a separately specified Engine/preview-analysis
  contract.
- The isolated fixture's playback/session and viewport state changed during
  runtime validation; no project document, generated-output record, extension
  setting or normal VS Code user data was written.
