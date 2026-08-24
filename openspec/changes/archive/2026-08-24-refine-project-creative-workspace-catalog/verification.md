# Verification

## Risk and ownership

- Risk: L4 because the change reshapes a core creative-workflow surface and extends Project public
  read contracts across Webview and Desktop composition.
- Owning responsibility: `@neko/project` owns strict composition/content projections;
  `@neko/project-webview` owns disposable catalog presentation state; Chara, World, Entity, and
  Content remain fact owners; Desktop owns only Workspace authorization and the concrete Content
  metadata adapter.
- Package role: Project contracts/application are host-neutral L0/application code; Project Webview
  is L2 browser UI; the Desktop change is Electron composition wiring.
- Canonical path: authorized Project binding -> `getCreativeWorkspace` + `getContent` -> strict
  projection join for presentation -> existing owner-qualified command/navigation callbacks.
- Producer/consumer: Project application services produce metadata; the typed project-authoring
  bridge and `ProjectWorkspaceRoot` consume it. No parallel DTO, storage record, or feature-flag path
  was introduced.
- User data: unchanged. The feature reads existing membership, Character, World, Entity, candidate,
  and Content facts and writes only through the existing explicit reference/synchronization commands.

## Component and foundation reuse audit

- Searched `@neko/ui`, Project Webview, Character Webview, and World Webview for card, search,
  filter, select, and empty-state primitives.
- Reused `@neko/ui` icons and `EmptyState`. Kept the card adapter package-local because it joins
  Project-specific owner commands and exact reference semantics; no equivalent shared card exists.
- Reused the existing typed Project bridge, composition/content services, Content read service,
  theme variables, and domain codecs. No package-local file IO, path resolver, cache, i18n runtime,
  or design system was added.

## Passed validation

- `pnpm exec openspec validate refine-project-creative-workspace-catalog --strict`
- `pnpm --filter @neko/project test` (11 files, 27 tests)
- `pnpm --filter @neko/project typecheck`
- `pnpm --filter @neko/project-webview test` (2 files, 14 tests)
- `pnpm --filter @neko/project-webview typecheck`
- `pnpm --filter @neko/app-desktop typecheck`
- `pnpm --filter @neko/app-desktop exec vitest run src/preload/workspace-grant-bridge.test.ts`
- `pnpm --filter @neko/app-desktop exec vitest run src/main/desktop-resource-browser-runtime.test.ts`
- `pnpm check:application-boundaries`
- `pnpm check:content-access-boundaries`
- `pnpm check:webview-boundaries`
- Targeted ESLint, Prettier, `git diff --check`, Desktop scenario syntax, and synthetic fixture
  Character/World/Entity/global-catalog/membership repository validation.
- The Project Webview interaction test expands and collapses an exact global Character reference,
  verifies its exact version/identity/read-only guidance, and expands a confirmed Entity to verify
  its category, identity, and Entity-owned edit guidance.

## Advisory UI validation

Status: blocked before the authoritative Desktop runtime started.

Command: `node scripts/run-desktop-ui-functional.mjs --scenario project-content`

The repository correctly rejected a second development runtime because an existing process owned
the checkout's Vite bundle. The report is at
`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-23T14-48-01.070Z-project-content-development/report.json`.
No screenshot was produced, so initial, searched, filtered, no-results, add-panel, fail-visible,
dense, and compact-width visual states remain blocked rather than passed. The scenario now covers
all of those states once the existing Desktop process is stopped.

A supplemental Computer Use inspection connected to that exact running checkout and confirmed the
Project Browser, Resources/Creation tabs, and current Workspace resource state. The window was then
changed repeatedly by external interaction or hot reload while the Creation tab action was being
performed, so no stable expanded-detail screenshot was captured and this observation does not
replace the isolated scenario.

## Other worktree blockers

- Full focused Desktop renderer tests have 12 pre-existing failures in unrelated dirty changes:
  unavailable `unknown.presentation` Character providers and an extension-root height expectation.
- `pnpm smoke:webview` built Assets successfully, then failed because the unrelated Canvas package
  produced no `dist` directory.
- The repository-wide internal-versioning audit remains red from unrelated dirty-worktree
  occurrences and stale allowances; a focused scan reports no finding in this change's files.

## Residual risk

- Visual spacing, focus presentation, expanded-detail layout, and compact-width readability still
  require direct image review after the current Desktop development owner exits.
- Candidate-card rendering and metadata are covered by strict contract, projection, and Webview
  tests, but the current Desktop fixture does not synthesize a semantic-index candidate; its direct
  Desktop visual state therefore remains unverified.
