> **Implementation status (2026-07-29):** The canonical single-extension cutover,
> direct staging, app-internal feature moves, single-level workspace flattening,
> consumer-owned ports, application adapters, and reusable-package guards are
> implemented. Both supported platform VSIX artifacts have passed archive and
> runtime-closure inspection. The Darwin final VSIX has additionally passed
> installed Agent/Cut, target-native media, optional-Git, and disposal checks.
> The independent `decompose-neko-shared-ownership` successor is strictly valid.
> Task 8.4 remains unchecked only for the Linux-native installed run.

## 1. Baseline and migration inventory

- [x] 1.1 Record every current workspace package, consumer, runtime layer, package export, build/test command, and intended target disposition (top-level package, owning-package subpath, VS Code internal module, or removal).
- [x] 1.2 Record all internal extension manifests, activation entries, contribution IDs, localization keys, commands, views, custom editors, Webview entries, resources, and cross-feature API lookups with one target owner each.
- [x] 1.3 Record all scoped memento keys, secret keys, storage/global-storage paths, caches, settings, runtime closure manifests, and native payload roots with explicit reuse or migration disposition.
- [x] 1.4 Update the overlapping `finalize-platform-packaging-and-removal` and `close-embedded-runtime-dependencies` artifacts so temporary feature VSIX, scoped-context, and embedded-registry work cannot remain an accepted parallel path.
- [x] 1.5 Add failing architecture fixtures/checks for nested workspaces, internal extension manifests/entries, simulated scoped contexts, embedded feature registry usage, sibling feature-adapter imports, and temporary feature VSIX assembly.

## 2. Host Kernel contracts

- [x] 2.1 Define feature identity, typed composition definition, registration context/result, lazy capability, diagnostic, cancellation, and disposable ownership contracts in `apps/neko-vscode`.
- [x] 2.2 Derive registration metadata from the typed composition definition, or add bidirectional tests proving metadata dependency edges and actual typed injection edges are identical.
- [x] 2.3 Implement and test registration-plan validation for duplicate IDs, missing dependencies, cycles, and deterministic registration/reverse-disposal order.
- [x] 2.4 Implement and test per-feature transactional registration with immediate partial-resource ownership, rollback, and extension activation rejection on registration failure.
- [x] 2.5 Implement and test owner-scoped lazy capability initialization, transitive capability unavailability, independent-surface continuity, causal diagnostics, cancellation, and retry policy where the owning capability explicitly supports retry.
- [x] 2.6 Implement contribution availability projection so entrypoints requiring an unavailable capability return an explicit diagnostic while independent entrypoints remain operational.

## 3. Narrow Host ports and resource/state services

- [x] 3.1 Audit the current AI/Host services bag and map every member to kernel infrastructure, a consumer-owned feature port, a domain-owned capability, or deletion.
- [x] 3.2 Define per-feature minimum resource, logger, diagnostic, cancellation, state, storage, secret, and disposable projections without exposing the full Host Kernel or automatically granting secrets/workspace IO to every feature.
- [x] 3.3 Define or refine consumer-owned ports for Agent, Canvas, Cut, Preview, Assets, and Tools and add contract tests for their error/lifecycle semantics.
- [x] 3.4 Implement app-owned VS Code adapters for the narrow ports and prevent reusable packages from importing `vscode` or `apps/neko-vscode`.
- [x] 3.5 Strengthen `@neko/host` boundary tests so it remains free of VS Code, Electron, Node implementation, React, and product-domain dependencies.
- [x] 3.6 Add architecture checks proving feature adapters receive typed direct dependencies and cannot query a global application services/capability locator.

## 4. Move VS Code features into the application

- [x] 4.1 Keep reusable nested package identities and physical paths stable while creating app-internal Tools, Preview, Assets, Cut, Canvas, and Agent feature modules with owned registration, resources, disposables, and diagnostics.
- [x] 4.2 Move each VS Code-only command, view, provider, editor, panel, bridge, and host adapter from extension packages to its owning app feature module.
- [x] 4.3 Replace internal extension/registry discovery with explicit typed port and lazy capability wiring at the application composition root.
- [x] 4.4 Replace simulated child `ExtensionContext` usage with minimum feature resource/state/storage/secret projections derived from the one real application context.
- [x] 4.5 Add focused registration and capability tests that assert the Host Kernel path and target handler are used without querying a global application locator.

## 5. State and user-data migration

- [x] 5.1 Define durable `StateNamespaceId` values independently from the removed extension identities, preserving existing `neko.<feature>` key/path generation wherever possible.
- [x] 5.2 Implement versioned, idempotent mappings for every retained memento, secret, workspace-storage, global-storage, setting, cache, and credential metadata identity.
- [x] 5.3 Implement atomic migration markers and retry behavior so the marker commits only after all owned state is valid at its destination.
- [x] 5.4 Add synthetic-fixture tests for clean install, identity reuse, successful migration, destination conflict, malformed source, interrupted migration, retry, and secret-safe diagnostics.
- [x] 5.5 Verify project files, settings, credentials, and source state are preserved on every migration failure; document any explicitly rebuildable cache and its cleanup condition.

## 6. Direct single-VSIX cutover and packaging

- [x] 6.1 Make the app manifest or app-owned schema-validated fragments the sole source of all retained VS Code contributions and localization.
- [x] 6.2 Replace temporary feature VSIX packaging/unpacking with direct Extension Host, Webview, localization, icon, media, schema, and runtime output staging.
- [x] 6.3 Adapt FFmpeg, Sharp, document parser, and other external runtime closure manifests to resolve within the single application staging tree for the exact target.
- [x] 6.4 Add deterministic package validation for contribution collisions, missing declared resources, unresolved or external runtime imports, duplicate native closures, and cross-target binaries.
- [x] 6.5 Consolidate registration into the single app entry, validate the registration plan before side effects, and dispose registered features and started capabilities in reverse dependency order.
- [x] 6.6 In the same canonical-path cutover, delete internal feature activation exports and manifests, dynamic loaders, embedded registry, scoped-context factory, temporary VSIX scripts, extracted `dist/features/*` assumptions, feature package `.vscodeignore` ownership, and release paths that can emit internal feature VSIX files.
- [x] 6.7 Add archive and poisoned-path tests proving one extension manifest/entry, one target-native closure, complete retained contributions, no internal extension payloads, and no successful legacy activation/discovery/packaging path.

## 7. Flatten the workspace graph after the single-extension cutover

- [x] 7.1 After isolated-host verification proves the single-extension path, move reusable Agent nested packages to top-level packages or merge thin types/contracts/test utilities into the owning Agent package according to the inventory.
  - The physical move is complete and the isolated Development Host loaded only
    `neko.neko-suite` from the directly staged application while Agent and Cut
    contributions remained operational in the synthetic fixture workspace.
- [x] 7.2 Move reusable Canvas and Cut domain/UI packages to top-level packages or owning-package subpaths according to the inventory.
- [x] 7.3 Move reusable Preview and Tools contracts/UI packages to top-level packages or owning-package subpaths according to the inventory.
- [x] 7.4 Update package imports, exports, tsconfig references, Turbo tasks, Vitest projects, package groups, lockfile, tests, and documentation for the flattened canonical paths.
- [x] 7.5 Change workspace discovery to `apps/*` and `packages/*` only and add a check that rejects every nested workspace manifest.
- [x] 7.6 Delete obsolete parent-container manifests and nested package directories after all consumers use the flattened paths; do not retain aliases, proxy packages, or dual exports.
- [x] 7.7 Run package-boundary, circular-dependency, build-order, unused-export, and focused package tests for the flattened graph.

## 8. End-to-end verification and documentation

- [x] 8.1 Run focused Host Kernel, port, state migration, feature adapter, packaging, producer/consumer, and path-assertion tests.
- [x] 8.2 Run `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:legacy-debt`, and `pnpm check:unused`, resolving every nested-workspace or legacy-path finding.
- [x] 8.3 Build and inspect each supported platform VSIX and verify exact artifact names, runtime closure, checksums, and absence of internal VSIX files.
- [ ] 8.4 Install the final VSIX in an isolated synthetic Extension Development Host and validate activation, retained commands/views/editors, Webview messaging/CSP/resources, Node/FFmpeg and target-native runtime readiness, lazy-capability diagnostics, and disposal.
- [x] 8.5 Run applicable Agent evaluations for changed Agent capability/host routing and record real-case evidence or explicit external blockers.
- [x] 8.6 Update architecture overview, package boundaries, application composition, contributor/build/release documentation, and package-specific docs to describe the single-layer workspace and single-extension Host Kernel.
- [x] 8.7 Perform the Neko quality review, record commands/results and residual process-fatal risk, and confirm the old embedded-extension path cannot return success.
- [x] 8.8 Before moving any domain, React, VS Code, local-metadata, or project export out of `@neko/shared`, create and strictly validate the independent successor OpenSpec `decompose-neko-shared-ownership`.
