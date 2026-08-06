## 1. Final qualification

- [x] 1.1 Run focused shared UI/Canvas/resource tests and typechecks, strict OpenSpec validation and
      isolated Electron Desktop scenarios proving package-owned Roots, node authoring, playback,
      two-View isolation and cleanup with no demo/global/retired-host fallback.

## 2. Playback interaction regression

- [x] 2.1 Separate transient hover and manual Canvas media playback ownership, make Storyline transport
      requests immediate, and add focused regression tests proving pointer leave cannot stop manual
      playback and one click applies play or pause.
- [x] 2.2 Validate the changed Canvas Webview package, strict OpenSpec and the production Electron media
      path; record any runtime or 3D thumbnail follow-up risk.
      Validation: 330 Canvas Webview tests, package build, strict OpenSpec, architecture/playback
      boundary checks, and the real Electron `canvas-openneko-consumer` scenario passed. The remaining
      follow-up is package-owned 3D preview capture and revision-fenced thumbnail publication; until
      that producer exists, model assets intentionally retain the truthful generic model placeholder.
