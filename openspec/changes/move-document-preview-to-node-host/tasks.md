## 1. Lock down the Node transport contract

- [x] 1.1 Add real loopback regression tests for PDF/DOCX/CBZ GET, HEAD, MIME, CORS, closed/open/suffix Range, invalid ranges, unknown tokens, revocation, and disposal.
- [x] 1.2 Add EPUB directory-route tests for container/package/chapter/resource entry delivery, MIME mapping, missing entries, encoded traversal rejection, and bounded Node archive access.
- [x] 1.3 Add provider/message lifecycle tests proving ready is idempotent, token ownership is panel-scoped, and no document path calls Engine commands or `EngineClient`.

## 2. Implement the Node document server

- [x] 2.1 Add a Preview-owned Node loopback server with typed registrations, opaque tokens, lazy ephemeral-port startup, raw streaming, preflight handling, and deterministic shutdown.
- [x] 2.2 Implement strict single-range parsing, HEAD behavior, supported document MIME types, common EPUB entry MIME types, and fail-visible HTTP diagnostics.
- [x] 2.3 Route EPUB entries through `@neko/content/document/node` with traversal and size limits while keeping Node APIs out of browser-safe barrels.

## 3. Migrate document providers to the canonical Node path

- [x] 3.1 Replace `PreviewFileServer` Engine registration, retry, allow-list, URL construction, and Range reads with the Node server and Node document access.
- [x] 3.2 Migrate PDF, EPUB, DOCX, and CBZ providers to panel-scoped registrations and remove document-only Engine comments, tests, and imports.
- [x] 3.3 Make Webview ready handling idempotent and register the Node server with Preview extension disposal.
- [x] 3.4 Assert EPUB receives a trailing-slash directory URL while PDF/DOCX/CBZ receive raw token URLs, with no Engine fallback or legacy document route.

## 4. Reconcile architecture and verify

- [x] 4.1 Update the pruning design/verification to distinguish Node-owned document transport from Rust-owned media transport and record the replacement of the unverified EPUB path.
- [x] 4.2 Run focused Preview extension/Webview and `@neko/content` tests, affected typechecks/builds, dependency/legacy/unused checks, strict OpenSpec validation, and `git diff --check`.
- [ ] 4.3 Run real Extension Development Host scenarios for PDF, EPUB, DOCX, and CBZ, capturing DOM/network/console evidence that Node routes load and Engine document routes do not participate.
  - VS Code Debugger host/controller, loopback route, and no-Engine evidence passed for all four synthetic documents. DOM/network/console capture is blocked by the missing parent renderer CDP endpoint and is recorded in `verification.md`.
- [x] 4.4 Apply the Neko quality-review gates, resolve actionable findings, and document any remaining repository-baseline blockers or runtime risks.
