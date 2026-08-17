## Why

Agent text streaming and final text currently render through `@neko/markdown`
`MarkdownStreamingSession`, `AgentMarkdownSessionRegistry`, the package-local normalized parser, and a
package-local React presenter. That path owns Agent streaming lifecycle, stable-end-offset/node identity
assertions, and also infers structured content, creative tables, Mermaid and resource projections inside
Markdown. The original Streamdown rejection was tied to that overloaded Markdown presentation scope.
Since then the Agent turn surface has been narrowed: tools, approvals, typed artifacts, creative tables
when typed, and domain results are typed siblings rendered outside Markdown. Streamdown 2.5.0 is already
pinned in the workspace and has passed the focused GFM/CJK/incomplete-suffix/sanitize/harden gate. This
change performs the user-approved atomic replacement: Streamdown becomes the only production Markdown
renderer for both streaming and final Agent text.

## What Changes

- Replace the Agent production Markdown renderer with Streamdown 2.5.0 for both `mode="streaming"` and
  `mode="static"` final text. There is no feature flag, fallback renderer, old/new registration,
  static-final alternate path, or silent recovery.
- Delete the unused `@neko/markdown` `MarkdownStreamingSession`,
  `AgentMarkdownSessionRegistry`, `stableEndOffset`/node identity assertions, and the package-local
  Agent Markdown parser/presenter path. `@neko/markdown` keeps the shared host-neutral CommonMark/GFM
  semantic/profile/extension ownership and supplies narrow remark/rehype plugins or React projection
  components for Neko resource references, authorized images/audio/video, semantic spans, and
  diagnostics; it does not own Agent streaming lifecycle.
- Keep typed artifacts, tools, approvals, creative tables when typed, and domain results as typed
  siblings. The Markdown renderer no longer infers structured composite fences, Mermaid blocks, or
  creative tables from Markdown text.
- Preserve exact source bytes and the existing authorized Workspace resource projections. Renderer
  failures are block-local and preserve sibling Timeline blocks and conversations; a Markdown
  presentation failure is never converted into projection attachment protocol fatal.
- Explicitly compose Streamdown default GFM, sanitize and harden behavior when adding custom plugins.
  CSP/security is not weakened; raw paths/blob/cache/private handles are not accepted as stable resource
  identities.
- Update contradictory README/ADR/research/status/OpenSpec statements that still call Streamdown
  dev-only/rejected or describe the old renderer as canonical.
- Remove obsolete tests and add focused tests for the new single renderer path.

## Capabilities

### New Capabilities

- `agent-markdown-streamdown-renderer`: Streamdown 2.5.0 is the only Agent Markdown renderer for
  streaming and final text; it composes default GFM/sanitize/harden behavior, consumes narrow
  `@neko/markdown` extension plugins/projection components, and fails block-locally.

### Modified Capabilities

- `gfm-authoring-and-agent-rendering-surfaces`: the Agent text surface now has one production renderer,
  Streamdown 2.5.0, instead of the rejected/dev-only disposition recorded earlier.

## Impact

- Owning responsibility: `packages/agent/webview` owns the Agent Markdown presentation lifecycle and is
  the only production consumer of Streamdown for Agent text. `packages/markdown` owns host-neutral
  CommonMark/GFM profile, semantic extension projection, and narrow Streamdown-facing plugins/components.
- Affected package roles:
  - `@neko/agent-webview` (`packages/agent/webview`): presentation role; replaces its renderer and
    deletes the session registry/context parser presenter.
  - `@neko/markdown` (`packages/markdown`): shared host-neutral semantic role; adds narrow
    Streamdown-facing extension plugins/projection components and keeps streaming lifecycle out.
  - `@neko/ui` and `apps/neko-desktop`: no renderer ownership change; Desktop remains a thin composition
    root.
- Runtime boundary: Agent Webview renderer runtime only. Electron Main/preload and Desktop trust
  boundaries are not changed. Workspace resource projections remain authorized before they reach
  Markdown image/audio/video components.
- Replaced path: `MarkdownRenderer` using `MarkdownStreamingSession` +
  `AgentMarkdownSessionRegistry` + normalized node renderer is replaced by one Streamdown component
  with narrow custom plugins/components. The old registry/context and its tests are deleted.
- User-data impact: no persisted user data or Workspace files are migrated. Authoritative Markdown
  source bytes are rendered as-is; no renderer writes back to files.
