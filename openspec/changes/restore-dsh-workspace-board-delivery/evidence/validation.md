# Validation evidence

## Automated

- `packages/agent/runtime`: full suite passed (52 files, 369 tests); terminal collector/service rerun passed
  (11 tests); typecheck passed. A failed sibling Content Tool is excluded locally while completed sources and the final
  analysis still form the terminal delivery batch.
- `packages/canvas/domain`: full suite passed (37 files, 299 tests); Workspace Board projection test passed
  (13 tests); typecheck passed.
- `packages/canvas/webview`: full suite passed (63 files, 409 tests); preview lifecycle, File preview, and fullscreen
  preview subset passed (17 tests); typecheck passed.
- `apps/neko-desktop`: full suite passed (103 files, 614 tests); DSH Board request/fingerprint adapter plus Canvas
  runtime focused tests passed; typecheck passed.
- Desktop production package passed for `darwin-arm64` (Vite: 1,354 modules). Existing Radix `use client` and chunk-size
  warnings remain.
- The staged DSH runtime closure rebuilt successfully, resolved `sharp@0.35.3`, and contains the dimension-normalizing
  Content plugin implementation.
- `check:openspec`, Agent boundaries, package boundaries, content-access boundaries, and Webview boundaries passed.
- `check:no-internal-versioning` test harness passed, but the repository audit failed on pre-existing dirty-worktree
  baseline drift (78 occurrences and stale allowances); after removing one initial test-only debt token, none of the
  reported new occurrences belong to this Board fix.
- Agent Evaluation all-suite dry-run passed for `content-locator-document-images`; this proves only scenario authoring
  readiness, not real Agent or Canvas behavior.

## Failure-chain diagnostic

The affected Blame conversation resolves to the configured Blame Workspace authority. Its local delivery ledger had no
`dsh-turn:*` entry for the reported turn, proving the failure occurred before Canvas mutation rather than in Board
refresh. The terminal collector previously discarded the entire batch when any sibling Content Tool failed; the
oversized `read_image` result therefore prevented the successful document source and final Markdown from being enqueued.
The collector now admits completed sources independently and preserves the existing exact-locator, analysis-identity,
ledger, and Canvas deduplication chain.

## Agent Evaluation

The existing visible Desktop evidence adapter rejects `workspace-board-projection` as unsupported and its facts command
does not expose Canvas Workspace Board projection facts. The content-locator image scenario therefore remains focused on
the real document/read-image path; no unsupported Board assertion is added. A real visible Electron Board projection and
replay check remains blocked until the public Evaluation evidence boundary can observe Canvas facts without direct IPC,
database reads, or a test-only runtime shortcut.

## UI validation inventory

- Existing Workspace Board is open; a later terminal analysis reads the same locator after its content changes; expected:
  same node/layout, refreshed visible text or media content.
- Existing source fingerprint is unchanged; expected: no preview lease churn and no node mutation.
- Source is unavailable; expected: current delivery fails locally with a diagnostic and sibling Canvas content remains.

The affected real provider turn was replayed through the running visible Electron Desktop with `workspace.nkc` already
open. The live accessibility tree and direct pixel capture show the EPUB file node, the full Markdown analysis node and
their derived-from edge without closing or reopening the Board. The visible counter is `2 nodes | 1 connections`; the
UI itself was not replaced or restyled.

## 2026-08-21 live subscription and semantic source follow-up

- Main now replaces an existing sender + exact Canvas identity subscription before reading the authoritative rebound
  snapshot. Preload declares that exact identity and resets its event cursor before invoking Main, so events published
  during bootstrap are observable and a recreated session is not compared against the released session's sequence.
- The terminal collector now treats locator identity and document semantics as separate layers. It collapses an exact
  document-entry source only when the successful Document result declares `excerpt.contentKind = image`, every declared
  same-container `imageInfo[].contentLocator` was successfully consumed by the Content Image Tool in the same turn, and
  those image sources are present. Text, mixed, file-level and partially consumed entries remain visible sources.
- No Canvas/Webview component, HTML renderer, style or layout was changed. Raw EPUB HTML is not executed on Canvas.
- `pnpm test:agent:eval` passed (`45` files, `314` harness tests; `26` suites and `67` cases dry-run). Disposition remains
  `reuse` for the indexed `content-locator-document-images` Tool path plus deterministic collector projection tests.
  The real Board assertion is still infrastructure-blocked because the public Desktop Evaluation evidence contract
  cannot expose Workspace Board projection facts; no unit or dry-run result is claimed as real Agent behavior evidence.
- UI validation passed for the reported real turn: the already-open Workspace Board updated to one EPUB container
  source plus one analysis node and one relation. Both the live accessibility projection and direct pixel capture prove
  the post-fix state; no close/reopen action was used during validation.
- `pnpm smoke:webview` remains blocked by the existing smoke contract mismatch: `@neko/canvas-webview` runs
  `tsc --noEmit` and produces no `dist` directory while the smoke runner requires one. This failure occurred after the
  assets Webview build and before Desktop packaging; the separate Desktop production package passed.

## 2026-08-21 EPUB zero-or-many regression validation

- The real DSH session contains one oversized root EPUB manifest result whose projected text is truncated and therefore
  not valid JSON, followed by valid exact-entry Document results and the final assistant Markdown. Previously this one
  completed-but-noncanonical projection aborted collection before Canvas mutation, producing zero nodes.
- Completed Content Tool projection decoding now fails at the exact tool-call boundary. Desktop emitted
  `DSH_WORKSPACE_BOARD_CONTENT_TOOL_PROJECTION_INVALID` for the truncated manifest call while valid sibling Document
  results continued into the same terminal batch; no `dsh-workspace-board-artifact-delivery-failed` followed it.
- Multiple successful locators for the same EPUB were compacted using only their shared `ContentLocator.file` identity.
  The persisted `/Users/feng/OpenNekoProjects/Blame/neko/boards/workspace.nkc` contains exactly two nodes and one
  connection: a root EPUB `ContentLocator`, the final Markdown analysis, and a `derived-from` edge. Fingerprint remains
  internal provenance and is not used as cross-application identity.
- Focused regression coverage proves non-JSON sibling isolation, exact diagnostic reporting plus continued delivery,
  multi-page container compaction, replay dedupe, and preservation of a single exact page selector. Strict OpenSpec
  validation, both affected typechecks, full Agent Runtime/Desktop tests, Desktop production build and `git diff
  --check` passed.

## 2026-08-22 complete ContentLocator index correction

- The reported `workspace.nkc` was not missing its terminal analysis delivery: its newest Markdown provenance was
  created at `2026-08-21T19:40:45.960Z`, the same second that the visible 13-minute turn completed. The persisted graph
  contained the root EPUB source plus three analysis nodes. This isolated the visible defect to source projection rather
  than terminal timing, ledger admission, Canvas mutation, or live refresh.
- The task-11 same-file compaction was the regression. It used `ContentLocator.file` to replace every distinct selector
  consumed from one EPUB with one root locator, so page-level cross-application identities disappeared even though the
  analysis node was written. The collector now deduplicates only identical complete `ContentLocator` values.
- Content-declared image-only wrapper replacement remains canonical: when an XHTML/HTML entry declares image content
  and its embedded image was successfully consumed, Board receives the image locator and not both wrapper and image.
  A combined EPUB regression proves one root source plus two distinct page images, one copy of a repeated image, no
  wrapper nodes, and the terminal analysis relation.
- Validation passed: Agent Runtime focused collector (`22` tests), full Agent Runtime (`52` files, `371` tests before
  the final added regression; the focused rerun covers the added case), Canvas Domain (`37` files, `300` tests), focused
  Desktop Board/subscription (`2` files, `6` tests), Agent Runtime and Desktop typechecks, `pnpm test:agent:eval`
  (`45` files, `314` harness tests; `26` suites and `69` dry-run cases), Agent/content boundary gates, strict OpenSpec
  validation (`119` items), and `git diff --check`.
- Desktop production packaging passed for `darwin-arm64`; the exact development owner was stopped before packaging and
  the same development runtime was restarted afterward, preserving the single Vite bundle-writer invariant.
- Post-fix visible UI acceptance remains blocked in this implementation turn because it requires a new user-driven real
  provider turn; no direct IPC, database injection, dry-run, or unit result is substituted for that evidence. The
  authoritative manual check is that a new multi-page EPUB analysis updates the already-open configured Board with
  distinct image/page sources plus one analysis node, without duplicate wrappers or reopening the Board.

## 2026-08-22 completed Tool incremental delivery follow-up

- 收尾边界审计补充：Tool projection 现在保存已知的稳定 `turnStartedAt`，completed-tool collector 不再要求
  `turn/start` 仍位于最多 256 条的 event window 中；无匹配 turn/start 的非内容 Tool/隔离诊断场景保持原有
  projection 语义，只有实际尝试交付的 completed content Tool 会产生局部 diagnostic。

- Agent Runtime now receives the exact completed `toolCallId` after ACP projection, decodes only that supported Content
  Tool, and submits a source-only delivery. A successful terminal projection submits final Markdown and relations through
  a distinct turn-scoped delivery. Interrupted and failed turns create no analysis delivery and do not remove already
  delivered sources.
- Image-only Document results immediately project their declared same-container embedded image locators and omit the
  chapter wrapper. Full-`ContentLocator` identity deduplicates a later Content Image Tool read and the terminal replay;
  text, mixed, root and distinct selector sources remain independent.
- Validation passed: Agent Runtime full suite (`52` files, `376` tests), Desktop full suite (`103` files, `621` tests),
  focused Desktop incremental/terminal planner regression (`6` tests), Canvas Domain (`37` files, `300` tests), all three
  affected typechecks, focused ESLint, Agent/content/application boundary gates, strict OpenSpec (`120` items),
  `git diff --check`, and the key-free Agent Evaluation harness (`45` files, `314` tests; `26` suites and `69` dry-run
  cases). The Evaluation result proves authoring/harness readiness only, not real provider Board behavior.
- `check:legacy-debt` passed. `check:unused` remains failed on the repository baseline (7 unused files, 2 dependencies,
  1 devDependency, 2 unlisted dependencies and 162 exports); none of the new delivery symbols were reported.
- UI validation is blocked rather than inferred. The running real Electron Desktop was inspected read-only and exposes
  the configured Board with its pre-change `12 nodes | 10 connections`, but proving completed-Tool timing requires a new
  user-driven real-provider turn and an interruption check. No provider call, direct IPC, database injection or existing
  Board replay was substituted. Desktop packaging was not run because that visible development owner is actively using
  the single Forge/Vite bundle writer; it was not terminated for this validation.
