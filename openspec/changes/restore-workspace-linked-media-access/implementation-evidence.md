## Current status

The mount-management chain is implemented and content identity is unified on one workspace-file path.
Durable project facts keep `workspace-file:neko/assets/<libraryName>/<relativePath>`, the same identity as
ordinary workspace files. The project-local target-free binding selects one user-global connection;
`neko/assets/<libraryName>` is a rebuildable direct link; and physical reads pass through one binding-aware
workspace path authorizer. There is no `MediaLibraryContentLocator` and no media-library dispatch, handler,
serializer or path normalizer in the content boundary.

Tasks 1.1 through 6.2 are complete. Task 6.3 remains open because visible validation has now covered
Resource Browser nested browsing, thumbnails, Preview and an Agent managed-link read, but has not yet
repeated both add flows or project reopen after deleting `.neko`.

## Preserved failure evidence

- Resource Browser rendered a child whose `content:*` parent was absent, causing the containing right dock
  Surface to fail.
- Agent received a managed-link Workspace locator but rejected its authorized final path as outside the
  sender-bound Workspace.
- The Media Library add menu lost the separate global-library selection path and exposed only native
  directory selection, despite the global catalog remaining a required authority.
- The rejected refactor had rewritten domain facts to a second `MediaLibraryContentLocator` identity,
  producing translation drift, dual read paths and durable-locator rejection regressions across Canvas,
  Cut, Entity, Search, packaging and Agent.

## Required future evidence

- Contract and integration tests proving the exact owner chain:
  `workspace-file:neko/assets/<libraryName>/<relativePath>` → project binding → global connection → managed
  Workspace link → contained bytes.
- Negative tests proving no direct target read, same-name fallback, unmanaged link, nested escape, active
  Workspace fallback, media-library locator branch or malformed sibling propagation.
- Visible Electron evidence for both add flows and project reopen/reinitialization remains outstanding.
- Key-free Agent Evaluation plus real provider/visible UI evidence when authorization and cost are available.

## Implemented path evidence

- `workspace-file:neko/assets/<libraryName>/<relativePath>` → project binding → global connection → exact
  managed Workspace link → contained descendant is covered by the unified Host content reader, initialization,
  availability and Desktop Agent effect tests.
- `MediaLibraryContentLocator`, media-library content reference serialization/parsing and
  `normalizeMediaLibraryContentPath` are removed. `ContentLocator` has no media-library kind and
  `DocumentEntryContentLocator.source` is a `WorkspaceFileContentLocator`.
- Missing `.neko` is reconstructed only from current project references, one exact available global
  connection and an exact existing link; zero/multiple matches and regular-directory collisions remain
  visible conflicts.
- Resource Browser exposes `项目文件 | 外部媒体 | 素材`, with separate `关联全局媒体库` and
  `将目录添加到全局媒体库` operations. New registration is rolled back if project association fails;
  project removal never removes global registration or physical bytes.
- Resource/search/portable/reference producers emit normalized
  `neko/assets/<libraryName>/<relativePath>` workspace-file paths. Media search is flat while child
  traversal preserves parent closure. Malformed roots and sibling availability failures stay local.
- Project sync and normal packaging exclude `.neko`, `neko/assets` link entries and external bytes;
  explicit portable snapshots retain workspace-relative references and staged rewriting.
- The binding-backed workspace path authorizer (`authorizeProjectWorkspaceContentPath`) is the only
  mount-aware boundary: a `neko/assets/<libraryName>` path is validated against its exact binding, global
  connection and managed link before the descendant is authorized. Ordinary workspace files stay on the
  ordinary contained-path guard. Workspace path resolution preserves its exact diagnostic code so
  consumers can distinguish missing files or broken links from unmanaged links, nested escapes and
  authorization failures.
- Resource Browser preview, reveal, quick-preview and thumbnail operations resolve mounted files through
  the same binding-backed workspace path resolver as Content reads; an unbound row rejects only its own
  request while ordinary Project File thumbnails remain available.

## Agent Evaluation disposition

- Decision: `update` existing suite `agent-runtime.media-library-content`.
- Canonical case: managed-link Workspace document/image references succeed without exposing the global
  target or project-local binding.
- Boundary case: a `workspace-file` locator outside the exact sender-bound Workspace, an unmanaged link or
  a nested escape is rejected without a Workspace/raw-path fallback.
- The fixture registers the external directory in the real user-global catalog and intentionally omits
  the `.neko` binding so the canonical runtime rebuild path is exercised.

## Verification completed

- `pnpm --recursive --if-present --sort run typecheck` — 0 errors.
- `pnpm --filter @neko/content test` — 125 tests passed.
- `pnpm --filter @neko/assets-domain test` — 146 tests passed.
- `pnpm --filter @neko/assets-node test` — 95 tests passed.
- `pnpm --filter @neko/canvas-domain test` — 285 tests passed.
- `pnpm --filter @neko/canvas-node test` — 22 tests passed.
- `pnpm --filter @neko/canvas-webview test` — 407 tests passed.
- `pnpm --filter @neko/search-domain test` — 89 tests passed.
- `pnpm --filter @neko/text-editor-node test` — 10 tests passed.
- `pnpm --filter @neko/entity-domain test` — 58 tests passed.
- `pnpm --filter @neko/entity-node test` — 30 tests passed.
- `pnpm --filter @neko/cut-domain test` — 61 tests passed.
- `pnpm --filter @neko/chara test` — 241 tests passed.
- `pnpm --filter @neko/generation test` — 163 tests passed.
- `pnpm --filter @neko/agent-runtime test` — 1004 tests passed.
- `pnpm --filter @neko/agent-webview test` — 804 tests passed.
- `pnpm --filter @neko/project test` — 26 tests passed.
- `pnpm --dir apps/neko-desktop test` — 108 files / 722 tests passed.
- `pnpm exec openspec validate restore-workspace-linked-media-access --strict`
- `git diff --check`

## Repository-wide residuals

- The no-bail recursive test run reached all test-bearing workspaces. Media Library-related failures found
  in Canvas, Text Editor and Desktop were corrected and their owning suites now pass.
- `@neko/agent-webview` still has one unrelated pre-existing assertion expecting
  `data-preview-presentation="quick"`; the current unchanged Preview implementation renders
  `data-preview-ui="lightweight"`. This change does not touch that renderer or test.
- Full repository lint/unused gates remain blocked by unrelated World and current worktree changes already
  recorded outside this OpenSpec; scoped lint for this change passes.

## Visible Desktop evidence

UI validation inventory for the thumbnail correction:

- authorized External Media image/audio/video rows request thumbnails through the exact project binding;
- preview, quick preview and reveal use the same resolver and never read a global target directly;
- an unavailable or unbound External Media row remains local and does not replace the Resource Browser;
- Project File thumbnail resolution remains available after an External Media failure;
- library roots remain non-previewable and do not request a file path.

The authoritative runtime is the visible Electron Desktop because the behavior crosses Main IPC, Host path
authorization and native thumbnail generation. The supplied failure image was reviewed and shows the
pre-fix whole-panel unavailable state. A post-fix visible Desktop run against the active development bundle
verified the following path:

- `外部媒体 → Assets → Media` expanded to eight audio/video files without the former
  `Resource Browser media library management requires a library root` failure;
- video thumbnails rendered in the nested directory and `test.mp4` opened in Preview with the expected
  five-second duration and playback controls;
- the Resource Browser and surrounding Project File/Agent/Canvas surfaces remained mounted;
- the visible Agent accepted `neko/assets/Assets/...` attachments and executed `ReadDocument`/`ReadImage`
  without the former sender-bound Workspace-grant rejection. The provider turn was still running when the
  focused Resource Browser verification completed, so this is read-path evidence rather than final-answer
  quality evidence.

Task 6.3 remains open only for the visible global-library selection, new-directory registration and project
reopen after `.neko` deletion scenarios.

- Earlier development scenario: blocked before CDP startup because PID 16341 owned this checkout's Vite
  development bundle. The later visible Computer Use run attached to the active development app directly.
- Packaged scenario: package creation succeeded, but the isolated packaged process did not expose its CDP
  target before timeout and produced no scenario checkpoint or screenshot.
- Reports:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-14T10-08-16.764Z-desktop-agent-linked-media-mention-development/report.json`
  and
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-14T10-13-51.081Z-desktop-agent-linked-media-mention-packaged/report.json`.
