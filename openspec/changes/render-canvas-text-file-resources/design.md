## Context

Canvas currently has three conflicting projections for text-like content:

- `TextCanvasNode` persists an explicit `plain | markdown` format but the basic renderer always mounts a textarea.
- Script resources are indexed by the Extension Host, but the picker can force arbitrary files into a Script node and the Webview infers loading from `scenes.length === 0`, so an empty or failed result is indistinguishable from an in-flight request.
- Document resources preserve portable file identity, but text files are not classified as documents and the existing resource renderer adds its own header, footer, dividers, and action button inside the `BaseNode` frame.

The work crosses the L1 Extension Host boundary, L2 Webview/UI rendering, and the shared Canvas contract. The Webview must not read workspace files or persist runtime file contents. Markdown rendering must use a shared normalized representation and must not import the Agent package's private renderer.

### Five-layer analysis

| Layer          | Decision                                                                                                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Responsibility | The Extension Host owns authorization, path resolution, bounded import reads, and diagnostics; Canvas owns the imported editable text snapshot and its provenance; `@neko/ui` owns reusable Markdown document rendering.                                                             |
| Dependency     | `neko-canvas` Webview depends on public `@neko/ui` primitives; `@neko/ui` depends on `@neko/markdown`; the Extension Host depends on existing Canvas path/project services. No Webview-to-filesystem or Canvas-to-Agent dependency is introduced.                                    |
| Interface      | Extend the dropped-asset contract with one text asset carrying explicit format, decoded content, and portable provenance. Script indexing remains separate from generic text-file addition.                                                                                          |
| Extension      | Additional text formats can be added by extending the explicit source-classification table and a renderer profile. Format guessing, content sniffing, and fallback-to-Script are deliberately excluded.                                                                              |
| Test           | Contract/classification tests cover canonical routing; host tests cover bounded read and diagnostics; shared UI tests cover safe Markdown; Canvas renderer tests cover low chrome and runtime states; Extension Development Host acceptance covers the real message and visual path. |

## Goals / Non-Goals

**Goals:**

- Route `.md`/`.markdown`, `.txt`/`.log`, and screenplay-text extensions to imported Text nodes.
- Render Markdown and plain text according to explicit durable format, with content occupying the node's content plane.
- Keep the `BaseNode` frame as the single structural node boundary, give text-like content an opaque theme surface, and remove permanent nested resource-card chrome.
- Persist the imported editable snapshot while enforcing a bounded, fail-visible Extension Host read.
- Distinguish Script loading, empty, ready, and error states.
- Preserve explicit editing for authored `TextCanvasNode` content without showing input chrome in display mode.

**Non-Goals:**

- A general-purpose code editor, syntax highlighter, or arbitrary binary-file previewer.
- Raw HTML execution, workspace-relative image loading, or implicit resource authorization from Markdown.
- Persisting file contents, Webview URIs, absolute paths, or runtime diagnostics into `.nkc`.
- Replacing the existing PDF/EPUB/DOCX/CBZ document-preview transport.
- Automatically reinterpreting historical Script nodes that point to unsupported extensions.

## Decisions

### 1. Every generic text-file import creates a Text node

Markdown, Fountain, and plain-text files use one explicit text classification. Drop and picker routing create `TextCanvasNode`; Markdown extensions select `format: markdown`, while all other supported text extensions select `format: plain`. Generic add-source routing does not create Script nodes.

This intentionally makes file addition an import into Canvas-authored text rather than a live file reference. It minimizes current node concepts for content creators and keeps future screenplay parsing, indexing, validation, and navigation behind an explicit workflow instead of extension-based Script creation.

### 2. File contents are bounded import snapshots

The existing project add-source request remains the canonical import boundary. After resolving or ingesting the source, the Extension Host verifies the text profile and size, decodes strict UTF-8, and includes content plus explicit format in the correlated successful result. The Webview creates the Text node only from that success.

The maximum read size is a named contract constant shared by the handler and tests. Oversize, missing, unreadable, non-UTF-8, unsupported-kind, and mismatched-response cases are visible failures. File contents and runtime state remain component/session state and are never written back to the Canvas document.

Direct Webview file access and live two-way source synchronization were rejected because they violate the sandbox or create competing content owners. The source path is retained only as portable provenance; Canvas content becomes authoritative after import.

### 3. Full Markdown display is a shared UI primitive over normalized Markdown

`@neko/ui` will expose a document-oriented Markdown view backed by the public `@neko/markdown` normalized AST. It renders the supported block and inline semantics needed by Canvas and remains usable by other Webviews. Canvas will not copy or import Agent-private Markdown components.

Raw HTML is rendered inertly, unsafe link schemes do not become navigable links, and image/resource nodes do not initiate local or remote fetches without an authorized resource projection. This is a display primitive, not a content-access service.

Using raw `dangerouslySetInnerHTML` or a Canvas-local parser was rejected for security and duplication reasons.

### 4. Display and edit modes are distinct

On the Canvas surface, an authored text node renders Markdown or whitespace-preserving plain text according to `data.format`. Editing is entered explicitly and may show a textarea/editor boundary only while editing. The persisted format remains the single source of truth; the renderer does not guess Markdown from content.

For file-backed Markdown/plain-text resources, a lightweight file label overlays the content plane without a divided header. Content scrolls inside the full node body. Authored text, file-backed text, and Script nodes use an opaque theme surface so Canvas grid and connections do not compete with readable content. Open remains available through activation/context actions instead of a permanent in-content button. Semantic Markdown borders such as blockquotes or tables are content, not resource-card chrome.

This keeps `BaseNode` as the only selection/frame owner and aligns text resources with foundational low-chrome nodes.

### 5. Script indexing has an explicit runtime state

Script nodes use an in-memory `idle | loading | ready | empty | error` projection keyed by node identity. A successful empty index becomes `empty`; a host failure becomes `error`; neither is represented as `loading`. Durable Script data continues to store only the indexed scenes required by the current Canvas contract, not request status or error text.

Inferring state from `scenes.length` was rejected because zero scenes is a valid result and cannot express failure.

### 6. Prelaunch migration is fail-visible and bounded

New imports and picker selections use the canonical text classification path. Existing Canvas files are not silently rewritten: historical Script and text Document nodes keep their declared type. Users can remove and re-add a source to receive the new Text-node snapshot behavior.

No compatibility fallback will reinterpret unsupported files as Script or render a failed read as an empty document.

### 7. Header hierarchy follows node semantics

The existing `NodeHeader` remains the canonical header for composable nodes. Foundational Canvas headers use a compact transparent treatment with no gradient image or divider; imported Text snapshots resolve their durable display title from `data.title` and portable provenance and add a file icon without duplicating a resource-card frame. Authored Text keeps the localized generic title when no explicit title exists.

Spatial groups retain their existing independent floating label because the label owns collapse and rename interactions for the spatial frame. Its count is rendered as `xN` beside the group name, matching creator-facing asset-group references without adding a second header inside the group.

A new generic header component, per-node header markup, and title inference from content were rejected because they would duplicate interaction ownership or make presentation dependent on mutable body text.

## Risks / Trade-offs

- [Large text files can make the Webview unresponsive] → Enforce a host-side byte limit before reading and return a size diagnostic.
- [Strict UTF-8 rejects legacy encodings] → Fail visibly with an encoding diagnostic; automatic encoding detection is outside this change and can be added as an explicit future profile.
- [A shared Markdown primitive increases `@neko/ui` surface area] → Keep the API display-only, normalized-AST-backed, and free of Canvas-specific resource logic.
- [Overlay labels can cover first-line content] → Reserve a small content inset while keeping one continuous scroll surface and no nested card/header boundary.
- [Historical malformed Script nodes remain] → Avoid silent data mutation; document the re-add path and verify unsupported refreshes cannot report success.
- [Runtime VS Code acceptance may be unavailable] → Run the debugger preflight first; if no existing CDP endpoint is present, record the exact blocker and retain focused DOM/message/build evidence as incomplete, not equivalent acceptance.

## Migration Plan

1. Extend and test the unified text source contract and poison automatic Script/Document routing for supported text extensions.
2. Add bounded Extension Host snapshot decoding to the canonical add-source result.
3. Add the shared Markdown document primitive and Canvas display/edit projections.
4. Replace text-like resource card chrome with the low-chrome content surface and add explicit Script runtime states.
5. Run focused tests/builds and the real Extension Development Host scenario.

Rollback restores extension-based Script/Document creation. Existing `.nkc` files remain readable because historical nodes are not rewritten; newly imported Text nodes already use the existing durable Text schema.

## Open Questions

None. Additional encodings, code-oriented formats, and authorized Markdown image resolution require separate explicit capabilities.
