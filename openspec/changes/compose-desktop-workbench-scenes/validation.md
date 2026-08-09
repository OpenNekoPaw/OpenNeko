# UI Validation

## Canonical Startup Entry — 2026-08-10

- Scope: Desktop Window startup selection, renderer reload boundary, retained navigation catalogs and
  Application Settings presentation.
- Authoritative runtime: real development Electron app using the normal user-data authority. The app
  was observed on Extensions, its exact development owner was stopped, and the same app was cold
  started again.
- Acceptance inventory:
  - cold application start shows a fresh unbound Entry Draft, not the last Extensions/Workspace scene;
  - retained Projects and Conversations remain visible and selectable in navigation;
  - same-process renderer reload preserves the exact current Extensions scene;
  - Settings exposes the canonical entry behavior as read-only information with no restore-last
    selector;
  - no overlapping panel, clipped composer or missing primary navigation is visible at the inspected
    window size.
- Result: passed by accessibility-tree assertions and direct pixel inspection of all three evidence
  images under
  `reports/ui-validation/compose-desktop-workbench-scenes/2026-08-10-startup-entry/`.
- Adjacent regression: the old Application Settings record was rejected and locally reset, producing
  one visible diagnostic; the diagnostic explicitly states that Workspace, Project, Conversation and
  other data were not reset. The isolated automated Canvas scenario was infrastructure-blocked before
  CDP attachment by development CLI option forwarding and is not counted as UI acceptance.
