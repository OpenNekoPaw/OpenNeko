## 1. Contracts and owners

- [x] 1.1 Upgrade the Desktop Home management contract to version 3 with global asset query sorting, project-free global Skill/plugin results, and version-2 rejection tests.
- [x] 1.2 Add the canonical user-global asset root to the shared storage layout with focused contract coverage.
- [x] 1.3 Add an AppHost-owned global personal/builtin Skill catalog path and prove it never attaches or discovers a Project source.

## 2. Main and preload composition

- [x] 2.1 Implement the bounded global asset catalog by reusing Assets content-tree traversal and media classification, with stable search/sort and fail-visible diagnostics.
- [x] 2.2 Migrate Main Home handlers and preload bridge to project-free asset and plugin requests; poison the old project-scoped request path.
- [x] 2.3 Add producer/consumer tests proving assets never scan a Project and global plugins exclude Project Skills while retaining safe diagnostics.

## 3. Home management surfaces

- [x] 3.1 Replace Asset Center project/facet UI with global Libraries/Assets search and sort controls.
- [x] 3.2 Replace Plugins project selector and built-in-capability wording with global Skills/Plugins search and sort controls.
- [x] 3.3 Replace All Creations with All Projects, remove conversations, and add project search, sort, and list/grid views over the Shell catalog.
- [x] 3.4 Update Simplified Chinese/English copy, accessibility labels, responsive styles, and red-capable Renderer regressions.

## 4. Validation and review

- [x] 4.1 Run focused shared/Desktop tests, Desktop typecheck/build, strict OpenSpec validation, diff checks, legacy-debt and unused checks as applicable.
- [x] 4.2 Validate Asset Center, Plugins and All Projects in the real packaged/development Electron host and record remaining UX or runtime risk.
- [x] 4.3 Perform the Neko quality review across responsibility, dependency, interface, extension and testing layers.
