## Context

`@neko/markdown` already tokenizes `@label`, `[[target]]`, `![[target]]` and CommonMark images, and
projects source ranges through caller-provided resolvers. The Text Editor currently uses those
projections only for navigation and round-trip safety: CodeMirror has no Markdown completion
provider, Milkdown disables mutation for source-preserving extensions, and Workspace images have no
document-scoped authorized render projection. Agent mention and media presentation cannot be reused
as an editor authority because they belong to a Conversation input/Timeline lifecycle.

### Five-layer analysis

- **Responsibility:** Markdown owns syntax and insertion intent; Text Editor Domain owns exact
  document-scoped requests; Content/Assets/Media own resource identity, bytes and classification;
  Text Editor Webview owns completion and presentation; Desktop owns Electron authorization.
- **Dependencies:** Markdown stays host-neutral. Domain contracts depend on no DOM or Electron type.
  Webview consumes only typed candidates/descriptors and opaque URLs. Desktop adapters inject the
  existing Workspace and resource gateway ports.
- **Interfaces:** one request carries exact Workspace, document and request identity plus trigger and
  query; one bounded result returns portable insertion text and stable refs. Media preparation returns
  a typed descriptor and releasable opaque URL scoped to the exact visible document surface.
- **Extension:** future reference kinds enter through owning catalog contributors and future media
  kinds through `@neko/media` classification. Registries use exact kinds and reject duplicate or
  unsupported entries; there is no wildcard renderer or try-next resolver.
- **Testing:** pure trigger/parser tests prove eligible source regions and insertion ranges; producer
  and consumer tests prove one contract; Webview tests prove IME and stale-result behavior; Desktop
  tests prove sender/document authorization and release; visible Electron tests prove media and input.

## Goals / Non-Goals

**Goals:**

- Offer lightweight, context-aware Markdown Source assistance for GFM and Workspace extensions.
- Resolve mentions and resources against one exact Workspace-qualified catalog.
- Present images, audio and video without persisting host paths or runtime URLs.
- Keep malformed input editable and contain reference/media failures to the owning token.
- Preserve one Text Document edit path and one Desktop resource-authorization path.

**Non-Goals:**

- A Markdown LSP, generic IDE completion, spell checking, MDX or arbitrary HTML execution.
- Social mentions, notification semantics or implicit Agent context attachment.
- Uploading, copying, renaming or migrating referenced files as a side effect of authoring.
- Autoplay, background playback, transcoding policy or a second general media preview runtime.
- Making Milkdown, CodeMirror DOM or a render URI authoritative document data.

## Decisions

### 1. Markdown owns source-context authoring assistance

`@neko/markdown` exports a pure authoring projector that receives source, caret offset and bounded
caller-provided candidates. It identifies whether the caret is in eligible plain text, a link target,
inline code, fenced code or raw HTML and returns an exact replacement range plus portable completion
items. It owns GFM snippets and the syntax for `@`, `[[` and `![[`; it does not search a Workspace.

CodeMirror adapts this projection to its completion API and suppresses semantic completion while IME
composition is active. Accepted completion produces one ordinary Text Document edit. Results from a
superseded query, document, Workspace or unmounted Root are discarded by exact request identity.

**Alternative:** implement regex completion directly in the Webview. Rejected because parser context,
source ranges and extension syntax would diverge from the canonical Markdown contract.

### 2. One Text Editor reference catalog contract crosses the Host boundary

The Text Editor Domain public entry defines request/result contracts for Markdown reference search.
The request is qualified by the exact open Text Document identity and query kind. The application
composition binds an injected Workspace reference catalog assembled from owning file/entity/asset
contributors. Each item contains display text, portable insertion text, reference kind and stable
owner ref; raw filesystem paths are forbidden.

Duplicate labels remain separate candidates. Parsing an existing source token uses the same catalog
and returns `resolved`, `ambiguous`, `unresolved` or `unauthorized`; it never selects by display order,
active Workspace, recent file or a second Agent mention service.

**Alternative:** reuse the Agent composer catalog. Rejected because Agent Draft/Conversation binding,
receipts and context attachment are different business semantics and lifecycles.

### 3. Source stores portable tokens; presentation consumes authorized descriptors

CommonMark `![alt](relative/path.png)` remains the portable standard image form. `[[target]]` is an
OpenNeko link reference and `![[target]]` is an embedded Workspace resource. The stored target is a
Workspace-relative locator or declared stable resource token. Absolute paths, `file:` URLs, cache
paths and `openneko`/loopback render URLs are rejected as persisted targets.

For a resolved embed, Text Editor requests a media projection for the exact document surface. The
owning Content/Assets/Media services resolve identity and classify image/audio/video; Desktop Main
authorizes bytes and returns the existing opaque short-lived URL/descriptor. The Webview chooses one
typed presenter from the declared media kind. Unsupported kinds remain a source-backed link with a
local diagnostic.

**Alternative:** render raw HTML `<img>`, `<audio>` or `<video>`. Rejected because it bypasses the
canonical syntax, CSP and resource authorization policies.

### 4. Media leases belong to the visible document surface

The Webview requests media only for visible Rich/Split nodes. The Host binds each lease to exact
Window sender, Workspace, document and surface identity. Unmount, document replacement or token
removal releases the lease and makes its URL unusable. Late preparation cannot attach to another
document. Audio/video use native controls, do not autoplay, and preserve layout with bounded poster
or aspect-ratio constraints. Range behavior reuses the canonical resource transport.

A failed or unauthorized resource renders one inline diagnostic with alt text/target and a Source
reveal action. It cannot fail the document Root, blank sibling content or retry through a raw path.

### 5. Rich editing remains source-preserving

Source completion ships independently because it is semantically safe. Rich/Split presentation adds
explicit Milkdown nodes only after round-trip fixtures prove that untouched tokens serialize without
loss. Until that proof passes, Rich stays read-only for documents containing those extensions while
showing the resolved media projection; Source remains the mutation route. No HTML conversion or
parallel Markdown renderer is introduced.

### 6. Desktop remains a thin adapter

Production logic retained in `apps/neko-desktop` is limited to sender-bound IPC decoding, exact
Window/Workspace/document authorization, concrete filesystem/resource-gateway calls and lease
release. Search ranking, token syntax, media-kind policy and failure taxonomy remain in owning
packages. The canonical public paths are `@neko/markdown` authoring projection,
`@neko/text-editor-domain` reference/media ports, and `@neko/text-editor-webview` presentation.

The replaced behavior is manual unvalidated token entry plus non-fetching media placeholders. No
user bytes are migrated or rewritten on open; rollback removes the optional presentation and input
ports while leaving all Markdown source intact.

## Risks / Trade-offs

- **[Labels and paths can become stale]** -> Preserve original source, show unresolved diagnostics and
  require explicit user selection; never silently retarget.
- **[Large Workspaces can produce expensive searches]** -> Use bounded, cancellable queries and
  contributor-side indexing; do not transfer complete catalogs to the Renderer.
- **[Rich schemas can normalize extension syntax]** -> Keep Rich mutation disabled until exact
  round-trip and poison tests pass.
- **[Media leases can outlive their surface]** -> Bind and release by exact surface identity and poison
  late completion/reopen cases.
- **[Audio/video can consume memory and network range resources]** -> Prepare only visible embeds,
  disable autoplay and release on unmount.
- **[Current Desktop/Text Editor files contain adjacent in-flight work]** -> Land package contracts and
  pure projections first, then wire adapters in isolated commits after reviewing overlapping diffs.

## Migration Plan

1. Add package-owned authoring projection and deterministic trigger/range tests.
2. Add Text Editor reference/media contracts and producer/consumer poison tests.
3. Wire Source completion, then exact Desktop catalog delegation.
4. Add image projection and release; validate before enabling audio/video presenters.
5. Add source-preserving Milkdown nodes or retain read-only Rich behavior when parity fails.
6. Run focused package, boundary, Electron and visible UI validation before marking the feature done.

Rollback removes Webview/Host registration and revokes active leases. Markdown source remains valid
and editable because no runtime descriptor is persisted.

## Open Questions

- Whether entity mentions need a future explicit immutable display syntax beyond current `@label`
  remains a separate portability decision; this change does not hide stable metadata in file bytes.
- Video poster generation and media transcoding are excluded until an owning media requirement exists.
