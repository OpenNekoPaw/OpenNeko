## 1. Repository Contracts And Branch Integration

- [x] 1.1 Add repository topology tests that require one Desktop app, first-level packages and no
      executable VS Code/TUI/VSIX path.
- [x] 1.2 Commit the Desktop-only OpenSpec artifacts and merge `refactor-monorepo` with an explicit
      superseding `ours` merge.
- [x] 1.3 Record the retained package move inventory and verify every Desktop dependency has one
      target owner before deleting any host package.

## 2. First-Level Package Topology

- [x] 2.1 Move Agent runtime, types, AI SDK, platform, Webview and test-utils packages to their
      first-level target directories without changing npm package identities.
- [x] 2.2 Move Canvas domain/Webview, Cut domain/Node/Webview, Preview contracts/Webview and Tools
      contracts/Webview packages to first-level target directories.
- [x] 2.3 Update workspace globs, path-based root scripts, TypeScript/build/test configuration and
      Desktop dependencies for the moved packages.
- [x] 2.4 Run package-resolution, moved-package typecheck/build and focused producer/consumer tests;
      prove no nested workspace package remains.

## 3. Removed Host Paths

- [x] 3.1 Delete `apps/neko-vscode`, `apps/neko-tui` and aggregate Extension package roots after
      confirming retained code has moved.
- [x] 3.2 Delete package-local Extension implementations, `host-vscode` adapters and shared VS Code
      L1 helpers; remove their exports, tests and dependencies.
- [x] 3.3 Remove `acquireVsCodeApi`, Extension message bootstrap and VS Code-only Webview fallback
      paths while preserving injected package-owned Desktop runtimes.
- [x] 3.4 Add or update Desktop producer/consumer tests proving removed hosts cannot participate in
      successful Agent, Assets, Canvas, Cut, Preview or Tools paths.

## 4. Desktop-Only Toolchain And Release

- [x] 4.1 Remove VSIX/TUI root commands, package groups, staging scripts, smoke tests, dependency
      checks and unused-code configuration; make all active commands Desktop-only.
- [x] 4.2 Remove VS Code/TUI dependencies and regenerate the pnpm lockfile from the first-level
      workspace topology.
- [x] 4.3 Replace or remove CI/release workflows and validators that package Extension/TUI artifacts;
      add Desktop artifact allowlists and fail-visible removed-host guards.
- [x] 4.4 Update active architecture, package boundaries, contribution guidance and root README
      documents to identify Desktop as the sole host and first-level packages as canonical.

## 5. Validation And Quality Review

- [x] 5.1 Run strict OpenSpec validation, diff checks, topology/legacy/unused/dependency gates and
      all affected first-level package tests/typechecks/builds.
- [x] 5.2 Run complete Desktop tests, typecheck, lint, production build/package inspection and a
      focused real Electron project-open/creative-surface scenario.
- [x] 5.3 Apply the Agent evaluation disposition: run the key-free harness, reuse a real Desktop
      driver if one exists, or record the missing complete-session owner as a blocking residual risk.
- [x] 5.4 Run the L4 Neko quality review, confirm no project/Desktop settings were deleted, document
      removed VS Code/TUI state behavior and list every unexecuted platform validation.
