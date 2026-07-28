## Validation evidence

Date: 2026-07-27 (Asia/Hong_Kong)

### Regression proof

Before the store fix, both focused tests failed with the same contract violation:

- expected `playbackState: "playing"`;
- received `playbackState: "idle"` after `playback:previewPlanResult`.

After the directional stale transition was implemented:

```text
pnpm --dir packages/neko-canvas/packages/webview exec vitest run \
  src/stores/__tests__/playbackStore.test.ts \
  src/components/playback/PlaybackWorkspace.test.tsx \
  -t "clears Host-plan freshness|preserves active video playback when the Host plan settles"

2 passed, 30 skipped
```

### Package gates

```text
pnpm --dir packages/neko-canvas/packages/webview test
56 files passed, 335 tests passed

pnpm --dir packages/neko-canvas/packages/webview build
passed

pnpm --dir packages/neko-canvas test
22 files passed, 137 tests passed

pnpm --dir packages/neko-canvas compile
passed

pnpm build:vscode:dev
passed; staged aggregate Extension Development Host bundle rebuilt

pnpm exec openspec validate fix-canvas-storyline-playback-lifecycle --strict
passed

git diff --check
passed
```

The staged Canvas Webview bundle was byte-identical to
`packages/neko-canvas/dist/webview/assets/index.js`.

### Real VS Code Webview

Host: VS Code Extension Development Host with CDP on port 9222.

Workspace: `/Users/feng/Git/neko-test` only.

Fixture: `/Users/feng/Git/neko-test/Untitled.nkc`, using
`Cut Basic Functional Fixture.mp4` (H.264).

Black-box observations:

- Storyline opened and exposed one Play control.
- Play changed both transport and media controls to Pause.
- Fullscreen changed the control to “恢复播放浮层” without closing Storyline.

Webview/CDP observations:

- Storyline video: `readyState=4`, `paused=false`, `error=null`;
- `currentTime` advanced from `8.152464` to `10.83073`;
- overlay video size was `1050×591`;
- after fullscreen, `data-presentation="fullscreen"`;
- the same playback continued to `currentTime=26.009649`;
- fullscreen video size was `1325×745`;
- Console contained only VS Code's known
  `Unrecognized feature: 'local-network-access'.` container warning.

### Remaining risk

The exact sub-second Host-response race is deterministic only in the component
regression test because the real local Host usually answers before Computer Use
can perform a second UI action. The real Webview run validates the rebuilt
canonical Storyline and fullscreen media path; unsupported hardware codecs keep
their existing fail-visible diagnostic and were not treated as playback success.
