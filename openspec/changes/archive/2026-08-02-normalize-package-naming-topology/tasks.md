## 1. Canonical topology contract

- [x] 1.1 Update the package-role inventory with every canonical `packages/<family>/<role>` or `packages/<name>` root and single-scope `@neko/*` identity.
- [x] 1.2 Extend package-role and architecture fixture tests to discover nested family roots and reject old scopes, redundant `packages/neko-*` roots, missing declarations, and path/name mismatches.

## 2. Package root migration

- [x] 2.1 Move Agent, AI, Assets, Canvas, Cut, Entity, Preview, and Search packages into domain-grouped roots without leaving old directories.
- [x] 2.2 Move singleton packages to concise roots, preserving each owner, role, runtime closure, exports, tests, and package-private resources.
- [x] 2.3 Rename all split-family manifests to the single `@neko/<family>-<role>` namespace and update internal workspace dependency declarations without compatibility aliases.

## 3. Consumer and orchestration migration

- [x] 3.1 Update application and package imports, test mocks, dynamic imports, config references, bundled-resource paths, and canonical realpath handling to use only new identities and roots.
- [x] 3.2 Update pnpm workspace discovery, root commands, package-manager lockfile, TypeScript/Vite/Vitest, ESLint/Prettier/Knip, dependency-cruiser, and package-local build/test configuration for nested package roots.
- [x] 3.3 Update Agent evaluation, functional scenarios, fixtures, and test ownership so nested packages retain full harness and coverage discovery.

## 4. Governance and documentation

- [x] 4.1 Update quality ledgers and boundary scripts to use canonical paths and add fail-visible legacy name/path scans.
- [x] 4.2 Update AGENTS, architecture/domain/development documentation, active OpenSpec implementation references, and package-private documentation to the canonical topology without rewriting historical facts inaccurately.
- [x] 4.3 Prove with repository-wide scans that no executable old package scope, obsolete `packages/neko-*` path, alias package, compatibility export, or fallback mapping remains.

## 5. Verification

- [x] 5.1 Run focused package-role, package-boundary, workspace dependency, strict TypeScript, Knip, lint, Prettier, build, and producer/consumer tests; record commands and canonical-path evidence.
- [x] 5.2 Run `pnpm test:agent:eval`, headless functional tests, and real Electron Cut/Canvas/Preview scenarios to verify consumer composition and runtime behavior.
- [x] 5.3 Run `pnpm ci:local`, `openspec validate normalize-package-naming-topology --strict`, and `git diff --check`; document any unexecuted external-provider evaluation and residual risk.
