## Context

The Preview extension already renders documents in dedicated Webviews: PDF.js consumes byte ranges, zip.js consumes CBZ ranges, docx-preview consumes a complete DOCX buffer, and epub.js can consume an unpacked directory-style endpoint. The Extension Host owns workspace paths and already uses `@neko/content/document/node` for bounded EPUB entry reads, but `PreviewFileServer` still registers every document with `EngineClient` and sends an Engine URL to the Webview.

The current EPUB URL has no `.epub` suffix and no trailing directory route. epub.js therefore treats it as a directory and requests `META-INF/container.xml` below a route that only accepts one token segment. Moving only archive parsing to Node left two owners and no valid end-to-end EPUB contract.

### Five-layer analysis

- **Responsibility:** Preview owns document-Webview transport and panel lifecycle; `@neko/content/document/node` owns bounded Node file/archive reads; Webviews own document parsing/rendering; the Rust Engine owns media codec, stream, GPU, timeline, and export computation.
- **Dependency:** the Preview Extension may depend on the Node document entry point, while browser bundles remain restricted to browser-safe barrels. Document providers no longer depend on `EngineClient` or the Engine activation command.
- **Interface:** one Node server exposes opaque document registrations, raw file URLs, EPUB directory URLs, unregister, and disposal. HTTP paths never accept local file paths.
- **Extension:** additional document formats can add a transport profile and MIME mapping without adding a second server or importing another feature package. The service stays Preview-local until a second host consumer demonstrates the same lifecycle and error model.
- **Testing:** server tests cover real loopback requests, Range/HEAD/CORS, entry traversal, MIME, token revocation, and disposal; provider tests prove no Engine command/client participates; Extension Development Host scenarios prove the four real Webviews load.

## Goals / Non-Goals

**Goals:**

- Make Node Extension Host the only owner of PDF, EPUB, DOCX, and CBZ preview file access.
- Preserve format-appropriate on-demand behavior instead of downloading a large EPUB as one archive buffer.
- Bind only to loopback, hide paths behind unguessable tokens, and revoke registrations with their owning panel.
- Keep one canonical document path with no Engine fallback or dual registration.
- Preserve Rust Engine ownership for video/audio/image processing, timelines, streams, effects, and export.

**Non-Goals:**

- Replace the Rust media Engine or its generic media file-token path.
- Move Node APIs into browser-safe `@neko/content/document` exports or Webviews.
- Build a general-purpose repository-wide HTTP server without another real consumer.
- Add legacy `.doc` parsing or change the document renderers themselves.

## Decisions

### Use one Preview-owned Node loopback server

`PreviewFileServer` remains the document-provider facade for path resolution and bounded entry helpers. A focused Node HTTP server owns listening, token registration, response construction, and shutdown. It binds to `127.0.0.1` on an ephemeral port and starts lazily on the first document registration.

This server is package-local because its token lifecycle, routes, MIME behavior, and consumers are specific to Preview. The shared `@neko/content/document/node` adapter remains the canonical archive-entry reader. Promoting the HTTP host to a shared package now would create a public abstraction with only one owner.

Alternatives rejected:

- Keep Engine document tokens: preserves split ownership and forces document-only sessions to activate native media infrastructure.
- Add a second Node fallback: violates the canonical-path and fail-visible constraints.
- Expose local paths or `vscode-resource` URLs: cannot provide the cross-origin Range and archive-entry behavior required by the current viewers.

### Use transport profiles that match each viewer

- PDF uses the raw token URL with GET/HEAD and single HTTP byte ranges.
- CBZ uses the same raw URL because zip.js `HttpReader` reads the central directory and entries through Range requests.
- DOCX uses a bounded full response because docx-preview requires one `ArrayBuffer`.
- EPUB receives `/v1/document-preview/epub/:token/` with a trailing slash. Requests beneath it resolve one normalized archive entry through the Node document adapter, allowing epub.js directory mode to load the container, package, chapters, images, styles, and fonts on demand.

A single raw URL was rejected for EPUB. epub.js would either infer directory mode against a non-directory route or require downloading the complete archive before JSZip can open it.

### Keep token and panel lifetimes instance-scoped

Each registration uses a cryptographically random token and stores one immutable file path plus transport profile. Provider token ownership is keyed by the concrete `WebviewPanel`, not the file path or active editor. A panel handles `ready` only once, unregisters only its own token, and provider/extension disposal revokes remaining tokens and closes the server.

This prevents an old panel disposal or duplicate ready message from revoking or leaking a newer panel registration for the same document.

### Stream raw files and bound archive reads

Raw responses use file metadata and Node streams; they do not load PDF/CBZ files into Extension Host memory. Single closed, open-ended, and suffix byte ranges are supported. Invalid or multiple ranges return `416` with `Content-Range: bytes */size`.

EPUB entries use the existing Node adapter limits and traversal rejection. Token lookup and entry normalization happen before opening data. Unknown tokens and entries are visible `404` responses; malformed paths/ranges are visible `400`/`416` responses.

### Preserve the media Engine boundary

Only document-provider Engine calls are removed. Preview video/audio services, Canvas/Cut playback, media Range transport, codec pools, GPU processing, streams, proxy, and export continue through the Rust Engine. The active pruning design is superseded only where it describes document preview bytes as Engine-owned.

## Risks / Trade-offs

- **[Extension Host now serves document bytes]** → use Node streams for raw files, bounded archive entry reads, loopback-only binding, and explicit cancellation/error cleanup.
- **[EPUB opens the ZIP for multiple entry requests]** → keep one canonical bounded reader first; profile real books before introducing a per-token archive index/cache and give any cache explicit token ownership.
- **[Local-network access policy blocks Webview requests]** → handle OPTIONS and emit CORS plus private-network response headers; verify in the real Extension Development Host.
- **[Panel races leak or revoke tokens]** → make ready idempotent and registration ownership panel-scoped, with regression tests for repeated ready and disposal.
- **[A generic MIME fallback renders content incorrectly]** → map supported document and common EPUB entry types explicitly and use `application/octet-stream` only for unknown archive resources.

## Migration Plan

1. Add red-capable Node server and provider-path tests.
2. Implement the Node server and reuse the shared Node archive-entry adapter.
3. Replace `PreviewFileServer` Engine registration/Range operations with Node registrations and reads.
4. Migrate all four providers to panel-scoped tokens and one-time ready handling.
5. Register server disposal with the Preview extension and remove obsolete document Engine tests/comments/imports.
6. Reconcile the pruning design and run focused tests, builds, dependency/legacy checks, and real Webview scenarios.

Rollback is a source rollback of this change. There is no runtime Engine fallback for documents.

## Open Questions

None. A per-token EPUB archive index is a measured performance follow-up, not a second access path.
