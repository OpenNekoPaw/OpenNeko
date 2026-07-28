## 1. Baseline and migration inventory

- [ ] 1.1 Record every current workspace package, consumer, runtime layer, package export, build/test command, and intended target disposition (top-level package, owning-package subpath, VS Code internal module, or removal).
- [ ] 1.2 Record all internal extension manifests, activation entries, contribution IDs, localization keys, commands, views, custom editors, Webview entries, resources, and cross-feature API lookups with one target owner each.
- [ ] 1.3 Record all scoped memento keys, secret keys, storage/global-storage paths, caches, settings, runtime closure manifests, and native payload roots with explicit reuse or migration disposition.
- [ ] 1.4 Update the overlapping `finalize-platform-packaging-and-removal` and `close-embedded-runtime-dependencies` artifacts so temporary feature VSIX, scoped-context, and embedded-registry work cannot remain an accepted parallel path.
- [ ] 1.5 Add failing architecture fixtures/checks for nested workspaces, internal extension manifests/entries, simulated scoped contexts, embedded feature registry usage, sibling feature-adapter imports, and temporary feature VSIX assembly.

## 2. Host Kernel contracts

- [ ] 2.1 Define feature identity, criticality, dependency, activation context, activation result, capability, diagnostic, cancellation, and disposable ownership contracts in `apps/neko-vscode`.
- [ ] 2.2 Implement and test static dependency-plan validation for duplicate IDs, missing dependencies, cycles, and deterministic activation/reverse-disposal order.
- [ ] 2.3 Implement and test per-feature transactional activation with immediate partial-resource ownership and rollback on failure.
- [ ] 2.4 Implement and test optional-feature failure containment, transitive-dependent unavailability, independent-feature continuity, and causal diagnostics.
- [ ] 2.5 Implement and test kernel-critical failure rollback and activation rejection without a successful or silent fallback state.
- [ ] 2.6 Implement contribution availability projection so disabled feature entrypoints are hidden where possible or return an explicit unavailable diagnostic.

## 3. Narrow Host ports and resource/state services

- [ ] 3.1 Audit the current AI/Host services bag and map every member to kernel infrastructure, a consumer-owned feature port, a domain-owned capability, or deletion.
- [ ] 3.2 Define the minimum shared feature resource, logger, diagnostic, cancellation, state, storage, secret, and disposable services without exposing the full Host Kernel.
- [ ] 3.3 Define or refine consumer-owned ports for Agent, Canvas, Cut, Preview, Assets, and Tools and add contract tests for their error/lifecycle semantics.
- [ ] 3.4 Implement app-owned VS Code adapters for the narrow ports and prevent reusable packages from importing `vscode` or `apps/neko-vscode`.
- [ ] 3.5 Strengthen `@neko/host` boundary tests so it remains free of VS Code, Electron, Node implementation, React, and product-domain dependencies.
- [ ] 3.6 Add architecture checks proving feature adapters receive typed direct dependencies and cannot query a global application services/capability locator.

## 4. Flatten the workspace graph

- [ ] 4.1 Change workspace discovery to `apps/*` and `packages/*` only and add a check that rejects every nested workspace manifest.
- [ ] 4.2 Move reusable Agent nested packages to top-level packages or merge thin types/contracts/test utilities into the owning Agent package according to the inventory.
- [ ] 4.3 Move reusable Canvas and Cut domain/UI packages to top-level packages or owning-package subpaths according to the inventory.
- [ ] 4.4 Move reusable Preview and Tools contracts/UI packages to top-level packages or owning-package subpaths according to the inventory.
- [ ] 4.5 Update package imports, exports, tsconfig references, Turbo tasks, Vitest projects, package groups, lockfile, tests, and documentation for the flattened canonical paths.
- [ ] 4.6 Delete obsolete parent-container manifests and nested package directories after all consumers use the flattened paths; do not retain aliases, proxy packages, or dual exports.
- [ ] 4.7 Run package-boundary, circular-dependency, build-order, unused-export, and focused package tests for the flattened graph.

## 5. Move VS Code features into the application

- [ ] 5.1 Create app-internal Tools, Preview, Assets, Cut, Canvas, and Agent feature modules with owned activation, resources, disposables, and diagnostics.
- [ ] 5.2 Move each VS Code-only command, view, provider, editor, panel, bridge, and host adapter from extension packages to its owning app feature module.
- [ ] 5.3 Replace internal extension/registry discovery with explicit typed capability wiring at the application composition root.
- [ ] 5.4 Replace simulated child `ExtensionContext` usage with feature resource/state/storage/secret namespaces derived from the one real application context.
- [ ] 5.5 Consolidate activation into the single app entry, validate the feature plan before side effects, and dispose activated features in reverse dependency order.
- [ ] 5.6 Delete internal feature activation exports, extension IDs, extension manifests, dynamic loaders, embedded registry, scoped-context factory, and their obsolete tests.
- [ ] 5.7 Add focused tests that poison every legacy activation/discovery path and assert the Host Kernel path and target feature handler are actually used.

## 6. State and user-data migration

- [ ] 6.1 Implement versioned, idempotent mappings for every retained memento, secret, workspace-storage, global-storage, setting, cache, and credential metadata identity.
- [ ] 6.2 Implement atomic migration markers and retry behavior so the marker commits only after all owned state is valid at its destination.
- [ ] 6.3 Add synthetic-fixture tests for clean install, identity reuse, successful migration, destination conflict, malformed source, interrupted migration, retry, and secret-safe diagnostics.
- [ ] 6.4 Verify project files, settings, credentials, and source state are preserved on every migration failure; document any explicitly rebuildable cache and its cleanup condition.

## 7. Direct single-VSIX build and packaging

- [ ] 7.1 Make the app manifest or app-owned schema-validated fragments the sole source of all retained VS Code contributions and localization.
- [ ] 7.2 Replace temporary feature VSIX packaging/unpacking with direct Extension Host, Webview, localization, icon, media, schema, and runtime output staging.
- [ ] 7.3 Adapt Engine, FFmpeg, Sharp, document parser, and other external runtime closure manifests to resolve within the single application staging tree for the exact target.
- [ ] 7.4 Add deterministic package validation for contribution collisions, missing declared resources, unresolved or external runtime imports, duplicate native closures, and cross-target binaries.
- [ ] 7.5 Delete temporary VSIX scripts, extracted `dist/features/*` assumptions, feature package `.vscodeignore` ownership, and release paths that can emit internal feature VSIX files.
- [ ] 7.6 Add archive inspection tests proving one extension manifest/entry, one target-native closure, complete retained contributions, and no internal extension payloads.

## 8. End-to-end verification and documentation

- [ ] 8.1 Run focused Host Kernel, port, state migration, feature adapter, packaging, producer/consumer, and path-assertion tests.
- [ ] 8.2 Run `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:legacy-debt`, and `pnpm check:unused`, resolving every nested-workspace or legacy-path finding.
- [ ] 8.3 Build and inspect each supported platform VSIX and verify exact artifact names, runtime closure, checksums, and absence of internal VSIX files.
- [ ] 8.4 Install the final VSIX in an isolated synthetic Extension Development Host and validate activation, retained commands/views/editors, Webview messaging/CSP/resources, Engine readiness, optional-feature diagnostics, and disposal.
- [ ] 8.5 Run applicable Agent evaluations for changed Agent capability/host routing and record real-case evidence or explicit external blockers.
- [ ] 8.6 Update architecture overview, package boundaries, application composition, contributor/build/release documentation, and package-specific docs to describe the single-layer workspace and single-extension Host Kernel.
- [ ] 8.7 Perform the Neko quality review, record commands/results and residual process-fatal risk, and confirm the old embedded-extension path cannot return success.
