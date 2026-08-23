# Verification Record

Date: 2026-08-23

## Automated verification

| Check                                                                                                                                                                                                  | Result                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| `pnpm --filter @neko/markdown test`                                                                                                                                                                    | Pass — 9 files, 81 tests |
| `pnpm --filter @neko/ui exec vitest run src/markdown/markdown.test.tsx`                                                                                                                                | Pass — 15 tests          |
| `pnpm --filter @neko/text-editor-webview test`                                                                                                                                                         | Pass — 5 files, 49 tests |
| `pnpm --filter @neko/preview-webview exec vitest run src/root/index.test.tsx`                                                                                                                          | Pass — 24 tests          |
| `pnpm --filter @neko/canvas-webview exec vitest run src/components/selection/CanvasMarkdownEditorOverlay.test.tsx src/components/InfiniteCanvas.markdown-editor.test.tsx src/CanvasApp.layout.test.ts` | Pass — 3 files, 32 tests |
| Text Editor, Preview and Canvas package builds                                                                                                                                                         | Pass                     |
| ESLint for changed TypeScript/TSX                                                                                                                                                                      | Pass                     |
| `git diff --check`                                                                                                                                                                                     | Pass                     |
| `pnpm exec openspec validate optimize-markdown-document-presentation --strict`                                                                                                                         | Pass                     |
| `pnpm check:openspec`                                                                                                                                                                                  | Pass — 151 items         |
| `pnpm check:webview-boundaries`                                                                                                                                                                        | Pass                     |
| `pnpm check:package-roles`                                                                                                                                                                             | Pass                     |

Tests cover the shared read-only table hook, the Rich Surface table NodeView, GFM round trip, rejection of a second table NodeView owner, and the absence of inline style attributes.

## Visible Electron evidence

Runtime: visible real Electron Desktop using the configured local Workspace and the existing document `两周动画化视觉概念验证计划`.

1. Opened the seven-column document in Text Editor Rich. The narrow content slot displayed readable cells with a table-local horizontal scrollbar. Dragging the scrollbar revealed later columns while the surrounding document and Canvas width remained stable.
2. Opened the same file through Canvas `主面板预览`. The full preview retained heading, paragraph and list hierarchy; dragging the table-local scrollbar revealed `验收标准` and `风险与 blocked 项` without page-level horizontal drift.
3. Resource browser, document tabs, surrounding Canvas and close/reopen interaction remained usable.

## Unrelated repository gate failures

The following broader checks remain blocked by concurrent worktree changes outside this change and were not modified here:

- Full `@neko/ui` and `@neko/preview-webview` suites reference currently missing Agent UI source files.
- `@neko/ui check` reports existing type errors in `editor-workbench.test.tsx`.
- The composed package-boundary gate reports the concurrently added `@neko/agent-dsh-plugin` has no reachable active-product import.
- `check:no-internal-versioning` reports concurrent Agent/Desktop occurrences and stale allowances; none are in the files changed by this proposal.

These failures do not affect the focused Markdown presentation tests, package builds, or visible Electron acceptance above.
