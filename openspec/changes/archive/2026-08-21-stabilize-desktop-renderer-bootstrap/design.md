## Context

The Desktop Renderer is served by Vite during Electron development. Package consumers import explicit `@neko/*` public entries, but the current canonicalization plugin recognizes only six hand-maintained entries. An unrecognized entry can resolve through a consumer-local pnpm symlink such as `packages/canvas/webview/node_modules/@neko/canvas-domain/src/index.ts`. Vite then appends its dependency optimizer browser hash and serves that workspace source with a one-year immutable cache policy. The hash represents optimizer inputs rather than a later source-export change, so Chromium can execute an old export surface across Forge and Electron restarts.

The current HTML imports `src/renderer/main.tsx` directly. Static ESM linking completes before that module can look up `#root`, call `createRoot`, or mount `DesktopRootErrorBoundary`. A linking error therefore produces an empty document. Canvas is the remaining primary creative Root imported eagerly by its Desktop Surface, so one Canvas Webview module failure is also promoted into the application bootstrap graph instead of being contained by the existing slot-level `DesktopSurfaceErrorBoundary`.

The affected owner is `apps/neko-desktop`: Vite source identity, Electron HTML entry loading, CSP-safe startup presentation, and Desktop Surface composition depend on the application runtime. No host-neutral Canvas, Agent, Assets, Cut, Preview, or user-data rule changes.

## Goals / Non-Goals

**Goals:**

- Derive one exact catalog of internal public imports from the canonical `packages/**/package.json` manifests.
- Canonicalize catalogued Vite imports to their real workspace file identity before Vite classifies them as dependencies.
- Make application import and initialization failures visible before React mounts, with one explicit same-entry retry.
- Keep Canvas Webview loading inside the Canvas Surface so its failure is caught by the owning slot boundary.
- Prove the stale export path, bootstrap failure path, recovery action, and ordinary Electron startup.

**Non-Goals:**

- Clearing Chromium, Vite, pnpm, or user-data caches during normal startup.
- Catching a module contract error and continuing with an old module, alternative package source, or empty successful result.
- Moving domain behavior into Desktop, changing public package exports, or changing durable records.
- Introducing a generic page registry, module fallback loader, feature flag, or compatibility path.

## Decisions

### 1. Package manifests are the workspace public-entry catalog

Desktop Vite configuration will enumerate package manifests below the repository `packages/` root, require each discovered package name and exports map to have the supported canonical shape, and derive exact public import names from the export keys. `.` maps to the package name and `./subpath` maps to `<package-name>/subpath`. The same catalog is the complete `optimizeDeps.exclude` source; no `@neko/*` entry remains in `optimizeDeps.include`, so configuration cannot assign an internal public entry both canonical workspace-source and optimized-dependency identities.

This replaces the manually curated `DESKTOP_RENDERER_CANONICAL_WORKSPACE_ENTRIES` allowlist. The existing package manifests already own public entry declarations, so a second list would inevitably drift. The scanner is build configuration logic in the Desktop application boundary and is not a runtime package registry.

Alternative considered: add only `@neko/canvas-domain` to the current list. Rejected because previous commits already fixed Canvas and Agent entries one at a time, and the same omission would recur for the next workspace public entry.

### 2. Canonicalization resolves only exact internal public imports

The Vite pre-resolve plugin will act only when the bare source string is in the derived catalog. It delegates once to Vite's normal resolver, requires a filesystem result, resolves the file through `realpathSync`, and returns that canonical path. Relative files, third-party packages, virtual modules, URLs, and undeclared internal subpaths retain Vite's normal behavior.

The canonicalizer removes Vite's dependency-only `v=<browserHash>` query after resolving the real workspace file while preserving unrelated query and fragment semantics. The canonical file is outside consumer-local `node_modules`, so excluded live workspace source no longer receives the optimizer URL or immutable dependency cache policy. Existing intentionally optimized third-party dependencies remain unchanged. Missing or invalid catalog entries fail configuration visibly rather than being ignored.

Alternative considered: disable the entire Electron HTTP cache or clear caches at every start. Rejected because it hides source-identity defects, slows all dependencies, and still leaves duplicate module identities in the graph.

### 3. A minimal bootstrap owns pre-React failure presentation

`index.html` will load a small bootstrap module. That module owns only root lookup, dynamic import of the canonical application entry, invocation of its exported mount function, and a DOM-only fatal-startup view. It does not import React, package Webviews, Desktop bridges, or domain code.

The fatal view derives Chinese or English copy from the document language because the full i18n runtime is not available before the application entry loads. Its CSS owns a bounded light/dark palette and focus treatment because React theme tokens are also unavailable at this boundary. It exposes the original diagnostic and a retry button that reloads the same page. This duplication is intentionally bounded to the pre-application runtime boundary and does not create another application i18n or theme service.

The application entry will export one async mount function instead of self-starting. Initialization rejection propagates to the bootstrap; render-time descendant errors remain owned by the existing React Root and Surface boundaries.

Alternative considered: add `window.onerror` beside the existing static script. Rejected because static ESM linking failures are not reliably attributable to an application promise, while a dynamic import gives the bootstrap an exact rejection boundary.

### 4. Canvas Webview Root is loaded at the Canvas Surface boundary

`DesktopCanvasSurface` will follow the existing Cut, Preview, Assets, and authorized-preview pattern: `React.lazy` imports `@neko/canvas-webview/root`, and `Suspense` renders a localized loading state. The surrounding workbench slot already owns `DesktopSurfaceErrorBoundary`, so import rejection renders a local panel diagnostic and preserves the Shell, Agent, resources, and other slots.

Canvas domain contracts needed to create the host identity remain normal Desktop imports; only the Webview presentation Root moves out of the bootstrap graph.

Alternative considered: dynamically import every Desktop module from the HTML bootstrap. Rejected because that still makes one optional Surface module application-fatal and does not satisfy fail-local ownership.

### 5. Tests verify paths, not only final text

Configuration tests will prove that the derived catalog contains the Canvas domain public entry, that the old six-entry allowlist is gone, and that a consumer-local symlink resolves to the repository package identity. Bootstrap tests will inject success and failure application loaders, assert one mount call, visible diagnostics, and same-page retry. Canvas tests will reject the lazy module and assert the local Surface boundary while a sibling remains rendered. A real Electron development run will verify ordinary startup and a forced stale-cache reload scenario without changing real user data.

## Risks / Trade-offs

- [Scanning package manifests increases Vite configuration work] -> The local package count is small, scanning occurs once at configuration startup, results are sorted and frozen, and no runtime watcher or cache is introduced.
- [A package manifest exposes a conditional export object] -> Only export keys determine the public import catalog; target condition selection remains owned by Vite's resolver.
- [Bootstrap styling can drift from application UI] -> Reuse existing Desktop CSS tokens and class conventions while keeping the DOM structure minimal; validate light/dark and compact window states in Electron.
- [Reload repeats a persistent source or contract defect] -> This is intentional fail-visible behavior. The diagnostic remains visible after retry and no alternative module or success result is selected.
- [Canvas lazy loading adds a short loading state] -> Reuse the established creative-main placeholder pattern and keep dimensions stable so layout does not shift.

## Migration Plan

1. Atomically replace the manual canonical-entry list with manifest-derived public entries and update its tests.
2. Move Canvas Webview Root loading to its owning Surface boundary.
3. Replace the direct HTML application script with the bootstrap/application mount contract and add focused tests.
4. Restart the development Vite/Electron runtime once so the new resolver becomes authoritative, then validate normal reload and failure presentation in an isolated Electron fixture.

Rollback is a code revert of this change. No durable data, cache format, project file, or user setting is written by the migration.

## Open Questions

None.
