# Agent Evaluation

Date: 2026-08-08

## Evaluation Scope

- Change/feature: Markdown file editing adds Milkdown Rich mode while native Agent file authoring
  remains unchanged. Streamdown was evaluated and rejected, so Agent production presentation does not
  change.
- Decision and owning suite: `excluded` for GFM parse, streaming presentation, round-trip and security
  correctness because these are deterministic renderer/parser behaviors. `reuse` the native
  content-file behavior owned by `add-ai-screenplay-authoring` for real Agent `.md` publication and
  editor external-change behavior.
- Why real Evaluation is or is not required: a model/provider cannot establish whether a DOM used one
  renderer, retained identity, sanitized HTML or round-tripped GFM. Deterministic fixtures and visible
  Electron evidence are authoritative for those facts. Real Evaluation remains required only for the
  separate user-visible Agent Tool selection and durable file artifact path.
- Canonical path and forbidden fallback: Timeline text block -> current package-local normalized
  renderer from partial to final; Agent file Tool -> Workspace `.md` -> file-change projection.
  Forbidden paths are a production Streamdown registration, static-only final renderer,
  Agent-to-Milkdown transaction, renderer-authored file, raw HTML, alternate parser/renderer and
  direct Evaluation runtime substitution.

## Cases

- Excluded deterministic cases: official GFM/profile corpus; incomplete emphasis/link/fence/table/list;
  stable content-block and DOM identity; raw HTML/URL/CSP; resource/Mermaid/semantic extension;
  Milkdown round-trip; Rich/Source/Split synchronization; typed sibling isolation.
- Reused real case: native content file authoring creates/updates a durable Markdown/Fountain artifact
  through the core Workspace file path, with no Text Document session or renderer mutation path.
- Evidence and coverage: exact renderer registration, poisoned retired path, semantic fixture output,
  DOM identity, security result, session edit sequence, durable Workspace-relative artifact identity,
  freshness and external-change diagnostic.
- Missing observability: no new Agent runtime fact is required for rendering. The reused native-file
  suite still needs the complete-session facts recorded by `add-ai-screenplay-authoring/evaluation.md`.

## Verification

- Key-free validation: passed on 2026-08-09 with 44 files / 294 tests and all 24 indexed suites / 63
  cases; this remains authoring-readiness evidence only.
- Deterministic/UI validation: focused Webview tests and the authoritative visible Electron Text Editor
  scenario pass. The scenario exposed and verified fixes for StrictMode Rich initialization, Vite
  first-import dependency reload and stale toolbar-index automation.
- Real cases and reports: reuse the provider-backed and visible Desktop cases from
  `add-ai-screenplay-authoring`; do not create a renderer-quality Judge or a second Agent suite.
- Deterministic results: `@neko/markdown` passes 45 tests, Text Editor passes 26 tests including
  StrictMode/CJK/CSP/outline/reference/long-document coverage, and Agent Webview passes 709 tests.
  Streamdown passes completed GFM/CJK/sanitization/stable-block checks but fails incomplete emphasis
  and lacks resource/semantic/creative/structured parity, so no production replacement occurred.
- Visible Desktop result: `desktop-text-editor` passed through Resource Browser open, Markdown
  Rich-by-default/Source/Split, source-backed outline, canonical save, JSON diagnostic/format,
  declared HTML and Fountain highlighting, Fountain outline/preview, dirty conflict and 960 x 640
  compact layout. Source, Rich and Split remained icon-only in the active Workbench tab row; Split
  kept editable CodeMirror on the left and read-only Milkdown on the right at both wide and compact
  widths. Incomplete Markdown remained visible in both panes without a document-level failure.
  Contextual commands did not overlap Window controls. Dark-theme rendering and Chromium/Electron
  IME composition also passed with the saved UTF-8 bytes verified. The reviewed report is
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T04-35-26.700Z-desktop-text-editor-development/report.json`.
- Blocked or unexecuted cases: native-file key-free validation passes, but provider-backed and visible
  Desktop Agent runs still require explicit provider/model/cost authorization. Visible Agent
  partial-to-final continuity was not executed in the passing UI scenario, and the native macOS IME
  candidate window was not manually exercised.

## Interpretation

- A Streamdown README claim, static screenshot or final answer cannot prove incomplete-stream behavior,
  unique renderer ownership, security or no-fallback behavior.
- A passing native-file Agent case proves Tool/path selection and durable artifact publication, not
  Milkdown or Streamdown rendering quality.

## Verification Commands

- `pnpm --filter @neko/markdown test`
- `pnpm --filter @neko/text-editor-webview test`
- `pnpm --filter @neko/text-editor-webview build`
- `pnpm --filter @neko/agent-webview test`
- `pnpm --filter @neko/agent-webview build`
- `pnpm --filter @neko/app-desktop test`
- `pnpm --filter @neko/app-desktop typecheck`
- `pnpm --dir apps/neko-desktop exec vite build --config vite.renderer.config.ts`
- `pnpm test:agent:eval`
- `pnpm test:local:ui --scenario desktop-text-editor`
- `pnpm check:quality`
- `pnpm check:unused` returns the existing repository baseline of one unused Desktop Shell export and
  74 configuration hints; this change adds no unused entry.

## Residual Risk

- Production Agent code intentionally retains the package-local renderer. Streamdown is a dev-only
  rejected candidate and must not be described as delivered Agent UI.
- Milkdown deterministic and visible Desktop evidence passes in light and dark themes, including
  compact-window, Chromium/Electron IME composition and external-change interaction. The native macOS
  IME candidate window and real provider-backed Agent file-publication path remain unverified.
