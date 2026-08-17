## 0. Native File Authority Gate

- [x] 0.1 Audit the current Agent writer, protected-project policy, Text Editor external-change path and Agent Markdown parity baseline; record the gaps and owning change.
- [x] 0.2 Complete `add-ai-screenplay-authoring` tasks 1.1-1.3 and 3.1 so native content replacement uses freshness/CAS and generic file access rejects exact `.nkc`/`.otio` targets.
- [x] 0.3 Complete `add-ai-screenplay-authoring` task 2.3 with Host-driven file observation, clean-session reload and dirty-session conflict evidence.
- [x] 0.4 Prove the Phase 0 canonical paths and forbidden bypasses before registering a production Milkdown Rich mode or evaluating a Streamdown Agent renderer.

## 1. GFM Contract And Corpus

- [x] 1.1 Define `OpenNekoGfmProfile` in `@neko/markdown` from CommonMark and GFM 0.29-gfm, including one-/two-tilde strikethrough, tagfilter, raw HTML and URL policy.
- [x] 1.2 Separate Mermaid, Math, footnote, mention and Workspace resource syntax into explicit extension contracts with support and round-trip declarations.
- [x] 1.3 Build one conformance corpus covering representative GFM specification cases, OpenNeko extensions, source ranges, malformed input, CJK and hostile markup.
- [x] 1.4 Add path tests proving Milkdown and Streamdown spikes consume the package-owned corpus and no user-visible private Markdown format or alternate profile registry exists.

## 2. Milkdown Spike And Rich Editor

- [x] 2.1 Spike pinned Milkdown CommonMark/GFM presets against the corpus, IME, outline/reference ranges, 500-section CJK documents, theme/CSP and lazy bundle budgets before registering Rich.
- [x] 2.2 Define semantic GFM normalization and fail-visible source-preserving-extension behavior; poison semantic loss, raw-HTML execution and inline-style CSP paths.
- [x] 2.3 Add the package-owned lazy Milkdown adapter and `Rich | Source | Split` control while retaining CodeMirror as full Source/general text editor.
- [x] 2.4 Route Milkdown and CodeMirror changes through the same exact Text Document session/edit sequence and cover CJK composition, undo/redo, mode switching and split synchronization.
- [x] 2.5 Keep CodeMirror as the only complete Source editor; no Milkdown CodeMirror plugin or second full-source registration is present.
- [x] 2.6 Order icon-only Markdown controls as Source, Rich and Split; make Split an editable left Source plus read-only right Rich preview; keep incomplete CommonMark/GFM visible and restrict round-trip failures to Rich mutation instead of replacing the document presentation.
- [x] 2.7 Remove the page-sized Rich focus frame and prevent Host acknowledgements from replacing newer local Rich input or one accepted trailing paragraph break; prove rapid input ordering, single-Enter continuity, rejection recovery, CJK composition and Source consistency.

## 3. Streamdown Spike And Agent Renderer Replacement

- [x] 3.1 Spike pinned Streamdown against the smallest decisive parity set: completed/incomplete GFM, stable identity, hostile HTML/URL, resource references, creative tables, Mermaid and structured fences. Stop after deterministic hard-gate failures.
- [x] 3.2 Record the isolated candidate cost (507,659 bytes minified; 151,943 bytes gzip). Sustained-update and long-message acceptance were not run because correctness already rejected the candidate.
- [x] 3.3 Record the no-go decision: keep the current package-local renderer as the only production path; do not register Streamdown, a feature flag or a fallback.
- [x] 3.4 Keep Streamdown dev-only for the executable spike and prove production exports/registrations remain unchanged.

> Superseded on 2026-08-17 by `replace-agent-markdown-renderer-with-streamdown`; the historical spike
> remains completed evidence, while Streamdown is now the atomic production Agent text renderer.

## 4. File And Semantic Projection Integration

- [x] 4.1 Derive editor outline, references, diagnostics and extension source ranges from `@neko/markdown`, not Milkdown or Agent renderer DOM.
- [x] 4.2 Preserve native Agent `.md` file authoring and clean/dirty external-change behavior without editor transaction injection.
- [x] 4.3 Verify Tool, Approval, Artifact, media and domain result blocks retain exact typed sibling presenters; the rejected candidate never receives them.
- [ ] 4.4 Verify Resource Browser reopen/reload projects authoritative file bytes after Agent publication and cannot promote chat DOM into an artifact.

## 5. Evaluation And User-Visible Validation

- [x] 5.1 Run deterministic GFM corpus, round-trip, renderer-path, security and package-boundary tests; this is the owning evidence for pure parsing/rendering behavior.
- [ ] 5.2 Run `neko-ui-validation` on the authoritative visible Desktop for Rich/Source/Split, CJK IME, outline navigation, long text/table/link fit, stream/final continuity, theme, keyboard and adjacent Workbench behavior. The Text Editor light/dark-theme, compact, conflict and Chromium/Electron IME composition inventory passes; visible Agent partial-to-final continuity remains unexecuted.
- [ ] 5.3 Reuse the native content-file Agent Evaluation owned by `add-ai-screenplay-authoring` to prove real `.md` file publication remains independent from editor/renderers; do not add a model Judge for deterministic rendering correctness.
- [x] 5.4 Run focused package tests/typechecks, Electron renderer validation, application/webview/dependency/OpenSpec gates and `neko-quality-review`; record exact blockers and residual risk.

## 6. Documentation And Completion

- [x] 6.1 Record the dated open-source comparison, source links, observed versions and uncertainty.
- [x] 6.2 Add OpenSpec proposal, five-layer design, requirements, tasks and Agent Evaluation disposition.
- [x] 6.3 Update the stable Markdown ADR, architecture navigation, document navigation and package-owned Markdown contract without claiming unimplemented dependencies are present.
- [ ] 6.4 After implementation evidence passes, archive the change and remove target/implementation-gap wording from stable documentation.

## 7. Agent Turn Presentation And Narrowed Renderer Replacement

- [x] 7.1 Capture the 2026-08-10 visible Desktop hierarchy defect and update proposal, five-layer design, requirements and tasks before implementation.
- [x] 7.2 Replace block-level primary-result grouping with one turn-level presentation projection that preserves exact Timeline identity and separates answer, deliverable, actionable and activity roles without tool-name routing.
- [x] 7.3 Render one assistant identity gutter, header-free answer Markdown and at most one flat process disclosure; remove nested Tool/Thinking disclosure chrome while keeping failures and approvals visible.
- [x] 7.4 Add a package-owned semantic Agent Markdown theme with constrained text measure and explicit wide lanes for tables, code, Diff and authorized media in full and narrow layouts.
- [x] 7.5 Re-run the Streamdown 2.5.0 gate against the narrowed text-only contract; the candidate passes base GFM/CJK, incomplete-suffix visibility, stable blocks and hostile input but fails owner-aware Workspace resource projection, so record the renewed no-go without production registration.
- [x] 7.6 Add deterministic presenter, component, GFM, streaming identity, security, evidence/deliverable placement and no-old-path tests; run focused package typecheck and Webview tests.
- [ ] 7.7 Use `neko-ui-validation` on the visible Electron Desktop for running, completed, expanded activity, actionable failure/approval, dense GFM, media evidence/deliverable, light/dark and narrow/full layouts. Two authoritative attempts are blocked by stale adjacent scenario assertions before the transcript inventory completes; deterministic DOM/layout coverage passes, but is not substituted for visible evidence.
- [x] 7.8 Reuse and update `agent-runtime.stream-delivery` for Desktop event-projection evidence; key-free validation passes (44 files / 294 tests, 24 suites / 64 cases), while real-provider visible/hidden execution is infrastructure-blocked because provider, model and cost authorization are unset.
- [x] 7.9 Run `neko-quality-review`, dependency/OpenSpec gates and adjacent regression checks; focused Webview, Agent Evaluation, package/application/Agent/Webview boundary, strict Agent, legacy debt, unused and OpenSpec gates pass, with UI and smoke blockers recorded fail-visible.

## 8. Active Output Interaction And Scheduling

- [x] 8.1 Record the active-output interaction defect and update proposal, five-layer design, requirements, Evaluation disposition and tasks before implementation.
- [x] 8.2 Add one Agent Webview streaming-presentation scheduler that preserves every append, establishes the first visible snapshot immediately, bounds intermediate full-source parses and flushes finalization synchronously without another renderer path.
- [x] 8.3 Keep the active-run composer editable and exact text queue/Stop behavior available while retaining current-Turn configuration locks and explicit unsupported queued-input boundaries.
- [x] 8.4 Replace Desktop's broad Shell pending presentation with owner-scoped scene, layout, sidebar/catalog and target-selection pending state so unrelated Workbench controls remain interactive.
- [x] 8.5 Add deterministic scheduler, final-convergence, composer-focus/queue, pending-scope and no-fallback tests; run focused package builds/typechecks and boundary gates.
- [x] 8.6 Run `neko-ui-validation`, reuse `agent-runtime.stream-delivery` for the unchanged event-projection path, run `neko-quality-review`, and record visible Electron/performance evidence or exact blockers.

## 9. Live And Reopened Turn Projection Parity

- [x] 9.1 Record the reopened-conversation fragmentation defect and define Agent runtime history projection, not Webview adjacent-message grouping, as the canonical owner.
- [x] 9.2 Segment persisted Pi entries by user turn and project all assistant iterations plus exact Tool results into one ordered assistant `Message` without changing raw transcript authority.
- [x] 9.3 Add deterministic runtime and Webview tests proving a multi-Tool turn has one activity disclosure and identical final hierarchy before and after reopen, while orphan Tool results remain fail-visible.
- [x] 9.4 Reuse the existing persistence/resume Agent Evaluation disposition, run focused runtime/Webview validation and `neko-ui-validation`/`neko-quality-review`, and record exact visible-runtime blockers.

## 10. Turn Timing, Ordered Evidence And Thumbnail Interaction

- [x] 10.1 Record the duration/sequence/evidence hierarchy defect and update proposal, five-layer design, requirements, Evaluation disposition and tasks before implementation.
- [x] 10.2 Project one canonical Turn timing interval from the earliest item `createdAt` through `completion.completedAt` for live and reopened messages; keep the active clock disposable and never sum Tool durations.
- [x] 10.3 Replace the collapsed process-record title with active/completed elapsed time, move Tool/Thinking counts into expanded secondary metadata, and preserve exact Timeline sequence in the expanded list while keeping approvals/failures always visible.
- [x] 10.4 Nest ReadImage/document-page evidence under its exact Tool step, keep only generated/saved typed outputs in the post-answer deliverable region, and replace persistent JSON/info thumbnail controls with open plus typed overflow actions.
- [x] 10.5 Add deterministic runtime/presenter/component tests for timing arithmetic, overlap, original order, live/reopen parity, actionable placement, evidence nesting and thumbnail actions; run focused package validation.
- [x] 10.6 Replace the legacy execution-status row once a canonical running Turn exists, and compact repeated completed failures for one exact target without hiding their diagnostics.
- [x] 10.7 Run `neko-ui-validation`, reuse the existing `agent-runtime.stream-delivery` and persistence/resume Agent Evaluation dispositions, run `neko-quality-review`, and record visible-runtime evidence or exact blockers.

## 11. Reusable Rich Surface And Canvas Markdown Nodes

- [x] 11.1 Define the browser-only controlled Milkdown Surface boundary and separate Text Document, Canvas node and media-authority ownership before implementation.
- [x] 11.2 Extract Milkdown lifecycle, GFM round-trip gating, composition, history and reconciliation into the explicit shared browser entry; keep Text Editor session queue and media projection in its adapter.
- [x] 11.3 Replace Canvas selection-driven raw textarea editing with compact read-only WYSIWYG presentation and explicit lazy Rich activation for the exact Markdown node.
- [x] 11.4 Add deterministic shared-surface, Text Editor adapter and Canvas interaction tests, then run focused typechecks and package-boundary gates.
- [x] 11.5 Run `neko-ui-validation` and `neko-quality-review`; record authoritative visible Desktop evidence or exact blockers without substituting unit tests for visual acceptance.
  - Visible development Electron evidence: `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T23-31-50.567Z-canvas-openneko-consumer-development/report.json` records the passing `canvas-markdown-node-rich-surface` checkpoint and compact/Rich screenshots. The broader scenario later failed in the pre-existing Generation model-menu assertion because the single model option did not expose an inline provider row; this occurred after the Markdown checkpoint and is not treated as a passing full Canvas scenario.
  - Quality review found no blocking issue in the shared Surface, Text Editor adapter or Canvas Markdown activation scope; focused lint, tests, typecheck, package roles/boundaries, strict OpenSpec validation and diff hygiene passed.
