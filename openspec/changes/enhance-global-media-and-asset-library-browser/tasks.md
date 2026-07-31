## 1. Contract And Reuse Boundary

- [x] 1.1 Audit the current Home Asset Center, `neko-assets` Resource Browser Root/thumbnail lifecycle,
      `@neko/ui` collection primitives, application view preference, Desktop preview/media adapters,
      and concurrent Settings/Shell changes; record reuse, extraction, replacement, and conflict
      decisions in the implementation notes.
- [x] 1.2 Define the package-owned global-library L0 contract with explicit owner/item identity,
      catalog revision, list/grid preference input, thumbnail descriptor/variant, asset import/remove
      outcomes, and no renderer-visible physical paths.
- [x] 1.3 Upgrade Desktop Home Management to v7 by composing the Assets contract through fixed
      sender-bound channels; add exact-shape producer/consumer tests and poison v6, unknown-field,
      missing-revision, and cross-owner payloads.
- [x] 1.4 Add architecture guards proving browser-safe Assets entries do not import Electron/Node,
      Desktop Main does not import React, and the application root consumes only package public
      entries without duplicate global-library DTOs.

## 2. Canonical Content Visibility

- [x] 2.1 Add red content-tree tests for `.DS_Store`, nested dot-prefixed files/directories,
      visible siblings, root/child browsing, recursive search, and absence of hidden item/thumbnail
      identities.
- [x] 2.2 Implement the canonical dot-prefixed visibility policy before stat, classification,
      metadata, recursion, and result projection while preserving the existing exact excluded
      directory policy.
- [x] 2.3 Route global Media Library search/children and Asset Library traversal through the same
      visibility path and delete any caller-local hidden filtering or fallback.
- [x] 2.4 Reject add/relink of a dot-prefixed Media Library root before creating a managed link and
      cover available, unavailable, cancelled, and unchanged-target outcomes.

## 3. Revisioned Thumbnail Runtime

- [x] 3.1 Add red presenter/contract tests for image/video descriptor identity, modified-time and
      byte-length revision, fixed `icon`/`hover` variants, unsupported typed icons, and stale-result
      rejection.
- [x] 3.2 Implement browser-safe global-library thumbnail projection and exact current-item
      resolution with sender, endpoint, owner-root, containment, descriptor, and revision validation.
- [x] 3.3 Add a narrow cancellable deterministic video-frame operation to `@neko/media/node` and
      producer/consumer tests for supported video, decode failure, cancellation, process release,
      and no FFmpeg/path leakage.
- [x] 3.4 Compose image thumbnail and video-frame adapters in Desktop Main with fixed sizes, bounded
      concurrency, sanitized diagnostics, and no persistent catalog/cache manager.

## 4. Owned Asset Lifecycle

- [x] 4.1 Add exact contract and runtime tests for native multi-file selection, cancelled selection,
      per-file added/conflict/rejected outcomes, refresh, and absence of selected absolute paths in
      Renderer payloads.
- [x] 4.2 Implement regular-file and supported-material validation, operation-owned hidden staging,
      no-replace publication, current-operation cleanup, and explicit partial import reporting
      without following symbolic links or accepting directories.
- [x] 4.3 Add red deletion tests for current owned asset, cancelled confirmation, stale revision,
      missing file, directory, symbolic link, hidden staging, path escape, Media Library identity,
      trash failure, and poison permanent-delete fallback.
- [x] 4.4 Implement Asset Library remove through exact current projection validation and the
      operating-system trash, keeping the file and projection unchanged on failure.
- [x] 4.5 Serialize Asset import/remove mutations in the owning runtime, publish fresh catalog
      revisions after effects, and prove Media Library read-only browsing does not share or require
      the mutation lock.

## 5. Desktop Bridge And Host Composition

- [x] 5.1 Migrate AppHost, IPC, preload, global bridge declarations, endpoint fencing, and Electron
      composition to Home v7 global-library search/children/thumbnail/import/remove and existing
      connection operations.
- [x] 5.2 Add AppHost/IPC/preload tests for unknown sender, stale endpoint, mismatched request/result,
      absolute-path rejection, late thumbnail response, and deterministic disposal.
- [x] 5.3 Keep Media Library removeConnection, relink, reveal, Asset import, and Asset remove as
      distinct routes and prove no request can succeed through label lookup, active Project,
      same-named fallback, legacy catalog, or another owner.

## 6. Package-Owned Browser Experience

- [x] 6.1 Extract the global-library controller and React Root into `neko-assets` public entries,
      reuse the existing Resource Browser view preference and thumbnail presentation, and remove
      duplicate Asset/Media item state from `DesktopShell.tsx`.
- [x] 6.2 Implement stable list rows and fixed thumbnail grid tiles for both owners with shared
      selection, search, sort, directory context, loading, empty, unavailable, and diagnostic states.
- [x] 6.3 Replace browse/open-folder buttons with single-click selection, native double-click and
      Enter activation, deterministic focus, search-to-directory activation, and breadcrumbs;
      retain reveal/relink/remove-connection in explicit accessible menus.
- [x] 6.4 Implement viewport-lazy icon thumbnails plus 180ms pointer/focus static hover previews with
      generation/abort fencing, anchored non-shifting layout, typed fallback icons, and cleanup on
      leave, focus change, query/facet/directory change, or unmount.
- [x] 6.5 Implement Asset import and confirmed trash removal controls with serialized pending state,
      cancelled/partial/conflict/rejected/success/failure feedback, refreshed projection, and no
      directory-delete or Media Library file-delete affordance.
- [x] 6.6 Update Chinese and English labels, tooltips, accessible names, settings integration, and
      Home regression styles without creating nested cards or a package-local design system.

## 7. Path-Level And Renderer Qualification

- [x] 7.1 Add `neko-assets` controller/Root tests for list/grid parity, preference restore,
      double-click/Enter navigation, no open-directory button, breadcrumbs, hidden content,
      thumbnail lazy loading, hover cancellation, stale fencing, and unsupported icons.
- [x] 7.2 Add Desktop source/runtime tests using isolated asset and connected-directory fixtures to
      prove hidden entries never project, thumbnail requests hit the exact canonical path, asset
      imports create owned bytes, asset trash removes only the owned file, and connection removal
      preserves every external byte.
- [x] 7.3 Add Renderer/AppHost path assertions proving the package-owned Root and new v7 handlers are
      used while the old Home cards, v6 handlers, permanent delete, Media Library copy, legacy Asset
      catalog, active-Project, and path fallback routes remain poisoned.
- [x] 7.4 Run focused package and Desktop tests/typechecks, including the affected `neko-assets`,
      `@neko/media`, and `apps/neko-desktop` commands, and resolve all failures.

## 8. System Validation And Documentation

- [x] 8.1 Run `pnpm build`, `pnpm test`, and `pnpm check` for shared contract and cross-package
      validation; run `pnpm check:legacy-debt`, `pnpm check:unused`, and `pnpm check:quality` for
      removed/fallback path and dependency verification.
- [x] 8.2 Run strict OpenSpec validation and `git diff --check`; update relevant Assets/domain and
      Desktop documentation for the package owner, hidden policy, thumbnail variants, owned Asset
      mutations, and external Media Library protection.
- [x] 8.3 Package and run the real Electron Desktop against an isolated synthetic fixture covering
      `.DS_Store`/dot directories, Media Library double-click navigation, list/grid switching,
      image/video icon and hover thumbnails, multi-file Asset import outcomes, Asset trash removal,
      connection removal, reload, and window-close cleanup.
- [x] 8.4 Apply `neko-quality-review`, record actual commands/results and sanitized Electron evidence,
      and document any unsupported thumbnail codec/platform behavior, unexecuted validation, or
      residual staging/trash risk before declaring completion.

## 9. StrictMode And Desktop Density Regression

- [x] 9.1 Add a red React StrictMode lifecycle test proving effect replay cannot dispose the
      package-owned controller before the active catalog read, while a real unmount still releases
      it exactly once.
- [x] 9.2 Make controller ownership StrictMode-safe without weakening fail-visible disposal or
      retaining a parallel controller path.
- [x] 9.3 Add compact Desktop Global Library style assertions and align the header, toolbar,
      controls, diagnostics and collection spacing with the existing workbench density.
- [x] 9.4 Re-run focused package/Desktop validation, full quality gates, strict OpenSpec validation
      and the packaged Electron fixture across initial mount, reload and close; update sanitized
      evidence and residual risk.
