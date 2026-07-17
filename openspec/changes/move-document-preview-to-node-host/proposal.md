## Why

Document previews currently register PDF, EPUB, DOCX, and CBZ sources through the Rust media Engine even though document archive/file access belongs to the Extension Host. The pruning change moved EPUB entry reads to Node but left the user-facing preview transport on Engine tokens; the resulting split ownership is unverified in a real Webview and currently fails to load EPUB files.

## What Changes

- Introduce one Preview-owned Node loopback service that registers document sources under opaque runtime tokens, serves PDF/DOCX/CBZ file bytes, and exposes EPUB archive entries on demand.
- Route PDF, EPUB, DOCX, and CBZ preview data through the Node service; these document previews no longer start, register with, or unregister from the Rust Engine.
- Keep file paths inside the Extension Host and expose only tokenized loopback URLs to Webviews.
- Use HTTP Range streaming for PDF and CBZ, bounded whole-file delivery for DOCX, and a trailing-slash EPUB directory endpoint backed by bounded Node archive-entry reads.
- Enforce bounded request parsing, token revocation, CORS/private-network response headers, file/entry MIME types, and fail-visible diagnostics.
- Make token ownership panel-scoped so multiple editors and repeated Webview ready events cannot revoke or leak another panel's registration.
- Preserve the Rust Engine file-token path for retained media, seek, streaming, and codec workloads; this change does not create a media fallback.

## Capabilities

### New Capabilities

- `node-document-preview-transport`: Node-hosted token registration, HTTP/Range and archive-entry delivery, lifecycle, and Webview consumption for PDF, EPUB, DOCX, and CBZ previews without an Engine dependency.

### Modified Capabilities

None.

## Impact

- `packages/neko-preview/packages/extension`: document preview transport, provider lifecycle, activation/disposal, and tests.
- `packages/neko-preview/packages/webview`: EPUB archive request contract and document viewer runtime tests.
- `packages/neko-content`: existing Node document access remains the shared archive-entry boundary; no browser-safe export gains Node APIs.
- `packages/neko-engine` and `@neko/neko-client`: document preview callers are removed, while media consumers and Engine contracts remain unchanged.
- Active pruning OpenSpec documentation must be reconciled so it no longer claims Engine ownership for document preview transport.
