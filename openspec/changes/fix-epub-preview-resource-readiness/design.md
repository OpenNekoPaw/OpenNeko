## Context

Desktop Main authorizes the EPUB archive as one transient Preview descriptor. The Renderer fetches
that archive through the Preview source URL and epub.js owns archive parsing plus conversion of
manifest resources to browser-safe blob URLs.

`EpubViewer` currently waits for `book.ready`. In epub.js 0.3.93, that promise resolves after the
resources collection is created, while `book.opened` resolves only after archived resource
replacement URLs and replacement CSS have finished. The waterfall viewer can therefore serialize a
chapter with unresolved relative URLs. Its later measurement and virtualization cycle can unload
and render the same section again after replacement completion, producing the observed broken-image
then recovered-image sequence.

The affected responsibility is package-local to `@neko/preview-webview`. No Desktop IPC or media
descriptor contract is incomplete: the archive has already been fetched and parsed when chapter
alternate text appears.

## Goals / Non-Goals

**Goals:**

- Establish one explicit readiness barrier before any archived EPUB chapter render.
- Ensure the first visible waterfall chapter uses epub.js-projected resource URLs.
- Treat a visible chapter image load failure as a Preview failure instead of successful settlement.
- Preserve waterfall virtualization, pagination, position persistence, and deterministic cleanup.
- Add path-level regression evidence and real Electron Desktop qualification.

**Non-Goals:**

- Replace epub.js or implement EPUB archive parsing in OpenNeko.
- Move EPUB entry projection into Desktop Main.
- Change the Desktop Preview descriptor or persisted project formats.
- Change the unified OpenNeko resource transport or add a second document transport.
- Add retries, compatibility branches, or a second EPUB rendering path.

## Decisions

### Use `book.opened` as the resource-readiness contract

The viewer will wait for `book.opened`, fenced by the existing book load epoch, before extracting
metadata or enabling waterfall rendering. `openFailed` remains the explicit rejection path.

`book.ready` is not retained as a parallel success condition because it does not include archived
resource replacement completion. The implementation will isolate the third-party readiness
contract in a small package-local function so a deterministic test can hold `opened` pending and
prove that Preview cannot advance early.

Alternative considered: poll `book.resources.replacementUrls`. Rejected because it depends on
epub.js internals, cannot distinguish in-progress from failed replacement, and creates a second
readiness fact.

Alternative considered: allow the first render and trigger a refresh after `book.opened`. Rejected
because it preserves the broken first paint and relies on recovery rather than preventing invalid
state.

### Make image settlement distinguish load from failure

The waterfall resource waiter will resolve on image `load` and reject on image `error`. An image
that is already complete is successful only when it has decoded dimensions; an already-complete
image with no intrinsic width is a failure. A failure from a currently attached, loaded chapter is
projected through the existing document error surface.

Stale or detached chapter work remains fenced by existing element identity checks. Background
height measurement may log and retain an estimated height, but it cannot convert a failed visible
chapter into a successful Preview result.

Alternative considered: keep treating both events as settled and inspect only chapter height.
Rejected because broken images become indistinguishable from valid zero-height content.

### Keep the fix inside the owning Webview

No shared UI, theme, i18n runtime, path resolver, cache, or Desktop bridge is added. The failure uses
the existing document error rendering and package logger. EPUB readiness is specific to epub.js and
has no matching abstraction in PDF, DOCX, or CBZ viewers.

The outer archive URL is a transient `openneko://resource` projection from the Desktop exact-resource
registry. This package-local readiness fix does not reinterpret that URL, persist it, or create
another document transport; it only waits for epub.js to finish its internal archive-resource
replacement before rendering.

## Risks / Trade-offs

- [Large EPUBs take longer before the first valid paint] -> Keep the existing loading overlay
  visible until the archive resources are actually ready; correctness takes precedence over a
  premature broken view.
- [A malformed EPUB image now fails visibly] -> Include the chapter/resource context in the
  diagnostic and verify valid large image-based EPUBs in Electron.
- [Third-party `book.opened` can fail or remain pending] -> Preserve `openFailed` rejection and
  avoid adding silent timeouts or retries that would misreport readiness.
- [Virtualization may detach work while resources settle] -> Retain the current book epoch and
  chapter element identity fences before committing state.

## Migration Plan

This is an internal prelaunch behavior fix with no persisted-data migration. Deploy the new
readiness barrier and tests atomically. Rollback is the code revert; no user data or protocol state
is changed.

## Open Questions

None.
