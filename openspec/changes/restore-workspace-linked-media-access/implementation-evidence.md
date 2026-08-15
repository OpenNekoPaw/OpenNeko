## Current status

The corrected owner chain is implemented. Durable project facts keep `MediaLibraryContentLocator`; the
project-local target-free binding selects one user-global connection; `neko/assets/<libraryName>` is a
rebuildable direct link; and physical reads pass through one binding-aware Content service. Agent inputs
remain sender-bound `workspace-file` locators projected through that link and cannot submit direct
Media Library locators.

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
- The rejected refactor had deleted binding/recovery/content-handler modules and rewritten domain facts
  to Workspace paths, producing broad conflicts across Canvas, Cut, Entity, Search, packaging and Agent.

## Required future evidence

- Contract and integration tests proving the exact owner chain:
  Media Library locator → project binding → global connection → managed Workspace link → contained bytes.
- Negative tests proving no direct target read, same-name fallback, unmanaged link, nested escape, active
  Workspace fallback or malformed sibling propagation.
- Visible Electron evidence for both add flows and project reopen/reinitialization remains outstanding.
- Key-free Agent Evaluation plus real provider/visible UI evidence when authorization and cost are available.

## Implemented path evidence

- `MediaLibraryContentLocator → project binding → global connection → exact managed Workspace link →
contained descendant` is covered by Content handler, initialization, availability and Desktop Agent
  effect tests.
- Missing `.neko` is reconstructed only from current project references, one exact available global
  connection and an exact existing link; zero/multiple matches and regular-directory collisions remain
  visible conflicts.
- Resource Browser exposes `项目文件 | 外部媒体 | 素材`, with separate `关联全局媒体库` and
  `将目录添加到全局媒体库` operations. New registration is rolled back if project association fails;
  project removal never removes global registration or physical bytes.
- Media search is flat while child traversal preserves parent closure. Malformed roots and sibling
  availability failures stay local.
- Project sync and normal packaging exclude `.neko`, `neko/assets` link entries and external bytes;
  explicit portable snapshots retain authoritative Media Library references and staged rewriting.
- Shared Content accepts `workspace-file:neko/assets/...` only as a sender-bound runtime projection and
  exposes one canonical durable-Project predicate. Canvas, Entity, Search and Text Editor persistence
  boundaries reject that projection and require `MediaLibraryContentLocator` for new project facts;
  Canvas retains pre-existing invalid nodes with a local diagnostic.
- Workspace path resolution now preserves its exact diagnostic code, allowing consumers to distinguish
  missing files or broken links from unmanaged links, nested escapes and authorization failures.
- Resource Browser preview, reveal, quick-preview and thumbnail operations now resolve
  `MediaLibraryContentLocator` through the same project binding → global connection → managed-link path
  resolver as Content reads. They no longer reject valid External Media rows as lacking a Host path, and
  an unbound row rejects only its own request while ordinary Project File thumbnails remain available.

## Agent Evaluation disposition

- Decision: `update` existing suite `agent-runtime.media-library-content`.
- Canonical case: managed-link Workspace document/image references succeed without exposing the global
  target or project-local binding.
- Boundary case: a direct `media-library` Agent Tool locator is rejected without a Workspace/raw-path
  fallback.
- The fixture registers the external directory in the real user-global catalog and intentionally omits
  the `.neko` binding so the canonical runtime rebuild path is exercised.

## Verification completed

- `pnpm typecheck`
- `pnpm --filter @neko/content test` — 125 tests passed.
- `pnpm --filter @neko/assets-domain test` — 146 tests passed.
- `pnpm --filter @neko/assets-node test` — 95 tests passed.
- `pnpm --filter @neko/assets-webview test` — 8 files / 71 tests passed, including local containment of
  rejected nested-directory, quick-preview and thumbnail requests.
- Focused Desktop Resource Browser and Agent tests — 33 passing tests in the earlier combined run; the
  Resource Browser source file now has 19 passing tests, including atomic rollback, authorized external
  media thumbnail resolution, nested Media Library traversal and fail-local behavior for an unbound row.
- `pnpm --filter @neko/app-desktop test` — 108 files / 714 tests passed after the nested traversal fix.
- `pnpm --filter @neko/project-node test` — 7 tests passed.
- `pnpm --filter @neko/canvas-domain test` — 285 tests passed.
- `pnpm --filter @neko/canvas-webview test` — 409 tests passed.
- `pnpm --filter @neko/search-domain test` — 89 tests passed.
- `pnpm --filter @neko/text-editor-node test` — 10 tests passed.
- `pnpm --filter @neko/entity-domain test` — 58 tests passed.
- Focused Desktop Canvas runtime and architecture tests — 50 tests passed.
- `pnpm test:agent:eval` — 45 files / 310 tests passed; strict dry-run discovered 27 suites / 80 cases.
- `pnpm check:content-access-boundaries`
- `pnpm check:application-boundaries`
- `pnpm check:package-boundaries`
- `pnpm check:storage-authorities`
- `pnpm check:legacy-debt`
- `pnpm check:openspec`
- `pnpm exec openspec validate restore-workspace-linked-media-access --strict`
- `pnpm package:desktop`
- Scoped ESLint for the changed Content, Assets, Canvas, Search, Text Editor and Desktop boundary files.
- `git diff --check`

## Repository-wide residuals

- The no-bail recursive test run reached all 49 test-bearing workspaces. Media Library-related failures
  found in Canvas, Text Editor and Desktop were corrected and their owning suites now pass.
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
