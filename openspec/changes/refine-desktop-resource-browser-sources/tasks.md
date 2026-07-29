## 1. Contract and owner boundaries

- [x] 1.1 Replace Resource Browser v3 flat facet contract with v4 Directory/Media/Entity/All, tree/grid, container and section projection types.
- [x] 1.2 Add producer/consumer validation tests for hierarchical items, search sections, stale identity and library management requests.
- [x] 1.3 Extract the Desktop recursive scan into a host-neutral Assets Directory/Media projection source and poison the Desktop-local duplicate source.

## 2. Directory and Media Library sources

- [x] 2.1 Implement lazy workspace root/directory children and bounded Directory search with portable locator, exclusions and parent identity.
- [x] 2.2 Implement Media Library root enumeration and lazy children/search exclusively from `neko/assets/<libraryName>` links.
- [x] 2.3 Implement explicit add, relink and remove library effects with revision checks, cancellation and safe availability diagnostics.
- [x] 2.4 Add source tests proving ordinary workspace media stays in Directory and linked media stays in Media Library.

## 3. Entity and search composition

- [x] 3.1 Introduce one shared confirmed Entity/binding query service consumed by Resource Browser and Desktop Agent mention.
- [x] 3.2 Project Entity identity, status, bounded metadata and binding availability; keep candidates explicitly separate or unavailable.
- [x] 3.3 Implement scoped Directory/Media/Entity search and sectioned All results with stale request protection and deterministic limits.
- [x] 3.4 Add tests proving Resource Browser and Agent mention return the same confirmed Entity identity/binding and reject candidate drift.

## 4. Resource Browser UX

- [x] 4.1 Update the package-owned Resource Browser Root with Directory/Media/Entity facets, tree/grid controls, breadcrumbs and grouped All search.
- [x] 4.2 Add Media Library root management controls and fail-visible empty/offline states without exposing target paths.
- [x] 4.3 Preserve selection, expanded containers, active facet, view mode and query per Project while keeping Resource Dock independent from Main/Chat.
- [x] 4.4 Update shared icons, accessibility, light-theme styles and English/Chinese labels; keep controls icon-first with tooltips.

## 5. Desktop integration and qualification

- [x] 5.1 Migrate Desktop Main/preload/renderer fixed bridge to Resource Browser v4 and prove v3/Desktop-local fallback cannot succeed.
- [x] 5.2 Add integration tests for preview, reveal, Canvas/Cut drag/add and Project/window identity across all resource facets.
- [x] 5.3 Run Assets/Desktop/Agent focused and full tests, typechecks, architecture/legacy gates, production Electron package and `git diff --check`.
- [x] 5.4 Run an isolated real Electron scenario covering Directory tree/grid, linked-library management/search, Entity parity and Resource Dock resize/recovery; record remaining external blockers.

  Acceptance evidence (2026-07-29): the packaged Electron app loaded only the
  workspace root and linked-library roots initially, expanded direct children on
  demand, searched a nested linked-library file, switched list/grid presentation,
  projected the same three confirmed Entities used by Agent mention, and restored
  the Resource Dock with its project-scoped query and filtered result intact. The
  Dock exposed the canonical resize separator and the resize owner/update path is
  covered by focused tests. The macOS black-box driver could not reliably synthesize
  pointer capture on the one-pixel separator, so manual pointer-drag remains the only
  external acceptance limitation; no product fallback was added.

## 6. Directory tree regression

- [x] 6.1 Add a red-capable Resource Browser Root regression test proving list presentation keeps an expanded parent visible and renders direct children as an accessible hierarchy.
- [x] 6.2 Separate list/tree disclosure from grid current-container navigation without changing Assets source, ContentLocator identity or project-scoped expansion state.
- [x] 6.3 Verify nested expansion/collapse, file activation, grid breadcrumbs and deterministic children merging through focused Assets tests.
- [x] 6.4 Run Assets/Desktop tests and typecheck, strict OpenSpec validation, production Electron packaging and a real Desktop Directory tree scenario.

  Regression acceptance evidence (2026-07-29): the packaged Electron app
  defaulted the Resource Dock to Directory list presentation. Expanding `.agents`
  kept the parent row in place and inserted `skills` immediately below it;
  collapsing removed the descendant without navigating away. Switching to grid
  presentation and activating `.agents` navigated to the current container and
  rendered `Workspace / .agents` breadcrumbs. Assets passed 20 files / 114 tests,
  Desktop passed 39 files / 183 tests, both focused typechecks passed, the
  production Electron package completed, strict OpenSpec validation passed and
  `git diff --check` passed.

## 7. Compact Directory tree presentation

- [x] 7.1 Add a red-capable package-owned Resource Browser test for compact single-line tree rows, aligned disclosure placeholders, complete labels and suppressed root `"."` metadata.
- [x] 7.2 Implement file-type icons, small media thumbnails, filename ellipsis and subtle whole-row selection in the shared Assets Resource Browser without changing source or ContentLocator behavior.
- [x] 7.3 Run focused/full Assets and Desktop tests and typechecks, production Electron packaging, strict OpenSpec validation, `git diff --check`, and a real `/Users/feng/Git/neko-test` Desktop Directory scenario.

  Acceptance evidence (2026-07-29): the package-owned compact-tree regression
  failed against the former two-line rows and passed after the presentation
  change. Assets passed 20 files / 115 tests and its focused typecheck; Desktop
  passed 40 files / 191 tests and typecheck; focused Assets ESLint, production
  Electron packaging, strict OpenSpec validation and `git diff --check` passed.
  In an isolated packaged Desktop using `/Users/feng/Git/neko-test`, Directory
  rendered compact single-line rows without root `"."` metadata, expanded
  `.agents / skills` with aligned hierarchy, applied a subtle whole-row
  selection, and rendered the `cases` descendants with small video/image
  thumbnails plus audio/document type icons. The fixture-only workbench state
  was set to show the already-composed Resource Dock because a fresh Desktop
  profile defaults that Dock to hidden; no product or user state was modified.
