## 1. Canonical Surface Bootstrap

- [x] 1.1 Add an idempotent Cut bridge preparation lifecycle that starts one exact Snapshot before the lazy Root resolves, replays the latest Snapshot, and disposes the exact subscription.
- [x] 1.2 Add a package-owned Preview runtime bootstrap resource and switch the Desktop Preview Surface/Root to start one exact Snapshot concurrently with the lazy module.
- [x] 1.3 Add Cut and Preview producer/consumer tests proving module readiness is not a prerequisite for data bootstrap, StrictMode does not duplicate bootstrap, stale View results cannot project, and no hidden Root participates.

## 2. Demand-Driven Preview Sessions And Modules

- [x] 2.1 Extend the Preview canonical projection/session transition with a visible `loading -> ready | unavailable` preparation lifecycle and exact stale/cancellation behavior.
- [x] 2.2 Move Desktop Preview resource publication from open navigation into the first exact Snapshot preparation, deduplicate concurrent callers, and release/cancel pending sources on replace, close, detach and dispose.
- [x] 2.3 Split PDF, DOCX, EPUB, CBZ, Model, Audio and Video into exact lazy Viewer modules, move Quick Preview to its own public entry, and remove the static all-viewer import path.
- [x] 2.4 Add path-level tests proving the selected Viewer module alone executes, loading/error UI remains local and stable, and the deleted eager publication/all-viewer paths cannot return success.

## 3. EPUB Entry Resource Boundary

- [x] 3.1 Add `@neko/content/document/node` ZIP resource entry indexing/reading with normalized allowlist, duplicate/traversal/encryption/size/source-change rejection, cancellation and tests proving only requested entries are decompressed.
- [x] 3.2 Add Preview-owned EPUB entry MIME resolution with representative markup, style, image, font and media coverage.
- [x] 3.3 Add Desktop sender-bound resource-tree registration, exact path/MIME/Range handling, cancellation/release and security tests; keep the registry free of EPUB/container interpretation.
- [x] 3.4 Publish EPUB as one authorized virtual-directory resource tree and add Desktop Preview tests proving opening/navigation does not register or return the raw archive file.

## 4. EPUB Viewer Canonical Path

- [x] 4.1 Replace the archived `ArrayBuffer` EPUB loader with epub.js virtual-directory mode and remove the full-binary request/fallback path.
- [x] 4.2 Preserve viewport/bounded-neighbor chapter rendering while adding request evidence that first content leaves a poisoned distant chapter and unrelated assets unread.
- [x] 4.3 Update `make-epub-preview-viewport-lazy` artifacts to remove the now-invalid complete-ZIP allowance and validate both OpenSpec changes strictly.

## 5. Verification And Review

- [x] 5.1 Run scoped format, typecheck, Preview/Cut/Content/Desktop tests and production renderer/package build; record commands and canonical-path evidence in `verification.md`.
- [ ] 5.2 Run visible authoritative Electron cold/warm Cut and large EPUB flows, inspect loading/ready/error visuals plus request counts, and apply `neko-ui-validation` without substituting browser-only evidence.
      Blocked by the current local Desktop/Vite fixture startup conflict; attempts and report paths are recorded in `verification.md`.
- [x] 5.3 Apply `neko-quality-review`, scan changed paths for architecture/debt/redundancy issues, and record unresolved performance/runtime risk without claiming unmeasured latency budgets.

## 6. Workbench Surface Bootstrap Convergence

- [x] 6.1 Add a Canvas-owned idempotent bootstrap resource, start it from `DesktopCanvasSurface` beside the lazy module, and make `CanvasWebviewRoot` consume the same pending/latest Snapshot without a second `ready -> getSnapshot` request.
- [x] 6.2 Publish the first Canvas document Snapshot before Generation node reattachment; run reattachment asynchronously through the same exact Session projection and keep node failures local.
- [x] 6.3 Add Canvas producer/consumer tests proving one Snapshot request, StrictMode-safe disposal, stale View isolation, immediate document readiness and asynchronous Generation projection updates; delete or poison the Root-owned bootstrap path.
- [x] 6.4 Add the same package-owned Surface bootstrap contract to Text Editor and remove its Root-owned duplicate first projection request, with exact identity and stale completion tests.
- [ ] 6.5 Add the same package-owned Surface bootstrap contract to Resource Browser and remove its Root-owned duplicate first projection request while preserving event ordering and presentation restore, with exact identity tests.
- [ ] 6.6 Run focused Canvas/Text Editor/Assets/Desktop tests and builds, strict OpenSpec and architecture checks, then use authoritative Electron to inspect cold/warm View switching and record remaining UI evidence or blockers.
