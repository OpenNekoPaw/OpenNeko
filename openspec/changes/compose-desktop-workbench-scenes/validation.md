# UI Validation

## Canvas Generation Job Persistence Recovery — 2026-08-10

- Scope: Canvas image-generation submit, Workspace Generation owner initialization and node-local
  failure presentation. No layout or visual styling changed.
- Acceptance inventory:
  - a retired zero-row `generation_jobs` table is replaced by the canonical six-column shape before
    the first Job snapshot is written;
  - a populated non-canonical table is preserved and rejected with
    `generation-job-persistence-invalid`;
  - Workspace Job owner initialization failures return through the selected Generation node as an
    `outcome-unknown` diagnostic;
  - provider execution never starts before durable initial Job persistence and is not automatically
    retried.
- Deterministic result: passed. Full `@neko/generation` tests passed 29 files / 178 tests; full
  `@neko/canvas-node` tests passed 3 files / 19 tests; the Desktop Canvas runtime regression passed
  1 file / 20 tests. Both owning packages passed strict TypeScript checks.
- Local authority result: passed. The exact user database table was inspected read-only as zero rows
  with retired `revision` and `snapshot_version` columns. Running the package-owned initializer
  replaced it with `workspace_id, job_id, phase, snapshot_json, created_at, updated_at`; it remains
  zero rows, so no user Job or asset was deleted and no provider request was made.
- Authoritative visible-runtime result: blocked. The already-running development Electron restarted
  during validation but its renderer remained an empty document after `Cmd+R`, so the Canvas submit
  control could not be reached safely. No provider call or potentially charged retry was attempted.
  This is reported as a UI-validation blocker rather than counted as acceptance.

## Renderer Reload Surface Identity Handoff — 2026-08-10

- Scope: Workspace renderer identity replacement, outgoing Canvas/Cut/Resource Root disposal and
  Resource Browser snapshot qualification.
- Acceptance inventory:
  - `renderer-loading` immediately removes the outgoing Workbench presentation;
  - no package Root can request a snapshot with the retired renderer identity while loading;
  - the matching `renderer-ready` restores the Scene from one authoritative Shell snapshot;
  - Resource Browser continues to reject an actually stale identity, while the current replacement
    identity resolves without retry, rebasing or active-Workspace fallback.
- Deterministic result: passed. The focused renderer and Resource Browser suite passed 2 files and 50
  tests. The renderer regression observes the outgoing Workbench unmount before the replacement
  snapshot, while the Node runtime regression proves strict stale rejection plus current identity
  recovery.
- Authoritative runtime attempt: the isolated visible development Electron
  `canvas-openneko-consumer` scenario reached the canonical Workspace Canvas, loaded the EPUB image,
  exercised the rich-text node and connection hierarchy, and reported zero console errors, warnings
  or exceptions. It stopped on the scenario's existing Canvas-control hit-test assertion before the
  Resource Browser/Cut/reload checkpoints, so complete graphical acceptance is not claimed. The
  fail-visible report is
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-10T00-07-11.438Z-canvas-openneko-consumer-development/report.json`.
- Adjacent regression: the failed scenario did not emit the Resource Browser stale-owner diagnostic.
  Absence before the unexecuted Resource Browser checkpoint is supporting evidence only and does not
  replace the deterministic owner-identity tests.

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
