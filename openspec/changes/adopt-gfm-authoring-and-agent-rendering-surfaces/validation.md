# UI Validation

Date: 2026-08-08

## Scope

- Applicable surface: Text Editor Markdown Rich/Source/Split, general text diagnostics and Fountain
  preview/outline inside the Desktop Workspace composition.
- Agent production presentation did not change because Streamdown failed its spike. Deterministic Agent
  renderer tests remain authoritative for the no-replacement decision; visible partial-to-final Agent
  continuity is retained as an unexecuted acceptance item.

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

## Evidence

- Text Editor inventory result: passed.
- Overall UI validation result: blocked. Visible Agent partial-to-final continuity remains
  unexecuted.
- Report:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T07-49-38.954Z-desktop-text-editor-development/report.json`.
- Reviewed artifacts: `01-markdown-source-rich-split.png`, `02-json-invalid-diagnostic.png`,
  `03-json-formatted.png`, `04-fountain-outline-preview-cjk.png`,
  `05-save-conflict-keeps-dirty-buffer.png` and `06-text-editor-compact-cjk.png` under the report's
  `screenshots/` directory, plus `07-markdown-split-compact-dark.png` for the dark-theme cycle.

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

## Residual Risk

- The automated IME evidence covers Chromium/Electron composition events and commit behavior; the native
  macOS candidate window and a physical input method were not exercised manually.
- Visible Agent partial-to-final continuity and real Agent `.md` publication require the separately
  authorized provider-backed scenario.
