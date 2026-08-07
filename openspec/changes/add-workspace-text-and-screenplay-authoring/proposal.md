## Why

Workspace Resource Browser currently opens JSON, Markdown, Fountain and other text files only through
the read-only Preview surface. Creators cannot edit or safely save those files in OpenNeko, and the
existing simplified Fountain segmentation cannot provide a reliable Chinese screenplay or future AI
authoring boundary.

## What Changes

- Add a package-owned Workspace Text Editor Main View for authorized UTF-8 workspace files, using
  CodeMirror 6 for browser-side editing while a host-neutral document session owns revision, dirty
  state, save conflict handling and diagnostics.
- Make Resource Browser open supported text files through the Text Editor by default; keep Preview
  read-only and preserve it as the canonical viewer for non-editable content.
- Support Markdown source editing with safe `@neko/markdown` preview and JSON editing with syntax
  highlighting, deterministic parse diagnostics and an explicit format command. Other admitted text
  formats receive plain-text editing without an invented semantic renderer.
- Replace the simplified Fountain interpretation with one canonical, source-positioned Fountain
  parser and use its immutable projections for editor diagnostics, screenplay preview, scene outline,
  character completion and Search indexing.
- Provide Chinese-friendly Fountain authoring through UTF-8, IME-safe editing, CJK typography,
  standard forced syntax support and localized UI/diagnostics without creating a localized private
  screenplay format.
- Expose one revisioned text-authoring application port that future Agent capabilities can call with
  exact document identity and deterministic edits. Actual Agent prompts, tools, autonomous write-back,
  FDX interchange and PDF export remain separate changes.
- Extend the canonical Workbench View union with `text-editor`, with exact document/session identity,
  bounded split behavior and package-owned presentation snapshots; no universal Editor/Preview/Canvas
  session or retained hidden React Root is introduced.
- Add CodeMirror 6 and the minimum Markdown/JSON language packages. Monaco, VS Code extension hosting,
  Language Server Protocol, schema completion, collaborative editing and generic IDE features are
  out of scope.

## Capabilities

### New Capabilities

- `workspace-text-document-authoring`: Authorized text admission, document-session lifecycle,
  revisioned edits, safe save/conflict behavior, Markdown/JSON modes, Text Editor UI, Resource Browser
  routing and Workbench integration.
- `fountain-screenplay-authoring`: Canonical Fountain parsing and diagnostics, Unicode/Chinese
  authoring rules, scene and character projections, screenplay preview and shared Search projection.

### Modified Capabilities

None.

## Impact

- New `@neko/text-editor-domain` package owns host-neutral text document sessions, admission policy,
  generic format diagnostics, revisioned edit commands and the public authoring port. New
  `@neko/text-editor-webview` owns the CodeMirror Root, browser interaction and recoverable editor
  presentation snapshots.
- New `@neko/screenplay-domain` owns the canonical Fountain parser, source-positioned normalized
  document, diagnostics and scene/character projections. Text Editor, Search and future Agent
  authoring consume this public contract instead of depending on one another.
- `@neko/content` remains the authority for `ContentLocator`, authorized workspace reads/writes and
  fingerprint CAS. Its Fountain DTO is replaced inside this change by the canonical parser contract
  owned by `@neko/screenplay-domain`; it does not gain a second file writer.
- `@neko/markdown` and `@neko/ui` remain the canonical Markdown parser and safe presentation path;
  the Text Editor consumes them instead of adding another Markdown parser or renderer.
- `@neko/search-domain` stops parsing Fountain independently and consumes projections from the
  canonical Fountain parser. Invalid Fountain fails only that source projection and preserves valid
  sibling search sources.
- `@neko/assets-webview` projects the explicit editable-text capability and submits an exact open
  request; it does not read files or choose an editor implementation.
- `@neko/host` adds the canonical `text-editor` Workbench View shape and exact lifecycle validation.
  This change must integrate against the final contract from the active
  `compose-desktop-workbench-scenes` change rather than create a parallel View registry.
- `apps/neko-desktop` supplies sender-bound IPC, workspace authorization, concrete Content I/O,
  package public-port wiring and current-scene composition only. Text decoding, edit validation,
  dirty/save policy and Fountain semantics remain package-owned and testable without Electron.
- Workspace text files remain authoritative and are never migrated or rewritten on open. Saves are
  atomic, require the loaded fingerprint, and reject stale external changes without overwriting user
  data.
