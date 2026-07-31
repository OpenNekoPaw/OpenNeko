# Verification

Date: 2026-07-31

Risk classification: L4. This change crosses package-owned Assets presentation, Electron
Main/preload/renderer contracts, native file selection, owned-file staging/system Trash, FFmpeg
thumbnail extraction, external Media Library connection lifecycle and a major Desktop browsing
workflow.

## Architecture And Canonical Path

- `neko-assets` owns the browser-safe global-library contract, controller and React Root. Desktop
  composes the Root through its public entry and does not own a second Asset/Media collection UI.
- Desktop Home Management v7 is the only IPC path. Main revalidates sender, endpoint, catalog
  revision, owner/item identity, thumbnail descriptor and real-path containment before native or
  filesystem effects; v6 and path-bearing payloads fail before effects.
- Media Library entries expose opaque identity, connection-safe `libraryLabel` and relative
  locator only. External paths remain Host-owned and connection removal unlinks only the managed
  link.
- Asset import uses operation-owned hidden staging plus no-replace publication. Asset removal
  revalidates a current owned regular file and delegates only to the operating-system Trash.
- Image/video thumbnails use revisioned descriptors and fixed icon/hover variants. Main bounds
  concurrent work and cancels all Window-owned controllers during detach; Renderer generation
  fencing prevents late results from crossing item, query or directory state.
- Dot-prefixed filtering runs in the shared content-tree traversal before stat, classification,
  recursion or projection. No Renderer-local hidden filter or hidden item identity exists.

## Deterministic Validation

- `pnpm --filter neko-assets exec vitest run src/global-library/contract.test.ts
  src/global-library/controller.test.ts src/global-library/root.test.tsx` - 3 files, 14 tests
  passed, including search-result directory activation preserving the owning connection label.
- `pnpm --filter @neko/app-desktop exec vitest run
  src/main/desktop-resource-browser-runtime.test.ts
  src/main/desktop-resource-browser-source.test.ts
  src/shared/home-management-contract.test.ts src/renderer/DesktopApplication.test.tsx` - 4 files,
  35 tests passed.
- `pnpm --filter neko-assets typecheck:resource-browser` - passed.
- `pnpm --filter @neko/app-desktop typecheck` - passed.
- `pnpm build` - 6/6 Turbo tasks passed; the Desktop production package was regenerated.
- `VITEST_MAX_WORKERS=2 pnpm test` - 28/28 workspace tasks passed.
- `pnpm check` - passed; Knip reported configuration hints only and dependency-cruiser found no
  violations across 1,033 modules and 3,232 dependencies.
- `pnpm check:legacy-debt` - passed with zero blocking findings and zero retired Asset catalog
  violations.
- `pnpm check:quality` - passed all architecture, content-access, Webview, strict-TypeScript,
  test-ownership and strict OpenSpec gates; 93 OpenSpec items validated.
- The repository-wide build also exposed an unrelated missing `Message` type import in a concurrent
  Agent Webview test; the import was restored without changing runtime behavior and the full build
  then passed.

## Packaged Electron Evidence

The production package was launched only against an isolated synthetic functional home and
dedicated Electron user-data directory. No real user workspace, credential or private local
configuration was captured.

Observed:

1. `.DS_Store`, a dot-prefixed directory and its descendants never appeared; visible hierarchy
   remained browsable.
2. List/grid switching persisted across reload/relaunch. Single click selected, double-click opened
   `Editorial/Sequences`, Enter used the same activation path and breadcrumbs navigated ancestors.
3. Image and MP4 icon thumbnails rendered. Hover produced a larger anchored static preview with no
   media autoplay or collection layout shift.
4. Native multi-file Asset import reported an existing `import-one.png` conflict while publishing
   `import-two.mp4`; both current owned assets projected thumbnails and the existing file was not
   overwritten.
5. Confirmed Asset removal moved only `import-two.mp4` to system Trash. The owned projection omitted
   it and retained `import-one.png`; Trash was not emptied.
6. Confirmed Media Library connection removal removed the managed `Editorial` link while an external
   sentinel file remained byte-for-byte present.
7. The latest regenerated package opened a `Sequences` search result with breadcrumb
   `媒体库 / Editorial / Sequences`, proving the explicit `libraryLabel` contract rather than
   parsing opaque identity.
8. Reload/relaunch restored the view preference. Final Window close logged
   `Desktop AppHost disposed` and the Electron processes exited cleanly. After allowing bounded
   parallel icon/hover work, the final packaged run emitted no thumbnail IPC handler error.

Sanitized screenshots are gitignored under:

- `reports/webview-functional/enhance-global-media-and-asset-library-browser/08-final-video-hover-layout-loaded.png`
- `reports/webview-functional/enhance-global-media-and-asset-library-browser/09-asset-import-conflict-and-video.png`
- `reports/webview-functional/enhance-global-media-and-asset-library-browser/10-asset-trash-result.png`
- `reports/webview-functional/enhance-global-media-and-asset-library-browser/11-media-connection-removed.png`
- `reports/webview-functional/enhance-global-media-and-asset-library-browser/12-search-directory-breadcrumb-latest-package.png`

## Evaluation And Residual Risk

This work does not change Agent prompts, Skills, capability/tool routing, provider/model selection,
AgentSession behavior or Desktop Agent event projection, so `neko-agent-evaluation` is not
triggered.

- The packaged fixture proves PNG and the bundled FFmpeg runtime's MP4 path. Other image/video
  codecs remain platform/runtime dependent; unsupported or decode-failed content keeps its typed
  icon and does not fail the catalog.
- A process crash can leave bytes below hidden operation staging. They remain excluded from catalog
  and mutation identity; automatic recovery requires a separately owned manifest/recovery design.
- System Trash behavior depends on the operating system and mounted volume. Failure is visible and
  never falls back to permanent deletion; restore and Trash-empty workflows are intentionally
  outside this change.

## StrictMode And Desktop Density Regression

The reported `Global Library controller is disposed.` diagnostic was reproduced by mounting the
package Root under React 18 StrictMode. Effect replay ran the cleanup for the memoized controller,
then the active replayed effect attempted its catalog read through that already-disposed instance;
the runtime search was never reached.

The Root now defers controller release to a microtask guarded by instance-scoped `mounted` and
`released` state. StrictMode reactivation cancels the release by ownership state, while a real
unmount releases exactly once. The controller itself remains fail-visible after disposal. Global
Library styling was aligned to the Desktop workbench density with a 16px heading, 12px surface text,
28px controls, 16px content gutters and smaller fixed grid tiles; the surface remains full-height
and unframed.

Validation:

- `pnpm --filter neko-assets exec vitest run src/global-library/root.test.tsx` - 1 file, 8 tests
  passed, including the StrictMode controller lifecycle regression.
- `pnpm --filter neko-assets typecheck:resource-browser` - passed.
- `pnpm --filter @neko/app-desktop exec vitest run src/renderer-styles.test.ts` - 1 file, 9 tests
  passed, including the compact unframed workbench style contract.
- `pnpm --filter @neko/app-desktop typecheck` - passed.
- `pnpm build` - 6/6 Turbo tasks passed and regenerated the arm64 Electron package.
- `VITEST_MAX_WORKERS=2 pnpm test` - 28/28 workspace tasks passed.
- `pnpm check` - passed; dependency-cruiser found no violations across 1,033 modules and 3,232
  dependencies.
- `pnpm check:legacy-debt` - passed with zero blocking findings and zero retired Asset catalog
  violations.
- `pnpm check:quality` - passed all product, architecture, content-access, Webview, strict-TypeScript,
  test-ownership and strict OpenSpec gates; 93 OpenSpec items validated.
- `openspec validate enhance-global-media-and-asset-library-browser --strict` and
  `git diff --check` - passed.

The regenerated packaged Electron app was launched against the isolated synthetic fixture and a
dedicated temporary user-data directory. Initial entry and post-reload entry both loaded
`Editorial` without a disposed-controller, IPC or console diagnostic. List/grid switching, directory
double-click, breadcrumb navigation and image thumbnail projection remained compact and functional;
`.DS_Store` and the dot-prefixed fixture directory remained absent. Closing the Window logged
`Desktop AppHost disposed`, and the temporary managed link and user-data directory were removed
without touching the external fixture.

Sanitized evidence:

- `reports/webview-functional/enhance-global-media-and-asset-library-browser/13-strictmode-compact-layout-post-reload.png`
