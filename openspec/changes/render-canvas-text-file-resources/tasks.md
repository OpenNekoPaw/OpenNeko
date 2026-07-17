## 1. Contracts and canonical source routing

- [x] 1.1 Extend Canvas document kinds and source classification for Markdown and supported plain-text files, with focused contract tests.
- [x] 1.2 Validate picker results so the Script entry rejects non-screenplay extensions and document/text selections use the canonical Document path.

## 2. Extension Host text projection

- [x] 2.1 Define correlated Webview/Extension request and result contracts for bounded text-file projection and explicit diagnostics.
- [x] 2.2 Implement path-authorized, size-bounded, strict UTF-8 reads in the Extension Host without persisting runtime content.
- [x] 2.3 Add host/message tests for success, unsupported kind, missing file, oversize input, invalid UTF-8, and correlated failure results.

## 3. Shared and Canvas rendering

- [x] 3.1 Add a safe normalized Markdown document display primitive to `@neko/ui` with tests for semantic rendering, inert HTML, unsafe links, and non-fetching images.
- [x] 3.2 Render authored `TextCanvasNode` values according to explicit format on an opaque display surface and expose input chrome only during explicit editing.
- [x] 3.3 Render file-backed Markdown/plain text as runtime projections in a full-body, opaque, low-chrome Document node with lightweight label and visible loading/error states.
- [x] 3.4 Refactor Script nodes to use an opaque low-chrome layout and explicit idle/loading/ready/empty/error runtime states.

## 4. Documentation and deterministic verification

- [x] 4.1 Update Canvas package documentation for supported text resources, durable/runtime ownership, rendering rules, and unsupported Script selection behavior.
- [x] 4.2 Run OpenSpec strict validation, focused tests, affected package typechecks/builds, dependency/legacy checks, and `git diff --check`.

## 5. Runtime and quality acceptance

- [x] 5.1 Run the `vscode-extension-debugger` preflight and the focused Extension Development Host Canvas scenario; record an exact blocker and residual risk if no existing CDP endpoint is available.
- [x] 5.2 Apply the Neko L2 quality review, resolve blocking findings, and record verification coverage plus remaining risks.

## 6. Unified text-file import

- [x] 6.1 Change shared source classification so Markdown, Fountain, and supported plain-text extensions produce one typed text asset with explicit format; add regression tests proving generic import cannot produce Script or text Document assets.
- [x] 6.2 Decode bounded strict UTF-8 text inside the canonical Extension Host add-source flow and return content only on a successful correlated result.
- [x] 6.3 Create an editable `TextCanvasNode` snapshot with title, content, format, and portable source provenance; keep historical Script/Document nodes readable without using them for new text imports.
- [x] 6.4 Update picker filters, Canvas documentation, focused tests/builds, OpenSpec validation, and L2 verification evidence for the new canonical path.

## 7. Node header hierarchy

- [x] 7.1 Resolve imported Text headers from durable title/provenance and render a shared file icon while preserving the generic authored-text label.
- [x] 7.2 Remove foundational Header gradient/divider chrome and align spacing, truncation, controls, and accessibility through the existing `NodeHeader` path.
- [x] 7.3 Render spatial-group counts as `xN`, add focused tests, run affected builds and VS Code Webview runtime inspection, then update verification evidence.
