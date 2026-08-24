# Verification

Date: 2026-08-24

## Quality review

- Risk: L2 because the change removes one public Host Scene catalog member and updates Desktop navigation plus Project presentation.
- Ownership: Host remains the sole Window Scene contract and transition owner. `@neko/project-webview` owns the Project catalog presentation. Desktop Renderer only wires exact scene intents and the existing Project/Workspace ports.
- Canonical path: `works` remains one exact Host-owned Creative Management Scene; the removed `templates` catalog is rejected by the codec. Project quick starts invoke the existing `open-agent-entry` transition and do not create a Project, Conversation, Agent turn or prompt injection path.
- Presentation: Project records use one responsive grid. No list state, view buttons, `data-view-mode`, batch toolbar or hidden alternate Templates page remains. Storyboard and Video Plan are the only Project quick starts; Character Kit is intentionally absent.
- Findings: no blocking or suggested findings in the scoped change.

## Static and focused evidence

- `pnpm --filter @neko/host test -- desktop-scene-contract.test.ts desktop-shell-service.test.ts`: passed, 38 files and 330 tests.
- `pnpm --filter @neko/project-webview test -- root.test.tsx`: passed, 2 files and 15 tests.
- Focused Desktop Application Works/Project-template tests: passed, 3 tests.
- Desktop Shell, renderer style and i18n tests: passed, 3 files and 79 tests.
- `pnpm --filter @neko/app-desktop typecheck`: passed.
- `pnpm --filter @neko/project-webview typecheck`: passed.
- `pnpm exec tsc --noEmit -p packages/host/tsconfig.json`: passed.
- Scoped ESLint and Prettier: passed.
- `pnpm check:openspec`: passed, 162 items.
- `git diff --check` and both functional-script syntax checks: passed.

The combined Desktop Renderer run passed 130 tests and failed 5 unrelated Agent fixture cases because concurrent Agent changes did not provide `subscribeWorkspaceIndex`; the three tests introduced or changed for this work passed in the isolated focused run. `pnpm check:legacy-debt` is blocked by 26 unrelated DSH image-preview `shim` findings in six files. `pnpm check:unused` reports existing repository-wide unused files, dependencies and exports outside this change.

## Advisory UI validation

The acceptance inventory is:

- stable navigation contains Start Creating, Projects, Works, Asset Library and Extensions without Templates;
- Development retains the Character/World experimental group and Release hides it;
- Project management has one centered responsive grid with no list switch;
- Project management contains exactly Storyboard and Video Plan quick starts and excludes Character Kit;
- selecting a Project quick start delegates to the existing Start Creating Scene;
- Works remains an honest empty catalog and adjacent Scene navigation unloads the previous management Root.

The authoritative isolated Electron development scenario was attempted, but PID `30133` owns this checkout's Vite bundle. The generated fail-visible report is:

- `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-23T19-47-11.207Z-development-creative-capability-visibility-development/report.json`

The user-owned process was not stopped. A supplemental inspection of the running OpenNeko window was also attempted through Computer Use, but the Mac was locked and automatic unlock was unavailable. Therefore no current screenshot is claimed as visual evidence.

## Result and residual risk

- Code quality review: passed for the scoped L2 change.
- Static and focused functional verification: passed.
- Advisory UI validation: blocked because the authoritative isolated runtime could not start and the existing Window could not be inspected while macOS was locked.
- Residual product scope: Project template selection currently returns to Start Creating only. Preserving a selected template, creating a Project from it or injecting an Agent instruction would require a separate owner and contract. Works remains empty until a global publication catalog is defined.

## Works Empty Catalog Hierarchy Follow-up

Date: 2026-08-24

- The exact Host-owned `works` Scene remains the only authority. The Renderer adds only a domain Hero, decorative presentation and a bounded `My works` empty section.
- No create/import action, search field, view mode, fake Work record or alternate catalog source was added. Publishing and opening Works remain deferred until an owning domain contract exists.
- The empty state now appears near the beginning of the content track instead of floating in the viewport center, so it remains connected to the `My works` heading and count.

Automated evidence:

- Focused Works Renderer behavior: 1 test passed.
- Focused Works and Global Library style contracts: 2 tests passed.
- Desktop i18n suite: 2 tests passed.
- Desktop typecheck passed. Scoped ESLint completed with 0 errors; strict OpenSpec validation passed 167/167 items; application boundaries and `git diff --check` passed.
- The concurrent two-file Desktop run had one unrelated five-second context-menu timeout; that exact case passed in an isolated single-worker rerun.

Authoritative UI evidence:

- Inspected the running visible Development Electron application through the ordinary sidebar navigation.
- The wide layout showed the Works Hero copy and lightweight decorative tiles, then `My works`, count `0` and the bounded empty state in one clear vertical hierarchy.
- Direct image-capable review found no unexpected controls, clipping, overlap, false publication affordance or viewport-centered orphan state.

Result: passed for the requested presentation-only scope. The responsive CSS contract collapses the Hero to one column and removes decoration below 760px; a direct narrow-window and dark-theme pixel pass remains advisory residual risk.

Quality review found no blocking issue: presentation does not claim durable facts and does not pre-empt the future Works publication owner.

## Works Illustration Alignment Follow-up

Date: 2026-08-24

- The Works Hero now uses the same bounded visual field, rotated base card, dashed connector, overlapping rear card and 54px icon-tile rhythm as Project, Character and World management.
- Works keeps its own file, grid and open-result icon semantics. This is presentation-only and does not add a Work record, publication action or second domain owner.
- The illustration scales at the established intermediate breakpoint and is removed on narrow layouts so the copy remains the primary content.

Automated evidence:

- Focused Desktop Works and management style contracts: 1 file / 35 tests passed.
- Desktop typecheck passed.

Authoritative UI evidence:

- Ordinary sidebar navigation in the running visible Development Electron application was used to inspect Works and Project consecutively at the same wide viewport.
- Direct image review confirmed aligned field width and height, matching card rotation/overlap, connector placement and icon-tile scale without clipping or overlap with Hero copy.

Result: passed for the requested wide Works illustration alignment. Direct narrow-window and dark-theme pixel inspection remains advisory residual risk; responsive removal and semantic color usage are covered by the focused style contract.
