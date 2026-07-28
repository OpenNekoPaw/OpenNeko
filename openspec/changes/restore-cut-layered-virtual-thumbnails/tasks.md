# Tasks

## 1. Freeze contract and feedback loop

- [x] 1.1 Add proposal, design, delta specification, and tasks.
- [x] 1.2 Add a deterministic failing planner test for a long Clip at high zoom.
- [x] 1.3 Record the old implementation/history comparison and confirm the
      collapsed Clip-wide cache as the regression boundary.

## 2. Implement the canonical tile path

- [x] 2.1 Replace thumbnail `sampleCount` with bounded density/tile request and
      result contracts.
- [x] 2.2 Implement visible-range plus overscan tile planning with stable density
      buckets.
- [x] 2.3 Generate tile frames through `FrameCapturePort` with correct Clip
      source-time mapping and per-tile failure semantics.
- [x] 2.4 Cache, reconcile, and discard thumbnail results by tile identity while
      retaining the waveform path.
- [x] 2.5 Render fixed-position tiles and delete the flex-stretched Clip-wide
      thumbnail strip.

## 3. Lifecycle and regression coverage

- [x] 3.1 Prove scrolling requests only missing tiles and zoom changes layers.
- [x] 3.2 Prove superseded batches abort and stale revisions/layers cannot render.
- [x] 3.3 Prove removed Clip-wide thumbnail payloads fail visibly and no Engine
      path participates.

## 4. Validate

- [x] 4.1 Run focused domain, Extension, and Webview tests/builds.
- [x] 4.2 Run repository build, test, check, quality, legacy-debt, and unused
      gates required by the cross-package contract change.
- [x] 4.3 Validate scroll/zoom thumbnail behavior in a real VS Code Extension
      Development Host using only `~/Git/neko-test`.
- [x] 4.4 Record validation commands, evidence, and remaining risks.
