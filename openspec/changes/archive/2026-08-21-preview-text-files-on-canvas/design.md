## Context

Generic Canvas File nodes currently preserve an authorized `ContentLocator` but render only a file icon. Markdown snapshot nodes are a separate Canvas-owned editable document type, so routing referenced JSON or text files through that node type would duplicate source content into `.nkc` and give it the wrong editing semantics.

This change crosses the Canvas domain, its Node runtime, the Canvas Webview and the Electron trust boundary. It must use the existing content access contract, keep the renderer path-free, bound memory and rendering cost, and isolate failures to the requesting File node.

The five-layer ownership analysis is:

- **Responsibility:** `@neko/canvas-domain` owns eligibility, preview kinds, formatting and the exact request/result contract. `@neko/canvas-node` owns the host-neutral application service that reads authorized content. `@neko/canvas-webview` owns request lifecycle and presentation. Desktop owns sender/workspace authorization and concrete service wiring only.
- **Dependency:** Canvas domain depends only on the L0 `@neko/content` contract. Canvas Node may depend on the Node content adapter through its public entry. Canvas Webview stays browser-only. Desktop depends on public package entries and Electron APIs at the trust boundary.
- **Interface:** one exact `readTextFilePreview` query carries Canvas identity, node identity and `ContentLocator`; one discriminated result returns bounded presentation text or a typed local diagnostic. No raw path, internal version, general-purpose read API or durable body field is added.
- **Extension:** supported kinds are an explicit `json | markdown | plain` union. Adding another format requires an intentional domain policy change and tests, rather than a wildcard renderer or priority registry.
- **Testing:** domain parser/format tests prove bounded output and strict failure; session tests prove exact identity/locator authorization; Desktop bridge tests prove sender-bound delegation; Webview tests prove loading, ready, empty, error, unsupported and stale-response behavior; visible Electron evidence covers the full product path.

## Goals / Non-Goals

**Goals:**

- Show useful, bounded read-only content inside eligible File nodes.
- Format valid JSON, render referenced Markdown read-only, and preserve plain-text line structure.
- Keep the existing file label, white node surface, border, selection and shadow hierarchy.
- Make unauthorized, missing, oversized, malformed and failed reads visible only on the affected node.
- Preserve one canonical authorized content path and make stale asynchronous results unable to update a changed or unmounted node.

**Non-Goals:**

- Editing JSON, plain text or referenced Markdown in place.
- Converting File nodes to Markdown snapshot nodes or synchronizing source files.
- Persisting preview text, diagnostics or loading state in the Canvas document.
- Previewing arbitrary binary or unknown formats.
- Adding background indexing, a preview cache manager, a generic file-read bridge or a format plugin registry.

## Decisions

### 1. Add one Canvas-owned query contract

`@neko/canvas-domain` will expose an exact request/result contract and strict parsers. The request contains a request identity, exact Canvas identity, File node identity and its `ContentLocator`. The result echoes the request and node identities and is either `ready`, `unsupported` or `unavailable`. Ready results carry an explicit preview kind, bounded text, and truncation/empty facts; unavailable results carry a stable diagnostic code.

This is a query on the active Canvas host runtime, not a document mutation intent. A mutation would incorrectly imply that the preview changes durable Canvas facts. A generic Desktop content-read bridge is rejected because it would expose a broader renderer capability and move Canvas policy outside its owner.

### 2. Keep authorization and reading on the Host side

The canonical public path is:

```text
FileCanvasNode.contentLocator
  -> CanvasWebviewHostPort.readTextFilePreview
  -> sender-bound Desktop Canvas IPC
  -> DesktopCanvasRuntime exact workspace session
  -> CanvasHostRuntimeSession identity and locator validation
  -> CanvasTextFilePreviewService
  -> ContentReadService
  -> strict Canvas result parser
  -> FileNode presentation
```

The producer is the File node projection; the consumers are the active Canvas runtime session and Webview component. `@neko/canvas-node` provides the canonical application service through its public entry. `apps/neko-desktop` retains only Electron sender validation, workspace-scoped `ContentReadService` construction and delegation because those operations require the Application trust boundary and concrete workspace grant. It does not retain file-kind, decoding, formatting or presentation policy.

There is no replaced successful preview path: the previous generic icon remains the canonical unsupported/binary presentation. The new query replaces only the empty body for eligible authorized text File nodes.

### 3. Bound and strictly decode the projection

The service uses a fixed package-owned byte limit and `ContentReadService.read`; the Webview cannot raise the limit. UTF-8 is decoded in fatal mode. JSON must parse successfully and is formatted with two-space indentation before a separate bounded presentation excerpt is produced. Invalid JSON returns a local diagnostic and does not fall back to raw-text success. Plain text preserves line breaks; Markdown returns bounded source text for the shared read-only Markdown renderer.

Eligibility uses the declared media type when present and a normalized basename extension from the File reference as a narrow format hint. Only JSON, Markdown and an explicit set of plain-text extensions/media types are accepted. Unknown or binary input returns `unsupported` before attempting a broad renderer fallback.

The fixed limit protects host memory; the formatted excerpt limit protects Webview layout. Truncation is explicit in the result and UI. Empty files are a normal ready state with a visible empty presentation.

### 4. Validate the authoritative File node before every read

`CanvasHostRuntimeSession` requires an active session, exact Canvas identity, an existing File node, and exact equality between the requested locator and the node's current authoritative locator. A stale or forged node/locator request fails closed with a typed unavailable diagnostic and cannot read another resource.

The Webview creates one request per node/locator state. Cleanup invalidates the request; responses whose request identity no longer matches are ignored. This handles node deletion, locator replacement, workspace changes and unmount without retaining a hidden runtime or writing presentation state into the Canvas store.

### 5. Render content directly on the existing node surface

The File node body uses the existing white/transparent Canvas surface and selected border/shadow behavior. JSON and plain text use a compact monospace excerpt; referenced Markdown uses the shared read-only Markdown renderer. Loading, empty, truncated and diagnostic states are visually restrained and contained within the node. No nested card or new colored background layer is introduced.

The generic file icon remains for unsupported/binary files. This preserves the established behavior and avoids claiming readable content when the Host cannot safely classify it.

### 6. Preserve user data and support atomic rollback

The change adds no field to `FileCanvasNode`, changes no `.nkc` codec, performs no migration and writes no source file. Preview results are disposable projections rebuilt from the current authoritative locator. Existing Markdown snapshot nodes remain editable and unchanged.

Deployment updates the package contract, Node service, Desktop producer/consumer and Webview consumer in one change. Rollback removes the query and returns File nodes to the generic icon; no user-data rollback is required.

## Risks / Trade-offs

- **Large or deeply nested JSON can expand after formatting** -> Apply separate byte and presentation-text limits and expose truncation rather than mounting unbounded DOM.
- **Extension hints can disagree with actual content** -> Require strict UTF-8 and JSON parsing; fail locally instead of falling back to a different successful renderer.
- **Many visible File nodes can issue concurrent reads** -> Keep each request bounded, cancel or ignore stale work, and request only for eligible nodes; avoid a cache that could become a second authority.
- **Desktop IPC expansion can drift across producer and consumer** -> Use one package-owned strict contract, update all bridge surfaces atomically, and test canonical delegation plus malformed request rejection.
- **Markdown rendering may be denser than the node size** -> Clip/scroll within stable node dimensions and validate dense, selected, loading and error states at desktop and smaller viewports.

## Open Questions

None. Initial limits and supported text kinds are package-owned constants covered by tests and can be adjusted later without changing durable data or widening the Host capability.
