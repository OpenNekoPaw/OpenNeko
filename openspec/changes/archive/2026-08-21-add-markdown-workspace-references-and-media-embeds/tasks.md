## 1. Canonical Markdown Authoring Projection

- [x] 1.1 Audit existing Markdown extension parsing, Text Editor Source/Rich paths, Agent mention catalogs and Desktop resource transport; record exact reusable owners, forbidden reuse and overlapping in-flight files.
- [x] 1.2 Add a pure `@neko/markdown` authoring-assistance contract for caret context, exact replacement ranges, GFM snippets and caller-provided mention/resource candidates.
- [x] 1.3 Add parser-context, malformed-input, CJK, inline-code/fence/raw-HTML exclusion, duplicate-label and forbidden-target tests for the authoring projection.

## 2. Text Editor Reference Catalog

- [x] 2.1 Define package-owned, Workspace/document/request-qualified reference search contracts and stable candidate identities in `@neko/text-editor-domain` without importing Agent or Electron contracts.
- [x] 2.2 Implement the owning Workspace file/entity/asset catalog composition with bounded results, exact diagnostics and per-contributor failure isolation.
- [x] 2.3 Add producer, consumer/delegation, stale-request and poison tests proving there is one catalog path and no active/recent Workspace, Agent catalog or raw-path fallback.

## 3. Markdown Source Assistance

- [x] 3.1 Adapt the canonical Markdown authoring projection to CodeMirror completion for GFM, `@`, `[[` and `![[` triggers while preserving the existing Fountain provider.
- [x] 3.2 Route accepted completion through the exact Text Document edit sequence and suppress semantic completion during IME composition.
- [x] 3.3 Add Webview interaction tests for insertion ranges, keyboard use, empty/ambiguous results, CJK IME, stale results, document switching and two visible editor Roots.

## 4. Authorized Media Projection

- [x] 4.1 Define Text Editor media prepare/release contracts bound to exact Workspace, document, surface and source token identities using existing Content/Media descriptors.
- [x] 4.2 Wire Desktop sender/path authorization to the canonical opaque resource transport and reject absolute paths, `file:` URLs, runtime URLs, unsupported kinds and stale surface identities.
- [x] 4.3 Add package producer and Desktop delegation tests proving authorized image/audio/video projection, exact lease release and no raw/cache/Agent fallback.

## 5. Rich And Split Presentation

- [x] 5.1 Render resolved CommonMark images and `![[...]]` image resources with bounded layout, alt text, local diagnostics and Source reveal while preserving document bytes.
- [x] 5.2 Add typed audio/video presenters with user-operated controls, no autoplay, canonical Range transport and exact unmount/token-removal release.
- [x] 5.3 Prove Milkdown source-preserving round-trip for enabled extension nodes before Rich mutation; otherwise retain the read-only Rich projection and canonical Source mutation path.
- [x] 5.4 Add incomplete-token, missing/ambiguous/unauthorized resource, sibling containment, stale preparation and document-switch Webview tests.

## 6. Validation And Delivery

- [x] 6.1 Run focused `@neko/markdown`, Text Editor Domain/Webview, Desktop renderer/Main tests and typechecks; record exact commands, failures and residual risks.
- [x] 6.2 Run dependency/boundary/OpenSpec validation and poison searches proving no private Markdown profile, second catalog, raw filesystem render path or runtime URL persistence exists.
- [x] 6.3 Use `neko-ui-validation` on visible Electron for Source completion, Rich/Split images, missing media, audio/video controls, light/dark theme, CJK IME, keyboard and adjacent Workbench behavior.
- [x] 6.4 Use `neko-quality-review`, close blocking findings, update stable architecture/package documentation and commit implementation in independently reviewable batches.
- [x] 6.5 Restore CommonMark list markers and canonical GFM task checkboxes in Rich/Split presentation; prove valid and malformed source remain distinct, document bytes stay authoritative, and the visible Electron result is correct in light and dark themes.
- [x] 6.6 Restrict `@` to entity mentions, group `[[` / `![[` candidates by declared file or linked-media source, refine the CodeMirror completion presentation, and validate malformed `![[[` plus portable-library boundaries in visible Desktop.
