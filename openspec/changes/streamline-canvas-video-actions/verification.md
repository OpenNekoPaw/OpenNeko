## Quality Review

- Risk level: L3. The change crosses Canvas domain/Webview, Desktop identity projection, and the Cut
  application runtime, but preserves one canonical command path and does not migrate user data.
- Canonical owner: `@neko/canvas-domain` owns material-action descriptors and payload validation;
  `@neko/canvas-webview` owns toolbar presentation; Desktop owns exact visible Workbench/Cut projection;
  `@neko/cut-node` owns media probing, import/link behavior, OTIO commands, and snapshot publication.
- Canonical path: Canvas descriptor -> Canvas host intent -> Desktop target revalidation ->
  `CutApplicationRuntime.addResource` -> Cut document session. No renderer OTIO mutation, hidden/recent Cut
  fallback, alternate media importer, or source rewrite is introduced.

## Automated Verification

Passed:

- Canvas domain: 29 files, 246 tests.
- Canvas Webview: 57 files, 329 tests.
- Cut Node: 5 files, 18 tests.
- Desktop unit/contract: 71 files, 469 tests.
- Desktop headless functional: 11 files, 148 tests.
- Canvas domain, Canvas Webview, Cut Node, and Desktop typechecks.
- Application/Webview boundaries, internal-versioning and canonical-path audit, legacy-debt scan,
  Canvas playback boundary, and content-access boundary checks.
- OpenSpec strict validation, focused Prettier validation, and `git diff --check`.
- Focused ESLint had no errors. Its three warnings are pre-existing or outside this change: the Desktop
  non-null assertion, the toolbar selection-effect dependency, and the Cut filename regex.

`pnpm check:unused` remains blocked by the unrelated uncommitted export
`activateWorkbenchMainView` in `apps/neko-desktop/src/renderer/DesktopShell.tsx`.

## Desktop UI Evidence

The authoritative `canvas-openneko-consumer` Electron scenario reached and passed the changed workflow:

- Video showed only Add to Cut and Preview as visible toolbar actions.
- More showed separate File and Node groups, with Duplicate node labeled distinctly.
- Add to Cut created one unnamed Cut draft and one media clip.
- OTIO showed Open Cut without Add to Cut and opened the exact `story.otio` document.
- Existing inline playback checks continued through the same Canvas media-node path.

Screenshots are under
`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T13-42-33.716Z-canvas-openneko-consumer-development/screenshots/`.

Overall UI validation is **blocked**, not passed. After the changed assertions succeeded, the existing
scenario failed on pre-existing Canvas Host disposed exceptions and a later resize lifecycle assertion
(`widthBefore: 310`, `widthAfter: 310`). The disposed exceptions also occur in the earlier
`2026-08-07T16-38-30.830Z` report. Fixing those adjacent lifecycle defects is outside this change.

## Residual Risk

- Add-to-Cut idempotency is intentionally scoped to one Canvas node and exact Cut session. Replacing the
  source behind the same node identity does not append a second clip.
- A failed probe after draft creation leaves the new empty draft visible so the partial, user-visible
  lifecycle result is explicit and local.
