## 1. Architecture Governance

- [x] 1.1 Update application composition documentation to define the allowed thin Desktop root and the forbidden business-owner responsibilities.
- [x] 1.2 Update package-boundary documentation to require business logic ownership by first-level packages regardless of current Host count.
- [x] 1.3 Update repository development rules with the five-layer ownership audit, touch-to-converge policy, migration rules, and delivery evidence.
- [x] 1.4 Record the confirmed current Desktop drift candidates and clarify that they are migration inputs rather than accepted architecture.
- [x] 1.5 Update stable architecture documentation with the package role taxonomy, split criteria, family naming, explicit-export policy, and inactive-package capability semantics.
- [x] 1.6 Record how active Generation, Tools, Agent Evaluation, Media, Assets, and Canvas OpenSpecs consume this topology without duplicating their domain requirements.

## 2. Complete Ownership Inventory

- [x] 2.1 Inventory every production responsibility under `apps/neko-desktop/src/main`, `preload`, `renderer`, and `shared`, classifying it as Application boundary, concrete adapter, product shell, or misplaced business owner.
- [x] 2.2 Inventory all workspace packages with role, runtime environment, public exports, dependency closure, production consumers, source aliases, data/resource lifecycle, and current product-integration status.
- [x] 2.3 Identify all feature contracts, React components, Node implementations, config policy, metadata bindings, and project/domain codecs currently exposed by `@neko/shared`.
- [x] 2.4 Map every `@neko/platform` responsibility to Agent/Host settings, AI provider adapter, Generation, Content/Host, or another explicit owner.
- [x] 2.5 Assign each drift item a target package/public entry, migration slice, caller set, old-path removal condition, user-data impact, and verification command.
- [x] 2.6 Split the inventory into dependency-ordered bounded changes; do not create a catch-all Desktop, Shared, Platform, or generic manager package.

## 3. Workspace-Wide Boundary Enforcement

- [x] 3.1 Introduce a validated package-role catalog or manifest-derived discovery that covers every workspace package and distinguishes infrastructure, domain family, Node, Webview, testing, content-only, retained kernel, and active product package.
- [x] 3.2 Replace the hand-maintained `check:deps` source-root list with full workspace discovery and preserve cycle, L0, domain ownership, and runtime-direction checks.
- [x] 3.3 Extend strict TypeScript and Node/Webview checks to every applicable package role, including `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, browser-safe imports, and Node-only entry isolation.
- [x] 3.4 Add checks for wildcard exports, undeclared workspace dependencies, package/directory identity drift, consumer imports of unexported `src/*`, and Vite/Vitest aliases that bypass public entries.
- [x] 3.5 Add focused failing fixtures for package-to-app, Webview-to-Node/Electron, domain-to-Webview, contract-to-runtime, business-owner-in-app, package-role omission, and legacy fallback violations.
- [x] 3.6 Require changed Desktop or package modules to provide owning responsibility, package-role, canonical-path, producer/consumer, and runtime verification evidence in OpenSpec and quality review.

## 4. Shared And Platform Convergence

- [x] 4.1 Freeze new feature-domain, React, Node, provider, and configuration responsibilities in `@neko/shared` and `@neko/platform` through review and automated gates.
- [x] 4.2 Define the minimal retained `@neko/shared` public surface and replace its wildcard export with an explicit migration ledger for every removed entry.
- [x] 4.3 Move `@neko/shared/components` consumers and implementations to `@neko/ui`, then delete the compatibility export and unnecessary React peer dependencies from Shared.
- [x] 4.4 Move Agent, Canvas, Assets, Generation, Character, Preview, Tools, Content, and Entity contracts from Shared to their owning package one domain slice at a time, switching all consumers and poisoning each old export.
- [x] 4.5 Separate generic metadata/storage/IO ports and Node/SQLite adapters from domain-specific binding, migration, and projection schema; decide the narrow local-metadata owner without creating a central domain fact store.
- [x] 4.6 Move Platform config/provider/media/files responsibilities to their assigned owners, switching all consumers without a compatibility facade.
- [x] 4.7 Delete `@neko/platform`, its package aliases, manifest dependency, tests, documentation, and quality entries after the final owner migration proves no successful Platform path remains.

## 5. Domain Family Normalization

- [x] 5.1 Normalize Agent to explicit contracts/runtime/Webview identities, narrow runtime exports, route provider adapters without Platform, and merge or remove the zero-consumer test-utils package.
- [x] 5.2 Move Canvas authoring, material action, Media Library handoff, and related Shared contracts into Canvas domain/application and the necessary Node adapter, leaving only concrete Desktop authorization and wiring.
- [x] 5.3 Preserve Cut domain/node/Webview separation while renaming the generic `@neko/cut-webview` identity and replacing wildcard or internal aliases with explicit entries.
- [x] 5.4 Split `neko-assets` into domain/application, Node adapter, and Webview dependency closures; migrate Desktop Media Library sync, recovery, copy, and portability responsibilities to the correct owner.
- [x] 5.5 Reclassify Preview policy and state from contracts into a domain owner, establish any required Node content adapter, and keep Webview browser-only while Desktop retains only resource authorization and composition.
- [x] 5.6 Complete the Tools media-comparison domain/contract, Node/Media adapter, Webview, and Desktop producer path under the owning Tools OpenSpec, or retire the inactive packages if that product path is rejected.
- [x] 5.7 Finish moving generated-output lifecycle and provider-neutral Generation behavior from Platform/Desktop into `@neko/generation`, preserving the existing Generation OpenSpec as behavior owner.
- [x] 5.8 Tighten Content to explicit core/document/node entries, preserve Media's root/node/browser model, and keep Entity/Chara/Search/Quality as single packages while they share one dependency closure.
- [x] 5.9 Mark Chara, Search, Quality, Tools, and any other zero-consumer package as retained/inactive until a real Desktop composition exists; do not add empty runtime or Webview packages for symmetry.

## 6. Desktop Canonical Composition

- [x] 6.1 Replace each migrated app-owned business service with a thin Desktop adapter that performs only sender/schema/path authorization, native resource binding, package-port invocation, result projection, and disposal.
- [x] 6.2 Move package-owned cross-runtime contracts out of `apps/neko-desktop/src/shared`; retain only Desktop shell/window/automation contracts whose owner is the executable product boundary.
- [x] 6.3 Remove Desktop Vite/Vitest aliases to unexported package internals and resolve renderer entries through declared package exports.
- [x] 6.4 Update package names, directory identities, manifests, imports, scripts, quality ownership, documentation, and lockfile within each bounded family migration; do not retain compatibility names or re-exports.
- [x] 6.5 Delete, poison, or fail-closed every replaced app-owned business path and assert that no IPC handler, renderer bridge, test fixture, or development command can still return legacy success.

## 7. Verification And Completion

- [x] 7.1 For every migration slice, run owning package contract/domain/application tests and Desktop consumer/delegation tests with explicit canonical-path and no-fallback assertions.
- [x] 7.2 Run full workspace dependency, strict TypeScript, Webview, application, export, manifest, unused-code, legacy-debt, test, and build gates after all package and import migrations.
- [x] 7.3 Run packaged or development Electron scenarios for affected IPC, window, security, credential, file, SQLite, media, reload, cancellation, and disposal paths using isolated fixture workspaces.
- [x] 7.4 Verify user project/settings/credential data handling for every moved persistence adapter and document migration, preservation, rebuild, or deliberate rejection semantics.
- [x] 7.5 Remove temporary role exceptions and migration ledgers, update stable package/application architecture and domain docs, validate OpenSpec strictly, and archive only after the ownership inventory is empty.
