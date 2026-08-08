## Why

OpenNeko started with a CodeMirror-based Markdown source editor and safe preview, plus a custom Agent
renderer backed by `@neko/markdown`. Creators require a WYSIWYG Markdown surface, while Agent messages
need stable rendering before the model has closed every Markdown construct. Treating one component
as editor, static preview and stream renderer would couple incompatible lifecycle and authority
requirements.

The product uses one GFM contract across explicit browser surfaces: Milkdown for Rich document editing,
CodeMirror for source and general text editing, and the package-owned normalized renderer for Agent
message streaming. Streamdown was a candidate, not an architectural requirement. The Workspace `.md`
file remains authoritative and no renderer becomes an Agent file-writing API.

## Current Implementation Gap

- Phase 0 is implemented: core `Read` returns Workspace-relative freshness, core `Write` uses the
  atomic Content writer with create/replace CAS, and raw `.nkc`/`.otio` access is rejected.
- Text Documents now observe the authoritative parent directory: clean sessions reload, while dirty
  sessions retain their buffer and receive an exact owner-bound external-conflict projection.
- Milkdown 7.22.0 is now the lazy Rich surface. Standard GFM round-trips semantically; Math, footnote,
  mention and Workspace resource syntax that require source preservation disable Rich locally and keep
  Source available.
- Streamdown 2.5.0 passed completed GFM, CJK, sanitization and stable-block checks, but failed incomplete
  emphasis and lacked current resource, semantic, creative-table, Mermaid and structured-artifact
  integration. It is rejected for production and remains a dev-only executable spike.

The completed Phase 0 work is owned by `add-ai-screenplay-authoring`; its deterministic gates remain
part of acceptance for the production Milkdown path and current canonical Agent renderer.

## What Changes

- Define an OpenNeko GFM profile based on GFM 0.29-gfm, including explicit raw HTML, URL, resource
  reference and extension safety policy plus one shared conformance corpus.
- Replace Markdown `Edit | Preview | Split` with `Rich | Source | Split`: Milkdown owns Rich/WYSIWYG,
  CodeMirror 6 remains the full source editor and remains the editor for other admitted text formats.
- Keep Milkdown's CodeMirror-backed code-block component scoped to fenced code blocks; it does not
  replace the Text Editor CodeMirror Root.
- Evaluate Streamdown as a candidate sole Agent renderer. Since the parity spike failed, preserve the
  existing package-local normalized renderer as the only production path and register no candidate,
  feature flag or fallback.
- Preserve `@neko/markdown` as the host-neutral GFM profile, semantic projection, source-range,
  outline/reference, diagnostic and extension owner. It is not a user-visible Markdown dialect or a
  second Agent message renderer.
- Keep Agent streaming/final presentation on one renderer path. Any future replacement requires a new
  parity decision and atomic deletion of the current path.

## Capabilities

### New Capabilities

- `gfm-authoring-and-agent-rendering-surfaces`: one Workspace-authoritative GFM contract with exact
  Rich, Source and Agent message presentation owners and cross-surface conformance.

### Modified Capabilities

None.

## Impact

- `@neko/markdown` owns `OpenNekoGfmProfile`, conformance fixtures, source-backed semantic
  projections and extension contracts without React, DOM, Milkdown, CodeMirror or Streamdown.
- `@neko/text-editor-webview` adds a lazy Milkdown Rich surface while retaining its existing
  CodeMirror 6 Source surface. Both submit to the same `@neko/text-editor-domain` document session.
- `@neko/agent-webview` keeps its package-local message Markdown presenter because the Streamdown spike
  failed the atomic replacement gate. Typed Tool/Approval/Artifact blocks remain separate.
- `@neko/ui` may provide shared visual primitives and safe resource components, but it does not own
  editor state or an alternate Markdown parser/renderer registration.
- `apps/neko-desktop` only lazy-loads and mounts package Roots. It gains no Markdown parsing, editor
  state, file authority or renderer selection policy.
- Existing `.md` files are not migrated. Rich edits may serialize documented semantically equivalent
  GFM normalization, but unsupported constructs must remain intact and fail visibly rather than be
  dropped. Agent file writes continue through the native Workspace file path and appear to an open
  editor as external changes.
- The production Rich path passed the canonical native-file, protected-project and clean/dirty
  external-change gates. Streamdown has no production registration; the current Agent renderer remains
  canonical until a future replacement independently passes parity and is switched atomically.
