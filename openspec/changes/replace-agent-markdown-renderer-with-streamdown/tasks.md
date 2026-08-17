## 1. Shared Streamdown-facing Markdown extensions

- [x] 1.1 Add `@neko/markdown/streamdown` browser entry that exports narrow remark/rehype plugin
      factories for Neko mention/resource-reference syntax and the corresponding React projection
      components for resource references, mentions, and authorized image/audio/video elements. The main
      `@neko/markdown` entry stays host-neutral and does not import React, DOM, Streamdown, or Agent
      Webview.
- [x] 1.2 Add `@neko/markdown` tests proving the plugins recognize the same eligible text-extension
      syntax as `parseNormalizedMarkdown`, do not parse extensions inside code/inline code/links, and
      that the URL transform rejects raw paths/blob/cache/private handles while accepting only the
      documented safe URL classes.

## 2. Replace Agent Markdown renderer with Streamdown

- [x] 2.1 Rewrite `packages/agent/webview/src/components/ChatView/MessageContent/MarkdownRenderer.tsx`
      as a single `Streamdown` adapter using `mode="streaming"` for streaming and `mode="static"` for
      final text, composing default GFM/sanitize/harden with the Neko plugins/components. Remove the
      package-local normalized renderer, `MarkdownStreamingSession`, `MarkdownStreamingSnapshot`, and
      the session registry subscription path.
- [x] 2.2 Add a `MarkdownBlockErrorBoundary` and wrap each Markdown text block so presentation failures
      are block-local and never propagate to `projectionAttachmentClient`.
- [x] 2.3 Update `ContentBlockItem`, `MessageItem`, and `AssistantTurnActivity` to the new Markdown
      renderer props; keep `projectMarkdownResourceRendering` and the typed sibling presenters outside
      the Markdown renderer.

## 3. Retire old Agent Markdown session lifecycle

- [x] 3.1 Delete `agent-markdown-session-registry.ts`, `agent-markdown-session-context.tsx`, and their
      obsolete tests; remove `markdownSessions` from `TabRenderRuntime` and remove the Markdown commit
      calls from `projectionAttachmentClient` replica callbacks.
- [x] 3.2 Remove `getAgentMarkdownSessionRegistry`/`createAgentMarkdownSessionKey` usage from
      `useMessageHandler`, `ConversationRenderRuntimeLifecycle`, render-runtime, and related tests.
- [x] 3.3 Add architecture-boundary regression tests asserting no production Agent Webview import or
      registration of `MarkdownStreamingSession`, `AgentMarkdownSessionRegistry`, `stableEndOffset`, or
      the old session files.

## 4. Focused behavior tests

- [x] 4.1 Add MarkdownRenderer tests for long and continued lists across many appends, incomplete
      emphasis/link/fence/table/list/CJK, and streaming-to-final same renderer.
- [x] 4.2 Add MarkdownRenderer tests for resource image/audio/video projections, exact source
      preservation, and malicious HTML/URL hardening with custom plugins composed.
- [x] 4.3 Add block-local failure isolation tests proving a throwing Markdown block preserves sibling
      Timeline blocks/conversations and does not fatal projection attachment.

## 5. Package/dependency and documentation alignment

- [x] 5.1 Move the already-pinned `streamdown` 2.5.0 to `@neko/agent-webview` production dependencies
      while keeping `@neko/markdown/streamdown` dependency-neutral; do not add AI SDK UI or another
      lifecycle owner.
- [x] 5.2 Update README/ADR/research/status/OpenSpec statements that still call Streamdown dev-only or
      rejected or describe the old renderer as canonical. Remove obsolete renderer/session tests.

## 6. Verification

- [x] 6.1 Run focused package tests/typecheck for `@neko/markdown` and `@neko/agent-webview`; run
      OpenSpec strict validation; record exact changed files, commands, blockers, and remaining risks.
- [x] 6.2 Verify a cold Desktop Vite start loads the Agent Webview without flattening parse5 to an
      incompatible root `entities` package; remove stale Mermaid/Prism optimizer entries.

## Verification evidence (2026-08-17)

- `pnpm --dir packages/markdown run test`: 9 files, 74 tests passed.
- `pnpm --dir packages/markdown exec tsc --noEmit`: passed.
- `pnpm --dir packages/agent/webview run test`: 105 files, 786 tests passed.
- `pnpm --dir packages/agent/webview run build`: passed.
- `pnpm check:legacy-debt`: passed with zero blocking production matches.
- `pnpm check:unused`: passed; obsolete Agent `CodeBlock`, `MermaidBlock`, icons, and their direct
  Mermaid/Prism dependencies were removed.
- `openspec validate replace-agent-markdown-renderer-with-streamdown --strict`: passed.
- `git diff --check`: passed.
- Cold-cache `pnpm dev:desktop`: passed. Desktop Vite resolved parse5's `entities/decode` and
  `entities/escape` from package-owned `entities@6`, pre-optimized `streamdown` and its lazy `yaml`
  dependency before the Agent Webview loaded, and returned HTTP 200 for both `root.tsx` and
  `MarkdownRenderer.tsx`; no dynamic-import, dependency-prebundle, or post-load Streamdown/YAML
  optimizer reload occurred.
- Visible Electron validation: passed. After the cold-cache start and the single existing application
  dependency optimization reload, the Agent start surface remounted with its package-owned layout,
  theme, composer, and navigation styles. A regression test now requires `root.tsx` to load both
  `./index.css` and `streamdown/styles.css`.
- Production residual scan found no active `MarkdownStreamingSession`, `AgentMarkdownSessionRegistry`,
  `stableEndOffset`, `agent-markdown-session`, or `StreamdownSpike` path.
- Changed scope is the Agent Webview renderer/callers/runtime lifecycle/tests/i18n/root styles and
  dependencies, the `@neko/markdown/streamdown` browser extension/tests/package surface, removal of the
  old shared streaming implementation, the lockfile, and the Markdown ADR/research/active OpenSpec
  records listed by `git diff --name-status` at completion.
- Agent Evaluation disposition: excluded because this deterministic presentation replacement does not
  alter Prompt, Skill, Tool/capability routing, provider/model selection, AgentSession, queue, or task
  behavior; package renderer/path tests are authoritative for this scope.
- Remaining advisory risk: the visible Electron pass covered cold-start layout/theme plus an existing
  dense long-Markdown conversation with headings, tables, and lists. Streaming caret presentation and
  authorized audio/video projection were not manually exercised in this pass; focused renderer tests
  cover those contracts. No code, contract, security, or package gate is blocked.
