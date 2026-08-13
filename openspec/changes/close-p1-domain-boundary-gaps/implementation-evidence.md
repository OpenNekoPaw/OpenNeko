## Review classification

- Risk: L3. The change crosses Canvas Webview/preload/Main media messages and moves a Cut creative-workflow transaction into its canonical application owner.
- Review result: no blocking finding remains in the changed Search, Canvas, Cut, or Desktop adapter scope.
- UI validation: not applicable. No layout, interaction, copy, or presentation behavior changed; focused Desktop tests cover the existing user path projection.
- Agent evaluation: not applicable. No Agent prompt, capability, provider, session, or evaluation behavior changed.

## Canonical path evidence

| Boundary                     | Canonical owner                        | Producer                                             | Consumer                                                  | Replaced successful path                                                                            | Evidence                                                                                                                                                 |
| ---------------------------- | -------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search coordination          | `@neko/search-domain/core`             | Search composition and registered adapters/providers | Search callers                                            | partial/default runtime ports, duplicate replacement, and rejected lifecycle work reported as fresh | constructors require complete ports; duplicate registration throws before mutation; failure tests assert exact partition diagnostics and non-fresh state |
| Canvas media protocol        | `@neko/canvas-domain`                  | Canvas Webview                                       | Desktop renderer/preload/Main media adapter               | Desktop-local media types/codecs and Webview default delegation of arbitrary strings                | all runtime imports use the Canvas public entry; repository scan finds old names only in poison assertions; the host switch rejects unknown messages     |
| Cut draft and Canvas handoff | `@neko/cut-domain` application service | Desktop-authorized owner snapshot                    | Cut Node session port and Desktop shell presentation port | Desktop-owned label/identity/rollback/handoff helpers                                               | Cut unit tests cover planning, rollback, exact target selection and rejection; Desktop source test proves delegation and old helper removal              |

Desktop retains only exact sender/window/workspace authorization, authorized absolute-path resolution, concrete runtime calls, shell projection, and resource disposal. No persisted user-data shape, compatibility path, feature flag, or alternative owner was introduced.

## Verification

Passed:

- `openspec validate close-p1-domain-boundary-gaps --type change --strict --no-interactive`
- `pnpm check:openspec` (92 changes/specs)
- Search typecheck and tests (18 files, 89 tests)
- Canvas domain typecheck and tests (35 files, 287 tests)
- Canvas Webview build/typecheck and tests (64 files, 405 tests)
- Cut domain typecheck and tests (6 files, 60 tests)
- Cut Node typecheck and tests (5 files, 18 tests)
- Desktop typecheck and focused Canvas/Cut boundary tests (5 files, 100 tests)
- `pnpm check:canvas-playback-boundary`
- `pnpm check:package-roles`
- `pnpm check:application-boundaries`
- `pnpm check:package-boundaries`
- `pnpm check:webview-boundaries`
- `pnpm check:deps` (1,630 modules, 5,539 dependencies, no violations)
- `pnpm check:legacy-debt` (0 blocking entries)
- ESLint for the changed Search/Canvas/Cut implementation and Desktop adapter files
- `git diff --check`

## Existing worktree failures and residual risk

- The full Desktop test command completed 103 of 104 files; three assertions in `desktop-agent-resource-display-projector.test.ts` fail because the existing dirty implementation returns `previewDescriptor` while those assertions expect `renderUri`. The affected Agent resource projector is outside this change; all focused Canvas/Cut Desktop tests pass.
- `pnpm check:no-internal-versioning` unit tests pass, but its repository audit is blocked by 250 existing dirty-worktree occurrences and stale allowances, primarily in Character/Agent work outside this change.
- `pnpm check:unused` reports existing unused dependencies `@neko/generation` in Agent Webview and `@earendil-works/pi-ai` in Desktop. Neither dependency was added or changed here.
- Whole-file ESLint of dirty `apps/neko-desktop/src/main/index.ts` reports two unrelated `prefer-const` errors; linting the changed adapters and owning package files passes.
