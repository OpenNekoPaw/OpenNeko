## Context

The Preview domain classifies Markdown, JSON, Fountain and a fixed set of other extensions as text,
projects authorized bytes to a Webview URL and renders them in a read-only `<pre>`. Resource Browser
routes those files only to Preview. There is no editable Main View, document-scoped dirty buffer,
save command or external-change conflict UI.

The repository already provides the correct trust-boundary primitives: `@neko/content` owns
`ContentLocator`, bounded reads, authorized workspace writes and fingerprint CAS; `@neko/markdown`
owns the normalized CommonMark/GFM parser; `@neko/ui` owns safe Markdown presentation; and
`@neko/host` owns the closed Workbench View projection. Search currently has a separate simplified
Fountain line classifier that recognizes only English scene prefixes and ASCII uppercase character
cues unless `@` is used. That classifier is not a sufficient screenplay authority.

This change crosses Content I/O, a new text-document application owner, a new screenplay domain,
browser editing, Search projection, Assets open routing, Host Workbench contracts and Desktop
sender-bound composition. It must preserve the Electron renderer sandbox, the single canonical path
rule, local user files and fail-local diagnostics.

### Five-layer analysis

- **Responsibility:** `@neko/text-editor-domain` owns text admission, unsaved document state,
  revisioned edits, dirty/save rules and format-neutral diagnostics. `@neko/screenplay-domain` owns
  Fountain semantics. `@neko/text-editor-webview` owns interaction and presentation. Content owns
  authorized bytes; Host owns Window/View composition; Desktop owns Electron authorization and
  concrete adapter wiring.
- **Dependencies:** Domain packages depend only on host-neutral contracts and pure parsers. The
  Webview depends on domain contracts, CodeMirror, React and shared UI. Search consumes screenplay
  projections. Desktop imports public entries and injects Content ports; no package imports Desktop.
- **Interfaces:** one exact Window document identity, one session edit sequence and one editor command
  family cover user edits and explicit formatting. Agent content authoring remains on the independent
  Workspace-native file path. File publication always uses the loaded Content fingerprint.
- **Extension:** text modes are an exhaustive registry. Markdown, JSON and Fountain each have one
  declared adapter; admitted remaining extensions use the plain-text mode. Adding a semantic mode
  requires one owner adapter and an atomic registry update, not a priority or fallback chain.
- **Testing:** pure parser/session tests prove domain behavior, Webview tests prove editor interaction,
  Desktop producer/consumer tests prove sender and Workbench identity, Search tests prove canonical
  Fountain projection, and a visible Electron scenario proves IME, save, conflict and reopen behavior.

## Goals / Non-Goals

**Goals:**

- Edit and safely save bounded UTF-8 Workspace text files from a package-owned Main View.
- Provide Markdown source/preview, JSON diagnostics/formatting and plain-text modes without building
  a general IDE.
- Establish one canonical Fountain 1.1 parser contract with source ranges, diagnostics and immutable
  screenplay projections for Editor, Search and other read-only semantic consumers.
- Make Fountain authoring practical for Chinese input while keeping standard portable syntax.
- Preserve exact document/session identity, dirty data and external file changes across scene and
  renderer lifecycle boundaries.
- Keep the host-neutral editor port independent from later Agent-native file authoring so neither UI
  lifecycle nor a second parser becomes an Agent write prerequisite.

**Non-Goals:**

- Monaco, VS Code extension hosting, LSP, JSON Schema completion, spell/grammar checking, terminal,
  debugger, source control, collaborative editing or arbitrary code execution.
- Rich JSON tree editing, rendered YAML/XML/HTML, Markdown WYSIWYG or automatic formatting on save.
  Markdown WYSIWYG is a follow-up owned by
  `adopt-gfm-authoring-and-agent-rendering-surfaces`; it does not retroactively add Milkdown to this
  completed CodeMirror source/preview scope.
- FDX import/export, screenplay pagination, production PDF export, edit sequence colors, statistics or a
  complete Final Draft replacement.
- Agent Prompt/Skill/Tool registration, autonomous file mutation or Agent evaluation in this change.
- New-file creation, Save As, rename, move, delete, autosave or crash-recovery journals.
- A universal Editor/Preview/Canvas/Cut session, retained hidden React roots or cross-domain open-view
  catalog.

## Decisions

### 1. Introduce three owners with explicit runtime roles

| Owner                    | Package role and public path                                                                    | Producer / consumer                                                                       | Runtime boundary                    | User-data role                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Text document authoring  | `@neko/text-editor-domain` root and explicit `./testing` entry; host-neutral domain/application | Desktop Main creates Window sessions; Text Editor Webview consumes projections/commands   | No React, Node or Electron          | Owns only the current unsaved buffer, base fingerprint, edit sequence and dirty state; workspace file bytes remain authoritative |
| Text editor presentation | `@neko/text-editor-webview/root`, `./host-adapter`, `./presentation-snapshot`                   | Desktop renderer mounts the Root; Webview submits typed commands                          | Browser/React only                  | Owns cursor, selection, scroll, mode, split ratio and outline presentation; never workspace bytes or save authority              |
| Screenplay semantics     | `@neko/screenplay-domain` root                                                                  | Text Editor, Search and other read-only consumers use the same normalized Fountain result | Pure host-neutral parser/projection | Owns no durable screenplay copy; normalized documents and indexes are disposable projections of Fountain source                  |

`@neko/content` remains the only Content I/O owner. `@neko/host` remains the only Workbench layout
owner. `apps/neko-desktop` retains only Electron sender/window/view lifecycle, trust-boundary decode,
workspace authorization, concrete Content port construction, public-package wiring and product-scene
composition. Those behaviors require the Application boundary because they depend on Electron
`webContents`, Window identity, preload exposure and native close lifecycle; text rules and save
transactions do not and therefore stay out of `apps/*`.

Creating a dedicated screenplay domain avoids making Search and other semantic consumers depend on an
editor UI capability. A separate screenplay Webview package is not created because the initial outline,
completion and preview exist only as adapters inside the Text Editor Root and do not yet form an
independent runtime or dependency closure.

**Alternative considered:** add editing directly to `@neko/preview-webview`. Rejected because Preview
is a read-only authorized-content consumer with a different lifecycle and no write authority.

**Alternative considered:** put the document session in Desktop Main. Rejected because edit sequence,
dirty/save and edit-validation rules are host-neutral business behavior that can be tested without
Electron.

### 2. Keep workspace bytes authoritative and use one document session

Opening an admitted file creates or focuses one `TextDocumentSession` per exact Window + Workspace
`ContentLocator`. The session stores:

```text
documentSessionId
workspace/project/document identity
format mode
base ContentFingerprint
working UTF-8 source
document edit sequence
dirty state
domain diagnostic projection
```

The renderer receives an immutable session projection. It submits ordered, non-overlapping text
changes with the exact session identity and `expectedEditSequence`. The domain validates bounds, applies
the change atomically, increments the edit sequence and recalculates only the selected format adapter.
Unknown sessions, stale revisions, invalid ranges and mismatched document identities fail only that
command.

The edit sequence is an allowed concurrency token, not an internal format version. Its owner is the exact
`TextDocumentSession`; its consumer is the renderer transaction path; its invariant is that a command
can apply only to the source snapshot it observed. Without it, concurrent renderer and format commands
could silently apply to the wrong offsets. It can be removed only if the session is replaced by an
equivalent atomic concurrency primitive. It never selects a contract shape, migration path or parser
generation.

Save encodes the current source and calls the injected `AuthorizedWorkspaceWriter` with
`conflict: 'replace'` and the loaded `expectedFingerprint`. Success replaces the base fingerprint and
clears dirty state only for the saved edit sequence. `content-changed` or `content-conflict` preserves the
working buffer and exposes explicit Reload/Keep Editing actions; there is no forced overwrite,
automatic merge, stale-cache write or fallback writer. Reload requires explicit confirmation when
dirty and performs one fresh authorized read.

The session accepts UTF-8 with optional BOM and a consistent LF or CRLF line ending. It preserves the
loaded BOM and line-ending convention on save. Invalid UTF-8, mixed line endings and files above the
bounded admission limit remain readable through an explicit Preview action but are rejected for
editing with diagnostics; Text Editor never silently normalizes their bytes.

**Alternative considered:** let CodeMirror own the durable buffer and send the whole document on
save. Rejected because renderer unload and stale writes would have no single Window document owner or
concurrency boundary. Agent-native writes remain external file changes rather than another editor
session consumer.

### 3. CodeMirror 6 is the browser editing engine, not the document authority

`@neko/text-editor-webview` uses the modular MIT CodeMirror 6 packages: state, view, commands,
language, Markdown and JSON. It does not install Monaco or a VS Code compatibility layer. CodeMirror
transactions are translated into the canonical domain text-change command; accepted projections
reconcile the editor state by exact edit sequence.

The mode registry is exhaustive:

- `markdown`: CodeMirror Markdown highlighting plus `@neko/markdown` /
  `MarkdownDocumentView` for safe preview.
- `json`: CodeMirror JSON highlighting, `JSON.parse`-backed source diagnostics and an explicit
  deterministic two-space format command. Formatting is an ordinary full-document edit and never
  saves implicitly.
- `fountain`: CodeMirror decorations, completion and outline derived from
  `@neko/screenplay-domain`; no second Fountain grammar exists in the Webview.
- `plain-text`: editing for the remaining existing Preview text-extension allowlist without semantic
  rendering or invented diagnostics.

Markdown and Fountain expose an icon-labelled segmented `Edit | Preview | Split` control. JSON and
plain text remain in Edit. Preview parse failures render localized diagnostics and never mutate the
working source. CodeMirror browser history provides immediate typing undo/redo while the session
projection remains the accepted working source; undo/redo transactions enter the same revisioned
command path.

During IME composition, the Webview suppresses completion, formatting and semantic reparsing that
would replace the composing range. It commits the composed text as one accepted edit at composition
end, then refreshes diagnostics and projections. A Root unmount cannot discard an accepted dirty
buffer.

**Alternative considered:** use Prism/Shiki. Rejected because they provide rendering/highlighting,
not an editable document model. Monaco is deferred because its Worker and bundle cost buy IDE/LSP
features outside the requested scope.

The follow-up `adopt-gfm-authoring-and-agent-rendering-surfaces` change may atomically replace the
Markdown `Edit | Preview | Split` presentation with Milkdown `Rich | Source | Split`. CodeMirror
remains the complete Source and non-Markdown editor; this change does not treat Milkdown's fenced-code
CodeMirror component as a replacement or add a parallel document authority.

### 4. Use `fountain-js` as one grammar engine behind an OpenNeko contract

`@neko/screenplay-domain` pins `fountain-js` 1.2.4 (MIT), which implements Fountain 1.1 and supports
forced scene headings and `@` character cues. The package wraps its public token output in one pure
`parseFountainDocument(source, policy)` contract. A deterministic source-block mapper associates
ordered tokens with exact source offsets without classifying Fountain syntax itself. If a token
cannot be associated unambiguously, the whole parse returns a parser diagnostic; it never invokes
the retired Search classifier or another parser.

The normalized result preserves the original source and contains source-backed elements, title-page
fields, scenes, character occurrences, dialogue ownership, outline sections, scene numbers and
typed diagnostics. Element identity is valid only within the associated document/session edit sequence;
source fingerprints express freshness and are not persistent entity identity.

The wrapper does not consume or expose `fountain-js` HTML. Screenplay preview renders normalized
elements through React with inert text, shared theme tokens and CJK-capable font fallbacks. This
avoids a raw-HTML rendering path and lets one projection drive preview, outline, completion and
Search.

Conformance fixtures cover official Fountain 1.1 constructs, title pages, escaped syntax, notes,
boneyards, dual dialogue, forced elements, CRLF, duplicate text, simplified/traditional Chinese,
Japanese, Korean and mixed Latin/CJK content. The parser has a deterministic source-size limit.

**Alternative considered:** use Markdown parsing plus screenplay prompt conventions. Rejected
because it creates a private, prompt-dependent screenplay language and loses deterministic scene,
character and interchange semantics.

**Alternative considered:** use parser-generated HTML as Preview authority. Rejected because it
loses source association, couples domain output to presentation and creates an unnecessary HTML
trust boundary.

### 5. Chinese support uses standard Fountain forcing, not localized grammar aliases

Unicode action and dialogue text is preserved exactly. CJK character cues use standard `@小橘`
forcing; localized scene headings use standard `.内景 客厅 - 夜` forcing, while portable English
structural tokens such as `INT. 客厅 - 夜` remain supported. The editor may offer localized labels
and completion inserts, but it does not rewrite or persist proprietary `角色:` or `场景:` aliases.

Diagnostics identify likely unforced CJK character cues and ambiguous scene-like lines without
silently reclassifying them. The Preview uses CJK-aware wrapping, non-negative letter spacing and a
font stack that can render the admitted scripts. UI text, accessibility names and diagnostic codes
are localized by package bundles for the currently supported `en` and `zh-cn` locales; the domain
emits stable codes and parameters rather than user-facing English strings.

### 6. Workbench and Resource Browser use one exact open path

The canonical `DesktopWorkbenchViewKind` gains `text-editor`. Its View ref carries exact project,
workspace, document, editor-session, View and View-instance identity. Opening the same document in
the same Window focuses the existing View/session. Explicit side-open follows the existing two-Main
group limit; it creates an independent session only for a different exact document.

Resource Browser derives an `edit-text` capability from the Host-projected admitted extension and
submits one exact open intent. The existing default path that opens admitted text as `preview` is
deleted. Preview remains available only as a distinct explicit read-only action and as the user
choice for unsupported/oversized text; it is not an automatic fallback after Text Editor failure.

The active `compose-desktop-workbench-scenes` change is a prerequisite. Implementation updates its
final canonical View union and renderer composition atomically rather than registering a second
editor View catalog or preserving the old union behind an alias.

### 7. Session and presentation lifecycles remain separate

Workspace file bytes are durable user facts. A dirty `TextDocumentSession` is an execution/data-loss
protection condition and may remain in Main after its React Root unmounts. A clean invisible session
is released and reconstructed from the same locator and fingerprint when its View is shown again.
Closing a dirty View or its Window presents Save / Discard / Cancel through the exact session; scene
switching merely unmounts the Root and preserves the dirty session.

The package-owned presentation snapshot contains only mode, cursor/selection, scroll, split ratio
and outline visibility, keyed by exact View/document identity. It contains no file bytes, Content
fingerprint, parser projection or process/resource handle. Invalid snapshots reset only that View to
the canonical fresh presentation and emit a diagnostic without affecting the file, dirty session or
sibling Views.

Crash recovery and autosave are excluded from this change. Normal Window/application close is still
guarded by Main-owned dirty sessions; abrupt process termination remains a documented residual risk.

### 8. Agent-native file changes remain external to the editor port

The open/apply-edits/save application port exists only for the Window Text Editor transaction and its
exact `TextDocumentSession`. Agent authoring does not open or reuse that session, does not submit editor
edit sequences, and does not depend on a mounted editor Root. It reads and writes Fountain and other
content documents through the canonical Workspace-native file path using exact file identity and
freshness protection owned by that path.

An Agent write is therefore an external Workspace file change from the editor's perspective. A clean
editor session reloads the new authoritative bytes; a dirty session preserves its working buffer and
shows an explicit conflict instead of merging, overwriting or redirecting either writer. The canonical
Fountain parser remains available to derive diagnostics and read-only semantic projections from the
authoritative source, but it is not a prerequisite authoring port and owns no second screenplay copy.
This change does not register an Agent Tool, Prompt or Skill and does not grant Agent write authority.

### 9. Failures are local and observable

Domain errors are closed unions with stable code and parameters. Invalid UTF-8, admission limits,
stale edit sequence, external fingerprint conflict, parser association failure and missing session each
reject only the affected open/edit/save/projection. One malformed Fountain file cannot disable the
Text Editor registry, Search for sibling sources, the Workspace or Desktop startup.

Renderer restart requests one exact session projection. Missing clean sessions reopen from the same
authorized locator; missing dirty sessions report data unavailable and never substitute the active,
recent or first document. No catch-all handler, wildcard format registry, parser fallback, empty
successful result or automatic file rewrite is allowed.

## Risks / Trade-offs

- **[Risk] `fountain-js` has no native source ranges** -> Keep grammar classification in that single
  engine, add a deterministic ordered source mapper, fail the parse on ambiguous association and
  gate implementation on official/duplicate-text/CJK conformance fixtures.
- **[Risk] Fountain is permissive, so structurally poor AI output may still parse as action** -> Emit
  explicit ambiguity diagnostics and require later AI authoring to validate expected scenes and
  character cues; parsing does not claim narrative quality.
- **[Risk] CodeMirror and language packages increase renderer bundle size** -> Import only modular
  packages, lazy-load the Text Editor Root by exact View kind and measure the packaged chunk.
- **[Risk] Main-owned dirty buffers consume memory while their Roots are absent** -> Bound editable
  file size, retain only dirty sessions as protected, release clean invisible sessions and test
  multi-document cleanup.
- **[Risk] No crash-recovery journal can lose unsaved work after abrupt process termination** -> Guard
  normal View/Window/application close and document this residual risk; add crash recovery only
  through a separate OpenSpec with explicit storage authority and cleanup semantics.
- **[Risk] Workbench contracts are concurrently changing** -> Treat
  `compose-desktop-workbench-scenes` as a prerequisite and modify its final canonical union once;
  reject merge-time aliases or parallel registrations.
- **[Trade-off] Mixed-line-ending text is read-only** -> Avoid silent byte normalization in the MVP;
  a future change may add an explicit conversion workflow.
- **[Trade-off] No LSP or schema completion** -> JSON syntax diagnostics and Fountain semantic
  completion remain predictable and lightweight but do not provide VS Code-level intelligence.

## Migration Plan

1. Finish or rebase onto `compose-desktop-workbench-scenes`, then add the package topology, explicit
   exports, dependency declarations, product-status entries and boundary tests.
2. Establish `@neko/text-editor-domain` contracts/session behavior and
   `@neko/screenplay-domain` parser/projection conformance before exposing UI.
3. Replace Search Fountain extraction with the screenplay projection and delete the old classifier
   and Content Fountain DTO in the same boundary.
4. Add the CodeMirror Root and format adapters, then add the exact Desktop Main/preload/renderer port
   and `text-editor` Workbench View.
5. Switch Resource Browser admitted-text open routing atomically, retain only the explicit Preview
   action and add close/conflict/reload behavior.
6. Run package, boundary, visible Electron, CJK/IME and UI validation before declaring the capability
   active.

There is no project-file migration. Rollback first removes the Resource Browser edit capability so
no new sessions can open, requires users to save or discard protected dirty sessions, restores the
explicit read-only Preview action as the only text action, and then removes the View/package wiring.
Workspace bytes remain unchanged throughout rollback.

## Open Questions

None. Crash recovery, FDX/PDF, additional locales and actual Agent authoring are deliberately scoped
as separate changes rather than left as implementation ambiguity.
