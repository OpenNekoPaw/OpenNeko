## Why

OpenNeko started with a CodeMirror-based Markdown source editor and safe preview, plus a custom Agent
renderer backed by `@neko/markdown`. Creators require a WYSIWYG Markdown surface, while Agent messages
need stable rendering before the model has closed every Markdown construct. Treating one component
as editor, static preview and stream renderer would couple incompatible lifecycle and authority
requirements.

Visible Desktop evidence from 2026-08-10 also shows that the current Agent presentation fragments one
turn into repeated `Process records`, `Response`, `Tool` and `Thinking` rows. Nested disclosure controls,
per-block headers and uniform full-width content make the final answer difficult to scan. This is a
turn-presentation defect rather than only a Markdown parser or CSS defect: every non-empty Markdown
block is currently treated as a primary result and splits surrounding process activity.

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
- Streamdown 2.5.0 passed completed GFM, CJK, sanitization and stable-block checks, but failed the original
  overloaded parity gate in which Markdown presentation also carried resource, semantic,
  creative-table, Mermaid and structured-artifact responsibilities. The dated no-go remains valid
  evidence for that scope. This change now narrows the Agent text surface to portable GFM plus explicit
  text extensions and reopens an atomic replacement gate; typed Tool, approval, media, evidence,
  deliverable and Artifact presenters remain outside Markdown.
- The Agent Webview currently projects every content block as an independent visual unit. A new
  turn-level projection is required to distinguish answer content from progress activity and to expose
  at most one process disclosure for a completed run.
- The narrowed 2026-08-10 Streamdown rerun passes portable GFM/CJK, incomplete-suffix visibility,
  stable completed blocks and hostile HTML/URL hardening, but still cannot consume the existing
  owner-aware Workspace resource projection. It therefore remains dev-only and the normalized
  package-local presenter remains the sole production text path.
- Streaming Timeline patches currently trigger synchronous full-source Markdown parsing and React
  publication on the Renderer thread. Long or dense output can therefore delay composer input,
  scrolling and Workbench pointer interaction even when controls are not semantically disabled.
- Desktop Shell also projects unrelated mutations through one broad pending flag, so a short
  navigation, sidebar or layout command disables controls outside the command's owning scope.
- Live turns are projected from one Timeline turn/message owner, but conversation reopen reconstructs
  every persisted Pi assistant iteration as a separate `Message`. A tool-using turn can therefore
  reopen as several assistant rows and several activity disclosures even though it rendered as one
  turn while running.

The completed Phase 0 work is owned by `add-ai-screenplay-authoring`; its deterministic gates remain
part of acceptance for the production Milkdown path and current canonical Agent renderer.

## What Changes

- Define an OpenNeko GFM profile based on GFM 0.29-gfm, including explicit raw HTML, URL, resource
  reference and extension safety policy plus one shared conformance corpus.
- Replace Markdown `Edit | Preview | Split` with `Rich | Source | Split`: Milkdown owns Rich/WYSIWYG,
  CodeMirror 6 remains the full source editor and remains the editor for other admitted text formats.
- Keep Milkdown's CodeMirror-backed code-block component scoped to fenced code blocks; it does not
  replace the Text Editor CodeMirror Root.
- Project one Assistant turn into a readable answer document, typed deliverables and one bounded
  activity disclosure. Ordinary answer Markdown has no `Response` header; Tool and Thinking content do
  not add nested disclosure cards inside the run disclosure.
- Replace tool-name-driven visibility with typed presentation semantics for progress evidence,
  user-facing deliverables, diagnostics and approvals.
- Re-evaluate Streamdown as the sole Agent text renderer under the narrowed text-only contract. The
  candidate still fails the Workspace resource hard gate, so it remains an executable dev-only spike
  without production registration. No feature flag, runtime fallback or streaming/final renderer
  switch is added.
- Add a package-owned Agent Markdown theme with a constrained reading column and explicit wide lanes
  for tables, diffs and media. Third-party default styles do not become the product design system.
- Preserve `@neko/markdown` as the host-neutral GFM profile, semantic projection, source-range,
  outline/reference, diagnostic and extension owner. It is not a user-visible Markdown dialect or a
  second Agent message renderer.
- Keep Agent streaming/final presentation on one renderer path. Any future replacement requires a new
  parity decision and atomic deletion of the current path.
- Keep the composer editable during an active Agent run, retain exact text-queue and Stop behavior,
  and freeze only configuration that belongs to the in-flight turn snapshot.
- Coalesce append-only Markdown presentation work without dropping Timeline patches, and synchronously
  converge on the exact final source. Scope Desktop pending state to the owning scene, layout, sidebar
  or target-selection mutation instead of disabling the whole Workbench.
- Project persisted Pi transcript entries through the same user-turn boundary as live Timeline output:
  assistant iterations and their exact Tool results remain ordered blocks of one restored assistant
  message until the next user message. Do not add a Webview-only adjacent-message merge or a reopen
  renderer path.

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
- `@neko/agent-webview` owns the turn-level read model, the single activity disclosure, semantic Agent
  Markdown components and typed result placement. It may replace the current text presenter with a
  package-local Streamdown adapter only after the renewed atomic gate passes.
- `@neko/ui` may provide shared visual primitives and safe resource components, but it does not own
  editor state or an alternate Markdown parser/renderer registration.
- `apps/neko-desktop` only lazy-loads and mounts package Roots. It gains no Markdown parsing, editor
  state, file authority or renderer selection policy.
- Existing `.md` files are not migrated. Rich edits may serialize documented semantically equivalent
  GFM normalization, but unsupported constructs must remain intact and fail visibly rather than be
  dropped. Agent file writes continue through the native Workspace file path and appear to an open
  editor as external changes.
- The production Rich path passed the canonical native-file, protected-project and clean/dirty
  external-change gates. The Agent turn hierarchy, narrowed Streamdown gate and visible rich-output
  acceptance remain implementation work in this change.
