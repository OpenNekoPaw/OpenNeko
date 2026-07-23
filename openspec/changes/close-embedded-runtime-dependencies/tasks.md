## 1. Regression Contracts

- [x] 1.1 Add a release orchestration test that rejects Engine's internal bare runtime import
- [x] 1.2 Add document loader tests proving all supported parsers use literal canonical loaders and unknown names fail visibly
- [x] 1.3 Add Sharp staging tests for exact target packages, missing packages, cleanup, and closure manifest output
- [x] 1.4 Add assembler tests for target mismatch, missing modules, repository-external resolution, and prohibited runtime imports
- [x] 1.5 Add macOS Mach-O closure tests for recursion, load-path rewriting, missing sources, basename collisions, and system dependencies

## 2. Canonical Runtime Owners

- [x] 2.1 Configure Engine's native boundary from the scoped loader path, remove its bare package external, and prevent VSCE prepublish from rebuilding patched native output
- [x] 2.2 Move document parser loading and dependency ownership to `@neko/content` and route Agent through it
- [x] 2.3 Stage Agent's target-specific Sharp binding/libvips pair and emit its runtime closure manifest
- [x] 2.4 Remove unused Sharp dependencies and external flags from Cut and Tools
- [x] 2.5 Recursively stage, rewrite, and sign the complete macOS Engine Mach-O runtime closure

## 3. Final Assembly

- [x] 3.1 Implement generic embedded bundle and runtime manifest validation
- [x] 3.2 Run validation against every staged feature before final VSIX creation
- [x] 3.3 Inspect a built macOS VSIX for exact feature-owned runtime closure and no unresolved internal package imports

## 4. Validation

- [x] 4.1 Run focused Engine, Content, Agent, assembler, and orchestration tests
- [ ] 4.2 Run OpenSpec, build, unused/debt, and applicable repository quality gates
- [ ] 4.3 Install the final macOS VSIX in an isolated Extension Development Host and verify activation, Engine readiness, Sharp, and document parser paths
- [ ] 4.4 Record Linux Merge Gate runtime closure and activation evidence required before Release

Validation blockers:

- 4.2: `pnpm build`, `pnpm check:quality`, `pnpm check:unused`, `pnpm check:deps`, `pnpm check:legacy-debt`, and strict OpenSpec validation pass. Repository-wide `pnpm test` remains red in two concurrently modified Agent content-access tests; repository-wide format/lint also contain unrelated dirty-worktree failures.
- 4.3: Not run because the user explicitly prohibited launching or invoking VS Code/`code`.
- 4.4: Requires the canonical Linux Merge Gate artifact and runner evidence before Release.
