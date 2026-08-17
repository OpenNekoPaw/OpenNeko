## Context

Agent Webview currently renders `assistant_text` and `thinking` Markdown through a package-local
normalized path:

1. `ConversationProjectionAttachmentClient` installs/applies Timeline snapshots/patches.
2. `DefaultTabRenderRuntime` commits each patch into `AgentMarkdownSessionRegistry`, which owns one
   `MarkdownStreamingSession` per Timeline item.
3. `MarkdownRenderer` subscribes to that registry with `useSyncExternalStore`, reads a
   `MarkdownStreamingSnapshot`, and renders `MarkdownNode` tree recursively with package-local React
   components.
4. The same component infers structured composite fences, Mermaid, creative tables, resource tokens,
   semantic spans, and diagnostics directly from Markdown source/annotations.

The original Streamdown 2.5.0 no-go was recorded against that overloaded scope. The narrowed Agent text
surface now keeps structured and typed work as typed siblings outside Markdown. Streamdown 2.5.0 is
already pinned in the workspace lockfile and is the selected production renderer.

## Goals / Non-Goals

**Goals:**

- One production Markdown renderer for Agent streaming and final text: `Streamdown` from `streamdown`
  2.5.0.
- Delete `MarkdownStreamingSession` and remove `AgentMarkdownSessionRegistry`,
  `stableEndOffset`, stable node identity assertions, and the package-local parser/presenter path.
- `@neko/markdown` supplies only host-neutral semantic/profile/extension ownership and narrow
  Streamdown-facing remark/rehype plugins or React projection components.
- Explicitly compose Streamdown defaults (`defaultRemarkPlugins`, `defaultRehypePlugins`, sanitize,
  harden, safe URL transform) with custom plugins. No weakening of CSP/security.
- Preserve exact authoritative source and existing authorized Workspace resource projections.
- Renderer failure is block-local: one Markdown block failing does not fail sibling Timeline blocks,
  other conversations, or projection attachment protocol.
- Content-quality retry/reprocess remains Agent/user action; the renderer has no fallback or retry path.

**Non-Goals:**

- Do not add AI SDK UI, another Markdown lifecycle owner, or a second streaming lifecycle.
- Do not make `@neko/markdown` own Agent streaming sessions, stream scheduling, or Webview registry
  state.
- Do not keep a feature flag, fallback renderer, old/new registration, static-final alternate path, or
  silent recovery.
- Do not convert structured/typed siblings back into inferred Markdown blocks.

## Decisions

### 1. Agent Webview owns the Streamdown component and stream/final mode selection

`packages/agent/webview/src/components/ChatView/MessageContent/MarkdownRenderer.tsx` becomes a thin
Streamdown adapter:

- `isStreaming` maps to Streamdown `mode="streaming"`; final text maps to `mode="static"`.
- `content` is passed as Streamdown `children`; no source rewriting is performed.
- The component composes `defaultRemarkPlugins`, `defaultRehypePlugins`, custom Neko remark/rehype
  plugins from `@neko/markdown`, `urlTransform`, and custom `components` for links, images,
  resource references, mentions, audio/video projections, and diagnostics.
- The component has no `MarkdownStreamingSession`, no `useSyncExternalStore` session subscription, and
  no normalized node tree rendering.

The old `sessionKey`, `contentBlockId`, `siblingBlocks`, `conversationId`, and `plugins` renderer props
are removed from the Markdown component. Callers still compute `markdownResources` outside the renderer
for authorized resource projection; that projection is passed as `markdownResources`.

### 2. `@neko/markdown` adds a browser-only Streamdown extension entry

Add `packages/markdown/src/browser/streamdown-extensions.ts` and export it from package
`exports["./streamdown"]` (browser-only, React peer). It provides:

- `createNekoMarkdownRemarkPlugins()`: remark plugins that recognize the existing Neko text extension
  syntax (`[[resource]]`, image embed syntax, `@mention`) in text nodes and emit MDAST nodes compatible
  with Streamdown's unified pipeline. The plugin uses the same eligibility rules as the existing parser
  (no mention directly after `[\p{L}\p{N}_.-]`, same token trimming) and does not parse extensions
  inside code, inline code, link destinations, or HTML.
- `createNekoMarkdownRehypePlugins()`: rehype plugins that convert Neko MDAST nodes to HAST elements
  with stable data attributes (`data-neko-resource-reference`, `data-neko-mention`,
  `data-neko-image-reference`), preserving source text and placement hints.
- React projection components `NekoMarkdownResourceReference`, `NekoMarkdownMention`, and
  `NekoMarkdownResourceImage` that consume `MarkdownResourceRenderingProjection`-shaped props from
  Agent Webview and render the existing authorized Workspace resource projections. These components are
  intentionally small and do not own resource resolution or Workspace authorization; they only project
  already-authorized data.
- `createNekoMarkdownUrlTransform()`: a URL transform that accepts only `http`, `https`, `mailto`,
  same-page fragment, and already-authorized Workspace render URIs. It rejects raw file/blob/cache/
  private-handle URLs and leaves Streamdown's harden/sanitize defaults enabled.

The main `@neko/markdown` entry remains host-neutral and does not import React, Streamdown, DOM, or
Agent Webview modules.

### 3. Resource projections remain authorized before Markdown rendering

`projectMarkdownResourceRendering` remains in `packages/agent/webview/src/presenters/` and continues to
use `projectNekoMarkdownExtensions` plus Workspace/tool-call resource indexes. It returns
`MarkdownResourceRenderingProjection` with authorized render URIs. The new Streamdown components render
only those URIs and never resolve raw paths, blob URLs, cache keys, or private handles themselves.

Exact source is preserved: Markdown text is never normalized or serialized back; only the already
authorized display URI is swapped into `img`/`audio`/`video` elements.

### 4. Remove Agent production streaming session lifecycle

Delete `packages/agent/webview/src/markdown/agent-markdown-session-registry.ts`,
`packages/agent/webview/src/markdown/agent-markdown-session-context.tsx`, and their tests. Remove the
`markdownSessions` field and related scheduler from `tab-render-runtime.ts`. `DefaultTabRenderRuntime`
keeps only the projection replica publication path.

`ConversationProjectionAttachmentClient` replica callbacks no longer call a Markdown registry. The
`applyPatch`/`installSnapshot` path publishes only the conversation projection; Markdown blocks read
the projected `content` prop directly and render with Streamdown. Therefore a Markdown presentation
failure cannot be thrown into `acceptSnapshot`/`acceptPatch` and cannot become projection attachment
protocol fatal.

`ConversationRenderRuntimeLifecycle` no longer takes a Markdown registry; it owns only the render
coordinator lifecycle. `useMessageHandler` no longer creates/uses the registry.

### 5. Block-local failure isolation

Add a small `MarkdownBlockErrorBoundary` in Agent Webview. Each Markdown text block is wrapped so a
renderer throw renders a compact block-local diagnostic with the block's source still available for
copy, and the remaining Timeline blocks/conversations keep rendering. The boundary catches only
presentation errors; it does not recover by switching renderer or retrying. This is an error boundary,
not a fallback renderer or silent recovery.

### 6. Security composition

Streamdown defaults include `rehype-sanitize` and `rehype-harden`. Custom plugins are appended/merged
without removing defaults. The custom URL transform is stricter than Streamdown's default only in
accepting authorized Workspace render URIs; it does not allow raw file/blob/cache/private handles as
stable identities. Raw HTML remains inert under Streamdown's default sanitize/harden behavior.

Desktop Vite resolves `entities/decode` and `entities/escape` from the importing parse5 package. This
preserves parse5's package-owned `entities@6` dependency instead of flattening it to the unrelated
root-hoisted `entities@4`. The same exact rule is installed at Vite runtime resolution and its isolated
esbuild dependency-optimizer boundary. It applies only to those two imports from parse5; no global
alias, alternate parser, dependency version override, or runtime fallback is introduced.

Desktop Vite also pre-optimizes the production `streamdown` entry and its lazy `yaml` dependency before
the Electron renderer loads. This keeps dependency discovery from forcing a second full-page reload
after the Agent Webview mounts; it does not add a renderer or dependency fallback.

### 7. No renderer fallback/retry

Content-quality retry/reprocess remains Agent/user action. If Markdown presentation throws, the
block-local boundary displays a diagnostic. The renderer has no alternate renderer, no old registry,
and no automatic reprocess. Removing or repairing the block is done by the Agent/user producing new
content.

## Risks / Trade-offs

- [Streamdown owns block splitting and incomplete-suffix behavior] -> We rely on pinned Streamdown 2.5.0
  with `mode="streaming"` and its default `remend`/incomplete parsing, and test long/continued lists,
  incomplete emphasis/link/fence/table/list/CJK, and streaming-to-final same renderer.
- [Custom plugins can weaken sanitize/harden] -> Tests assert defaults remain active and hostile HTML/URL
  inputs do not produce executable/raw output; custom plugins only add known Neko extension nodes.
- [Resource projection regression] -> Tests cover authorized image/audio/video projections and exact
  source preservation, and assert raw paths/blob/cache/private handles are not rendered as stable
  identities.
- [Block-local failure] -> Error boundary test throws in one Markdown block and asserts siblings still
  render and no projection protocol fatal is raised.
- [Old path remains accidentally imported] -> Architecture-boundary test and import scan assert no
  `MarkdownStreamingSession`/`AgentMarkdownSessionRegistry` production usage remains in
  `@neko/agent-webview`.

## Migration Plan

1. Add `@neko/markdown/streamdown` extension entry with plugins/components and focused package tests.
2. Replace Agent `MarkdownRenderer` with Streamdown adapter and block-local error boundary.
3. Delete the shared streaming session implementation/tests plus the Agent registry/context and remove
   all callers; remove the `markdownSessions` runtime path.
4. Update callers (`ContentBlockItem`, `MessageItem`, `AssistantTurnActivity`) to the new renderer props.
5. Move pinned `streamdown` to Agent Webview production dependency. Keep
   `@neko/markdown/streamdown` as a narrow plugin/component contract without a second Streamdown
   lifecycle dependency.
6. Add focused tests listed in tasks and remove obsolete renderer/session tests.
7. Update contradictory docs/OpenSpec statements.
8. Run focused tests, typechecks, and OpenSpec validation.

Rollback is an atomic revert of this change; no persisted schema or user data migration exists.
