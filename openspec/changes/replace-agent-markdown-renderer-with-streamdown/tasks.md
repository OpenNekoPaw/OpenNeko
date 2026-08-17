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

## 7. Remove residual replaced paths

- [x] 7.1 Delete Mermaid error feedback and SVG-download Webview messages, runtime routes/effects,
      message helpers, base-prompt Mermaid authoring guidance, and their obsolete tests. Keep Mermaid
      fences only as standard code blocks in the shared GFM profile.
- [x] 7.2 Delete NEKO/JSON fenced composite extraction from Agent contracts, runtime turn collection,
      Webview presentation, base prompts, exports, and tests. Keep typed composite artifact validation,
      Tool JSON Schema validation, sanitize/harden, authorized URI projection, and block-local error
      isolation.
- [x] 7.3 Add path-level regression coverage proving Mermaid feedback/SVG protocol and Markdown fenced
      artifact inference are absent while typed artifact and Tool schema validation remain canonical.
- [x] 7.4 Update `agent-runtime.prompt-composition` with a named-Markdown regression case and record the
      real-provider authorization requirement; leave the target hash to the concurrent prompt/Skill
      composition change that owns the full composition snapshot.

## 8. Residual cleanup verification

- [x] 8.1 Run focused contracts/runtime/webview/markdown tests and typechecks, strict OpenSpec
      validation, legacy/unused scans, and `git diff --check`; record the results and residual risks.

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
- Residual Mermaid/JSON scan: production code has no `mermaidError`, `downloadSvg`,
  `MarkdownDerivedCompositeSource`, `compositeSource`, or fenced-composite extractor references;
  removed message names remain only in decoder rejection tests.
- Residual cleanup focused tests: Agent Contracts 4 files / 60 tests, Agent Runtime 6 files / 85 tests,
  Agent Webview 105 files / 784 tests, and Markdown 9 files / 74 tests passed. Focused prompt,
  artifact-collector, Pi conversation and Markdown presenter runs also passed.
- Agent Webview TypeScript build passed. Agent Contracts and Runtime typechecks remain blocked by the
  concurrent `retire-provider-expression-dsl` working-tree change: stale tests/fixtures still import
  removed `ProviderCard`, `ProviderInputModalities`, `validateProviderExpressionProfileDescriptor`,
  and `adaptationHash` contracts. No reported type error is in the Mermaid/JSON cleanup path.
- `agent-runtime.prompt-composition / named-markdown-without-fenced-transport` strict dry-run passed.
  Full `pnpm test:agent:eval` validates the new 81-case count but remains blocked by a concurrent edit
  to builtin `image/SKILL.md` whose suite fingerprint has not yet been refreshed.
- Desktop focused Main tests passed 37/40; three existing `desktop-agent-controller-composition` cases
  remain blocked by the concurrent facts lifecycle failure `Desktop Agent facts do not own turn`.
- UI validation is advisory-blocked for a new Mermaid/JSON-specific screenshot: functional Webview,
  Streamdown, presenter, hostile-content and sibling-failure coverage passed, while the prior visible
  Electron validation already covered the shared Streamdown surface. No new control or layout was added.
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
- Agent Evaluation disposition: the renderer replacement remains deterministically covered, while the
  later base-prompt cleanup is an `update` to `agent-runtime.prompt-composition`; the focused real case
  requires explicit provider/model identity and cost authorization.
- Remaining advisory risk: the visible Electron pass covered cold-start layout/theme plus an existing
  dense long-Markdown conversation with headings, tables, and lists. Streaming caret presentation and
  authorized audio/video projection were not manually exercised in this pass; focused renderer tests
  cover those contracts. No Mermaid/JSON cleanup regression was found; broader working-tree gate
  blockers are recorded above and belong to concurrent changes.
