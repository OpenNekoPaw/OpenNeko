## Context

The EPUB Webview uses EPUB.js with `openAs: 'directory'`. Desktop Preview already expands an EPUB through `createNodeArchiveResource` and publishes its entries with `DesktopResourceRegistry.registerResourceTree`, while Asset Center always uses `registerFile`. Keeping the EPUB branch private to the Desktop application root caused the two consumers to diverge.

Five-layer analysis:

- Responsibility: Preview owns the format-specific publication rule; Content owns archive access; Desktop owns resource authorization and protocol registration; Assets owns selection and session projection.
- Dependency: the canonical publisher depends on host-neutral Preview media-type rules, Content's Node archive port and an injected resource-tree publisher. It does not depend on Electron or Desktop registry types.
- Interface: one narrow `EpubPreviewResourcePublisher` port accepts authorized resource-tree entries and returns a lease URL/release function.
- Extension: another authorized Preview consumer can use the same publisher without importing Desktop composition code or reimplementing archive rules.
- Test: producer tests cover valid/malformed archives, disposal and trailing slash; consumer tests poison `registerFile` for EPUB and verify ordinary files still use it.

## Goals / Non-Goals

**Goals:**

- Make valid Media Library EPUB files render through the existing EPUB Viewer.
- Establish one canonical EPUB archive publication path for Desktop Preview and Asset Center.
- Keep authorization, archive lifetime and failures scoped to the exact Preview session.

**Non-Goals:**

- No EPUB parsing/rendering changes in the Webview.
- No media-library data migration, refresh workaround or automatic file repair.
- No fallback to single-file publication, raw filesystem paths or a second archive implementation.
- No change to non-EPUB Preview behavior.

## Decisions

### 1. Preview Node owns the canonical publisher

`@neko/preview-node` indexes the authorized EPUB with Content's Node archive reader, verifies `META-INF/container.xml`, maps archive entries to Preview-owned media types and passes a lazy resource tree to an injected publisher. The package contains no Electron identity, protocol or filesystem authorization policy.

### 2. Desktop retains the trust boundary

Desktop enriches the exact Window/View/Session owner with the current renderer-session identity before calling `DesktopResourceRegistry.registerResourceTree`. The returned opaque URL is the only renderer-visible resource locator. Asset Center does not receive raw protocol registration authority.

### 3. EPUB has no single-file success path

For `application/epub+zip`, consumers call only the canonical resource-tree publisher. Missing container descriptors, invalid archives, authorization failures and aborted publication reject the current Preview and remain fail-visible. Ordinary files continue through `registerFile`.

### 4. Archive lifetime follows the resource lease

The resource tree owns archive disposal. Publication failure disposes immediately; successful publication disposes when the exact Preview session releases its resource registration. Aborted Desktop publication releases an already-created lease before throwing.

## Runtime Boundary And Replaced Path

- Producer: `@neko/preview-node`.
- Consumers: `DesktopPreviewRuntime` and `AssetCenterNodeRuntime`.
- Trust adapter: `DesktopResourceRegistry` wiring in the Electron main composition root.
- Replaced path: the private EPUB archive-building branch in `desktop-preview-runtime.ts` and Asset Center's unconditional `registerFile` branch for EPUB.
- User data: read-only; no file or metadata mutation.

## Risks / Trade-offs

- EPUB archives are indexed before the Preview is ready; the existing lazy entry reader prevents whole-archive buffering, while entry-size limits remain enforced by Content.
- Adding a Node package increases workspace surface slightly, but prevents application-root format ownership and consumer-specific divergence.

## Migration Plan

1. Add the Preview Node package and focused producer tests.
2. Replace the existing Desktop EPUB branch with the package public API.
3. Add Asset Center resource-tree wiring and consumer tests.
4. Run package/contract gates and validate a real Media Library EPUB in visible Electron.

Rollback restores the two consumers together and removes the package; there is no data migration.
