## Context

OpenNeko for VS Code is currently a pure `neko.neko-suite` extension pack. Engine, Tools, Preview, Assets, Agent, Cut, and Canvas are seven independent extensions with separate manifests, activation functions, Webview payloads, storage contexts, and cross-extension discovery through `vscode.extensions.getExtension(...)`. CI and Release therefore expose eight or nine VSIX files even though users perceive one product.

VS Code does not install nested VSIX files from another VSIX. A renamed archive or an extension pack containing unpublished child identifiers would not be an offline-installable product. The application composition root must become the sole installed extension while retained packages remain the owners of their domain implementations.

The supported release matrix remains exactly `darwin-arm64` and `linux-x64`. The worktree contains concurrent domain changes, so implementation must keep edits at public integration boundaries and preserve overlapping user work.

## Goals / Non-Goals

**Goals:**

- Publish exactly one directly installable OpenNeko VSIX for each supported platform.
- Preserve feature-package ownership, command/view/custom-editor identifiers, Webview resources, and Engine native closure.
- Give each embedded feature an explicit lifecycle, scoped resource root, isolated disposable owner, and namespaced storage projection.
- Replace internal marketplace-style extension discovery with one typed in-process registry owned by the VS Code application composition boundary.
- Fail before publication on manifest collisions, missing payloads, incorrect native target content, or unexpected release artifacts.
- Preserve project files and settings; detect legacy multi-extension installations and surface the prelaunch state-reset boundary before activation proceeds.

**Non-Goals:**

- Publishing the embedded feature packages separately to the VS Code Marketplace.
- Restoring unsupported platforms or adding Windows packaging.
- Copying domain behavior into `apps/neko-vscode`.
- Installing nested VSIX files at runtime or invoking undocumented VS Code installation commands.
- Preserving independent activation of internal feature extension IDs after the single-package migration.

## Decisions

### The application root is the only installable extension

`apps/neko-vscode` keeps the stable `neko.neko-suite` identity but gains a runtime `main` entry. Its generated manifest contains the union of retained feature contributions and no `extensionPack` or internal `extensionDependencies` entries.

Alternative considered: keep the pure extension pack and attach a renamed bundle. Rejected because VS Code cannot install nested extension payloads and the resulting `.vsix` would not activate the product offline.

### Feature VSIX files are build-only payload inputs

Existing package compilers and `.vscodeignore` ownership remain authoritative. The platform assembler packages each retained feature into a temporary VSIX, extracts its `extension/` payload beneath `dist/features/<feature-id>/`, and removes the temporary VSIX files. Engine is packaged for the exact matrix target before extraction. Only the composed OpenNeko VSIX leaves the platform packaging job.

This avoids duplicating seven package inclusion/exclusion policies in the application while making intermediate packages unreachable from GitHub Release publication.

### Manifest composition is deterministic and fail-visible

A repository-owned assembler reads the canonical package group and merges `activationEvents`, `contributes`, localization dictionaries, categories, keywords, and required external dependencies. It rejects duplicate contribution identities with unequal definitions, localization collisions, internal extension dependencies, missing compiled payloads, unexpected package groups, and target/version mismatches.

The generated manifest, staging directory, and temporary feature VSIX files are build outputs and are not committed.

### Embedded activation uses public package adapters and scoped contexts

The application activates features in dependency order:

```text
Engine -> Tools -> Preview -> Assets -> Cut -> Canvas -> Agent
```

Each packaged feature exposes its existing `activate`/`deactivate` module as an embedded adapter. The application creates a scoped `ExtensionContext` projection whose `extensionUri`, `extensionPath`, `asAbsolutePath`, `subscriptions`, storage URIs, and memento keys are isolated by feature identity. Deactivation runs in reverse order and aggregates failures into a visible diagnostic.

The projection is an application composition concern; domain packages continue to own their activation behavior and do not import the application.

### Internal API discovery uses one shared registry

A small VS Code-host registry in the shared L1 boundary maps canonical Neko extension IDs to lazy embedded activators and exported APIs. Internal Neko callers resolve through that registry. Calls for external extensions such as `vscode.git` continue to use the VS Code API directly. Missing, duplicate, stale, or cyclic embedded feature registrations fail visibly.

Alternative considered: monkey-patch `vscode.extensions.getExtension`. Rejected because it mutates host APIs, hides ownership, and is not testable as a stable contract.

### Legacy installation state is explicit

The unified extension checks for installed legacy Neko feature extensions. Because VS Code does not expose another extension's `workspaceState` memento for migration, activation must present a one-time confirmation describing which ephemeral UI/preset state may reset and must not silently uninstall extensions. Workspace project files and configuration settings remain untouched; feature global-storage directories are reused or migrated only through explicit, tested filesystem paths. Users remove legacy extensions after confirmation to prevent duplicate contribution ownership.

### CI and Release share the same artifact contract

Merge Gate and Release each run one platform matrix that produces:

- `OpenNeko-darwin-arm64-<version>.vsix`
- `OpenNeko-linux-x64-<version>.vsix`

The aggregate gate requires both matrix entries. Release publication rejects every other VSIX and generates `SHA256SUMS` over exactly those two files. Tag validation continues to require main ancestry and consistent source manifest versions.

## Five-Layer Analysis

- **Responsibility:** feature packages own code and feature assets; `apps/neko-vscode` owns installed product lifecycle and manifest composition; platform packaging owns native closure; Release owns publication only.
- **Dependency:** the application consumes public feature adapters and shared L1 registry contracts; packages never import the application; Webviews remain browser-only and Engine remains authoritative for native computation.
- **Interface:** canonical feature IDs, lazy activation, exported APIs, scoped contexts, and the two artifact names are the only new contracts.
- **Extension:** adding a retained feature requires one package-group entry, a collision-free manifest, an embedded adapter, and tests; supported platforms remain a closed matrix.
- **Testing:** deterministic assembler/registry/context tests prove structure and failure paths; package inspection proves payload/native closure; GitHub runner packaging proves both targets; Extension Development Host proves install and activation.

## Risks / Trade-offs

- **[Manifest contribution collisions]** -> The assembler compares semantic definitions and fails with both owning package paths.
- **[Feature resource paths break under composition]** -> Scoped contexts point to extracted feature roots and package-content tests assert every referenced Webview/localization asset exists.
- **[Cross-feature APIs activate in a cycle]** -> The registry tracks activation state and rejects cycles with the full dependency chain.
- **[Legacy extensions register duplicate commands]** -> Unified activation detects installed legacy Neko IDs and requires explicit user confirmation/removal; it never silently continues with duplicate owners.
- **[Large platform artifact]** -> The package necessarily includes Engine runtime and all feature payloads; CI reports size and rejects accidental duplicate native targets.
- **[Intermediate VSIX leakage]** -> Platform jobs upload an allowlisted final path only, and publication validates exactly two OpenNeko filenames.
- **[Concurrent worktree overlap]** -> Edits stay at integration seams where possible; overlapping domain files are reviewed hunk-by-hunk and unrelated changes remain unstaged.

## Migration Plan

1. Add deterministic manifest/payload assembler tests and the shared embedded feature registry/context contracts.
2. Add the application runtime and migrate internal Neko extension discovery to the registry.
3. Build one unified VSIX locally for the host platform and inspect its manifest, payload roots, and native closure.
4. Replace CI and Release multi-artifact jobs with the shared platform assembler and artifact allowlist.
5. Run supported-platform GitHub packaging and install the resulting VSIX in an isolated Extension Development Host fixture.
6. Publish the first single-package version with release notes explaining removal of legacy feature extensions and state-reset confirmation.

Rollback before release restores the extension-pack manifest and previous workflow artifact lists. After a single-package release, rollback requires a new version tag; protected tags and published artifacts are never overwritten.

## Open Questions

None. The product requirement selects a single offline-installable VSIX, so nested installers and marketplace-dependent extension packs are excluded.
