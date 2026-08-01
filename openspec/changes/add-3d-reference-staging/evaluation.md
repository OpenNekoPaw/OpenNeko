# Agent Evaluation: add-3d-reference-staging

## Current Desktop scope

- Canonical path: Electron Desktop Preview → live purpose captures → one revisioned `3d-reference`
  context → Agent context/evidence projection → Canvas/media purpose mapping → exact provider/model
  capability validation → submission.
- Required cases: one supported appearance or pose/depth submission and one unsupported-control
  rejection before submission.
- Required evidence: Preview View/session/revision, output roles and stable resource identities,
  effective provider/model, projected controls, terminal result, diagnostics, and no-fallback facts.
- Forbidden paths: legacy `model-preview`, generic-image conversion, pose/depth as appearance,
  prompt-only success, dropped controls, provider rerouting, direct 3D upload, direct turn injection,
  retired Host composition, or mock media submission.

## Remaining acceptance

The owning Preview functional scenarios must run in an isolated Electron Desktop fixture and cover
guide creation, preset selection, pose, camera, panorama, purpose toggles, send, reload, multi-View
isolation, and disposal. Real-provider behavior remains blocked until the Desktop Preview context can
enter the normal Agent input path with a supported configured model. Browser-only, TUI, VS Code, or
synthetic direct injection does not count as acceptance.
