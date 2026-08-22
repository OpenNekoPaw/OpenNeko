## Why

OpenNeko's Desktop functional scenarios can capture screenshots and assert selected geometry, but no canonical workflow asks an image-capable Agent to inspect every required visual state as advisory evidence. Coverage is also uneven: Settings and Sidebar lack focused visual states, while the package-owned Cut and Preview scenarios currently produce no screenshot evidence.

## What Changes

- Extend the repository `neko-ui-validation` Skill so required screenshots are actually inspected by an image-capable Agent against the acceptance inventory; screenshot existence alone no longer counts as visual acceptance.
- Require per-state visual findings that identify the reviewed artifact, observable defects, uncertainty, and a fail-visible result without turning visual judgment into product runtime behavior.
- Add focused Desktop visual states for the application Sidebar and Settings surface in the app-owned Workbench scene.
- Add package-owned screenshots for Cut playback/seek/authoring states and for the Preview image, audio, video, PDF, GLB, and glTF viewer matrix.
- Add an explicit local-only contract test for the Agent-review method, Skill content boundary, and required screenshot coverage, plus a generic-gate check that proves the local UI entries remain unreachable.
- Keep UI results advisory: failures and blockers remain visible in the UI report but do not block code completion, commit, merge, or release.
- Record the relationship to existing skills: `neko-ui-validation` remains the single validation workflow owner; desktop/browser-control capabilities are optional execution aids rather than validation-policy owners.

## Capabilities

### New Capabilities

- `agent-visual-review-workflow`: Defines how an image-capable development Agent inspects visual evidence, records observable findings and uncertainty, and contributes a fail-visible UI acceptance result.
- `desktop-ui-visual-coverage`: Defines the minimum focused visual evidence supplied by package-owned Desktop scenarios for the main application surfaces and Workspace creative surfaces.

### Modified Capabilities

None.

## Impact

- Updates `.codex/skills/neko-ui-validation/` and its deterministic repository contract tests; this remains a repository-development Skill and does not enter product Skill Host discovery or Neko Agent prompts.
- Updates `scripts/desktop-functional/desktop-workbench-scenes.mjs` only for app-owned Sidebar and Settings visual evidence. The shared runner remains a neutral Electron launch, interaction, observation, screenshot, report, and cleanup boundary.
- Updates `packages/cut/webview/functional/desktop-openneko-consumer.mjs` and `packages/preview/webview/functional/desktop-openneko-consumer.mjs`; each owning Webview package retains its own scenario states and assertions.
- Does not add image comparison dependencies, a second visual-test runner, GUI work or UI contract tests to CI/generic gates, production runtime contracts, user-data changes, or test-only product success paths.
