# UI Validation

Date: 2026-08-10

## Scope

- Applicable surface: Text Editor Markdown Rich/Source/Split, general text diagnostics and Fountain
  preview/outline inside the Desktop Workspace composition, plus the Agent transcript turn layout.
- Agent production presentation now uses one turn-level projection with one answer lane, typed
  deliverable/actionable lanes and at most one flat activity disclosure. Streamdown remains rejected;
  the current normalized Markdown renderer is still the only production text renderer.

## Runtime

The authoritative runtime was the isolated visible Electron Desktop `desktop-text-editor` scenario. It
crosses Resource Browser selection, Desktop Main/preload/renderer IPC, the exact Text Document session,
CodeMirror, the lazy Milkdown production module and Workspace file IO. Browser-only evidence cannot
replace these boundaries.

## Inventory

- Open `notes.md`, edit Chinese Markdown in Source, switch to Split, observe the same accepted source in
  Milkdown Rich, save it and verify the exact Workspace bytes.
- Open `ime.txt`, drive Chromium IME composition into CodeMirror, observe the accepted dirty source,
  save it and verify the exact composed UTF-8 bytes.
- Open invalid JSON, observe the local diagnostic, edit it, format it and observe valid structured text.
- Open Fountain, inspect the Chinese scene outline and Source/Preview Split projection.
- Modify a dirty JSON document after an external write, observe the local conflict, retain the dirty
  buffer and verify the external bytes remain unchanged.
- Resize to 960 x 640 and verify toolbar controls remain contained and non-overlapping.
- Adjacent behavior: Resource Browser selection, Agent dock, Workspace tabs and non-Markdown
  CodeMirror/Fountain presentation remain available.
- Agent completed turn: final Markdown is the primary result, without repeated `Response`/`Tool`
  headers or block-level assistant avatars.
- Agent activity: progress text, thinking, Tool rows and evidence are contained by one disclosure;
  failure and approval projections remain outside the collapsed activity lane.
- Agent typography: headings, paragraphs, lists, blockquotes, tables and code use a constrained reading
  lane while typed wide content keeps the available width.
- Active output: composer focus, typing, exact plain-text queue and Stop remain available; streaming
  presentation work is bounded; unrelated Sidebar pending state does not lock Workspace layout controls.
- Reopened conversation: one persisted multi-Tool user turn reconstructs one assistant identity and one
  activity disclosure before the same terminal Markdown hierarchy used while the turn was live.
- ReadImage evidence: document page thumbnails remain inside the process disclosure; generated or
  published media remains a typed deliverable outside it.

## Evidence

- Text Editor inventory result: passed.
- Overall UI validation result: blocked. The Agent implementation passes deterministic DOM/layout
  acceptance, but the authoritative visible Desktop transcript inventory did not reach the required
  completed/expanded/dark/narrow states.
- Report:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T07-49-38.954Z-desktop-text-editor-development/report.json`.
- Reviewed artifacts: `01-markdown-source-rich-split.png`, `02-json-invalid-diagnostic.png`,
  `03-json-formatted.png`, `04-fountain-outline-preview-cjk.png`,
  `05-save-conflict-keeps-dirty-buffer.png` and `06-text-editor-compact-cjk.png` under the report's
  `screenshots/` directory, plus `07-markdown-split-compact-dark.png` for the dark-theme cycle.
- Agent deterministic evidence: `packages/agent/webview` passes 90 files / 698 tests, including a dense
  multi-step turn with progress text, two Tools, thinking, final GFM, one disclosure and no legacy
  `Response`/`Tool` headings.
- Reopened-turn deterministic evidence: Agent runtime history projection passes 7 focused tests and
  Agent Webview passes 90 files / 705 tests. Coverage reconstructs three persisted assistant
  iterations around two exact Tool results as one product message, preserves orphan-result failure,
  renders one process disclosure before the final answer and keeps typed ReadImage thumbnails in the
  process lane without requiring perception cards.
- Active-output deterministic evidence: Agent Webview passes 90 files / 704 tests, focused Desktop tests
  pass 67 assertions, both affected package typechecks pass, and the scheduling/finalization tests prove
  byte-preserving coalescing with synchronous final convergence.
- Agent visible Desktop attempts:
  - `desktop-workbench-scenes` reached the real Electron Entry Draft and produced reviewed full/narrow
    screenshots, then failed in adjacent Assets navigation because the scenario expected
    `asset-management` while the current Shell opened `character-management`.
  - `desktop-conversation-navigation` reached the real Assistant session and composer, then failed
    because the existing scenario still requires the removed mode control.
  - Reports:
    `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T16-51-09.365Z-desktop-workbench-scenes-development/report.json`
    and
    `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T16-52-23.678Z-desktop-conversation-navigation-development/report.json`.
  - The active-output rerun on 2026-08-10 failed before a CDP target became available because the
    development launcher passed `--openneko-functional-fixture` to a command that rejected the option.
    Its report contains no checkpoints or screenshots:
    `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T19-32-31.061Z-desktop-conversation-navigation-development/report.json`.
  - The reopened-turn rerun encountered the same launcher failure before any CDP checkpoint; its
    fail-visible report is
    `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T19-50-57.369Z-desktop-conversation-navigation-development/report.json`.

## Visual Findings

- Markdown: outline, Milkdown Rich and CodeMirror Source remain distinct, readable columns with no
  overlap; the selected Split control and unsaved indicator are visible.
- JSON and Fountain: diagnostics, formatted source, Chinese outline and screenplay preview remain
  legible and aligned; empty canvas space does not obscure controls or content.
- Conflict: the warning and both recovery actions fit on one visible row without covering the dirty
  source.
- Compact: tabs and toolbar icons fit within the 960 px window; no text or command overlap was observed.
- Dark compact: the Shell, Milkdown Rich and CodeMirror Source use the same dark-theme contract; Chinese
  content, controls and split boundaries remain readable with no clipping or overlap. The functional
  checkpoint records editor background `rgb(27, 29, 28)` and foreground `rgb(231, 234, 232)`.
- IME composition: the authoritative Electron Renderer accepted `Input.imeSetComposition`, projected
  `中文输入法组合` through the Text Document edit sequence and saved the same UTF-8 bytes.
- Agent Entry Draft full/narrow screenshots were read directly. The composer remains contained and
  non-overlapping at 1440 x 960 and 1040 x 700, but these screenshots contain no transcript and
  therefore do not count as evidence for completed or expanded Agent turns.

## Residual Risk

- The automated IME evidence covers Chromium/Electron composition events and commit behavior; the native
  macOS candidate window and a physical input method were not exercised manually.
- Visible Agent partial-to-final continuity, dense GFM, expanded activity, failure/approval, media
  placement and dark-theme transcript states remain blocked by stale adjacent functional assertions.
- Active streaming focus/typing and concurrent Workspace layout manipulation remain visually unverified;
  the latest authoritative attempt is blocked earlier by the development-launch argument failure.
- The real-provider visible scenario also requires explicit provider/model/cost authorization; the
  user configuration is readable, but all three authorization environment values are unset.
- Repository-wide quality validation reached strict TypeScript and then stopped on a concurrently
  modified Canvas sizing switch with no exhaustive return. The Agent/Webview/OpenSpec boundary gates
  and both affected package typechecks passed before that external change appeared.
