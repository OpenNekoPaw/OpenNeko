## Context

The Text Editor now uses lazy Milkdown for Markdown Rich and CodeMirror for Source. The Agent Webview
uses `@neko/markdown` `MarkdownStreamingSession` plus a package-local React renderer for GFM,
Mermaid, resource references, semantic spans, creative tables and composite content. Streamdown
2.5.0 is installed only as a dev spike and has no production registration.

The implementation improves creator editing and preserves incomplete Agent output without creating another
authoritative document, an Agent-to-editor mutation route or multiple successful render paths in one
owning surface.

### Five-layer analysis

- **Responsibility:** `@neko/markdown` owns syntax/profile semantics; Text Editor Domain owns the
  accepted Window working source; Text Editor Webview owns Rich/Source interaction; Agent Webview
  owns message presentation; Content owns authorized Workspace bytes.
- **Dependencies:** Markdown core remains host-neutral. Milkdown and CodeMirror are browser-only Text
  Editor dependencies. Streamdown is a dev-only Agent Webview spike dependency. Desktop imports only
  package public Roots and typed ports.
- **Interfaces:** one GFM profile and corpus constrain each surface. Rich and Source submit ordered
  changes to one exact Text Document session. Agent message text consumes one Timeline content-block
  identity; file artifacts consume Workspace-relative file identity.
- **Extension:** GFM additions and Neko extensions enter through explicit profile/extension contracts
  and atomic surface registration. No first-compatible parser, renderer priority, source rewrite or
  fallback chain is allowed.
- **Testing:** deterministic corpus and round-trip tests prove syntax behavior; Webview tests prove
  editor and stream lifecycle; visible Electron tests prove IME, CSP, layout, external changes and
  user workflows. Agent Evaluation is excluded for pure rendering correctness but retained for the
  separate native file-authoring behavior.

## Goals / Non-Goals

**Goals:**

- Provide a creator-oriented WYSIWYG Markdown editor without losing source access.
- Make one public GFM profile portable for humans and file-native Agents.
- Render incomplete and final Agent text through one stable message surface.
- Preserve outline, references, syntax highlighting, resource projection and fail-visible security.
- Keep `.md` bytes and the existing Text Document session as the only file/working-source authorities.

**Non-Goals:**

- MDX, JSX, arbitrary component execution, collaborative OT/CRDT or a user-visible Neko Markdown
  file format.
- Using Milkdown as the Agent chat renderer or Streamdown as a document editor/Artifact authority.
- Replacing CodeMirror for JSON, YAML, Fountain, TXT, HTML or complete Markdown source editing.
- Routing Agent file changes through Milkdown/ProseMirror or CodeMirror transactions.
- Registering the current and candidate Agent renderers in parallel or retaining either as fallback.

## Decisions

### 1. Assign one owner to each presentation intent

| Intent                 | Owner / engine                              | Input authority                        | Lifecycle                          |
| ---------------------- | ------------------------------------------- | -------------------------------------- | ---------------------------------- |
| Markdown Rich edit     | `@neko/text-editor-webview` / Milkdown      | exact Text Document session projection | mounted visible editor View        |
| Markdown Source edit   | `@neko/text-editor-webview` / CodeMirror 6  | same exact session projection          | mounted visible editor View        |
| Other text edit        | `@neko/text-editor-webview` / CodeMirror 6  | same session contract                  | mounted visible editor View        |
| Agent text message     | `@neko/agent-webview` / normalized renderer | exact Timeline content block           | partial delta through final state  |
| Tool/Approval/Artifact | owning typed React presenter                | typed Timeline/domain projection       | exact block lifecycle              |
| Markdown semantics     | `@neko/markdown`                            | source string/revision                 | disposable host-neutral projection |

Different intents may use different engines; one intent cannot select an engine because another
failed. Milkdown is never mounted inside Agent message content. Streamdown is never used for
Workspace file editing or final Artifact authority. Typed sibling blocks do not pass through
Markdown.

### 2. Define one public GFM profile, not a private dialect

`OpenNekoGfmProfile` follows GFM 0.29-gfm over CommonMark:

- autolink literals;
- strikethrough with one or two tildes;
- tables and alignment;
- task-list items;
- tagfilter behavior;
- CommonMark reference links, fenced code, block quotes, lists and raw HTML source nodes.

Raw HTML is preserved as source/semantic evidence but inert by default in browser presentation.
Unsafe URL protocols are rejected at the presentation/trust boundary. Mermaid, Math, footnotes,
mentions and Workspace resource references are separately named extensions with explicit support and
round-trip policy; their presence does not change the meaning of GFM.

`@neko/markdown` owns the profile constant/options, normalized semantic contract, source ranges,
diagnostics and fixtures. Surface engines can use their native parser only in their exact owning
surface and must pass the same corpus. Their third-party AST types never cross package contracts.

**Alternative considered:** expose “Neko Markdown” as a new file format. Rejected because it makes
Agent output less portable and creates an unnecessary user-visible dialect.

### 3. Milkdown owns Rich editing; CodeMirror remains necessary

Milkdown uses its CommonMark and GFM presets behind a Text Editor package adapter. The adapter maps
the current accepted Markdown source into one ProseMirror document and serializes user Rich edits
back to Markdown changes submitted through the existing exact session and edit-sequence command.
Milkdown/ProseMirror state is disposable presentation state, not a durable buffer.

The top-level Markdown control is ordered `Source | Rich | Split`. CodeMirror remains the Source editor
and the only editor for other text modes. Milkdown's CodeMirror-backed code-block component is scoped
to a fenced code node; it cannot edit the containing Markdown source or other file formats.

Fresh Markdown presentation starts in Rich with the source-backed outline visible. The mode selector
and remaining document-specific commands are package-owned but render into the right side of the
active Workbench editor-tab row; the editor body does not create another toolbar. Desktop passes only
the browser presentation target and does not own Markdown mode or command state. Keyboard commands
are scoped to the focused Text Editor Root (or its contributed controls), so two visible Main groups
cannot route an operation through active/recent document identity.

In Split, CodeMirror is the editable left pane and Milkdown is the read-only Rich preview on the
right. Both reconcile only from the same accepted working source. This avoids ambiguous focus,
history and mutation ownership while keeping standalone Rich mode editable. Stale edit sequences
fail visibly. Mode switching cannot copy buffers, replay transactions into the other engine or
select a fallback authority.

Rich serialization may normalize syntactic spelling while preserving declared GFM semantics. The
conformance corpus defines allowed normalization. CommonMark/GFM parsing is intentionally tolerant:
an unfinished delimiter, link, fence, list or table remains visible as the current parsed text or
node and MUST NOT replace the whole Rich surface with an error. When the current source cannot
round-trip without semantic loss, Milkdown still presents its read-only projection while Rich
mutation is disabled with a document-local diagnostic and Source action. The Split preview remains
available because it never serializes back to the source. Unsupported content is never silently
deleted, converted to HTML or rewritten on open.

Rich input can advance ahead of Host acknowledgement because each serialized transaction is submitted
through the exact edit-sequence command queue. The Webview keeps only the latest unacknowledged Rich
source as disposable presentation state and does not reconcile an intermediate acknowledgement over a
newer local ProseMirror document. Commands remain serialized against the last accepted projection; the
pending source is never exposed as file authority, persisted, or consumed by another surface. A rejected
command clears the pending state, reports the exact error and reconciles to the last accepted projection.

A paragraph break at the end of a Rich document can serialize to accepted trailing Markdown whitespace
that parses back without the empty ProseMirror paragraph. When an acknowledgement exactly matches both
the latest Rich serialization and the current local document serialization, reconciliation retains that
disposable local structure and its selection until later input makes the paragraph content explicit. A
different authoritative source or a rejected command still replaces it through the canonical reconcile
path; the empty paragraph never becomes file authority by itself.

The Rich content surface uses the caret, selection and native node interaction as its editing focus
feedback. It does not draw a page-sized focus frame around the full-height ProseMirror document; keyboard
focus remains visible on discrete controls through the shared focus token.

Outline, heading navigation and reference inventory come from `@neko/markdown` source-backed
projections. Milkdown may highlight the selected node, but its DOM is not the Search/Agent outline
authority.

### 4. Streamdown does not pass the atomic replacement gate

Streamdown 2.5.0 was evaluated as a sole Agent text-content renderer because it includes `remend`,
GFM, React components, block memoization and hardening. The spike verified completed GFM, CJK, raw
HTML/URL hardening and stable completed-block identity.

The spike covered incomplete emphasis/link/fence/table/list, CJK, stable content-block identity,
scroll anchors, code highlighting, Mermaid, safe links/raw HTML, resource references, semantic spans,
creative tables and typed sibling blocks. Passing parity would have required Neko extensions to enter
through package-owned remark plugins/custom components or typed siblings, not ad hoc source
preprocessing or a Streamdown fork.

The candidate did not preserve incomplete emphasis and has no direct owner-aware path for Workspace
resource references, semantic source spans, Canvas creative tables, current Mermaid feedback or
structured artifacts. Its isolated core bundle was 507,659 bytes minified and 151,943 bytes gzip,
before package adapters. Correctness failed before sustained-update and long-message performance
acceptance, so those measurements cannot upgrade the decision.

The current `MarkdownRenderer` and Timeline-owned `MarkdownStreamingSession` therefore remain the
only production path. Streamdown stays dev-only as executable evidence. There is no production
import, registration, flag, fallback or partial adoption.

### 5. File-native Agent output remains outside editor transactions

Agent chat deltas are transient Timeline projections rendered by the package-local Agent presentation
surface. When an Agent creates or changes `.md`, the canonical Workspace file Tool publishes through
the Content freshness/CAS boundary. An open clean Text Document session reloads from the file; a dirty
session retains its source and shows an external-change conflict. Neither Agent presentation output
nor Milkdown/CodeMirror view state is the successful artifact fact.

After publication, Resource Browser/Text Editor reopens or reloads the actual file. A chat preview is
not promoted into the editor by copying renderer DOM or a Milkdown transaction.

### 6. Keep dependencies lazy and package-owned

Milkdown enters only the Text Editor Webview lazy Rich chunk. Streamdown is dev-only and enters no
production chunk. CodeMirror remains absent from unrelated Canvas/Cut/Preview startup chunks;
optional code highlighting and Mermaid dependencies must not be duplicated when an existing
package-owned component can be reused without creating a second renderer path.

Desktop Vite pre-optimizes the exact third-party Milkdown import specifiers used by that lazy chunk.
This prevents the first development Rich mount from triggering a dependency-discovery page reload;
the Desktop config still imports only the Text Editor public Root and owns no editor state or renderer
selection policy.

Before implementation, record current and candidate chunk sizes, first-render time, sustained delta
update cost and long-message/long-document memory. Bundle cost alone cannot override correctness,
but a candidate exceeding the accepted Desktop budget does not pass the spike.

## Canonical Paths

```text
Workspace .md -> Content read -> TextDocumentSession accepted source
  -> Milkdown Rich or CodeMirror Source -> revisioned edit command
  -> accepted source -> fingerprint-CAS save -> Workspace .md
```

```text
Pi/AgentSession Timeline text delta -> exact content-block identity
  -> package-local normalized Agent text surface -> final state on the same surface
```

```text
Workspace .md/source revision -> @neko/markdown semantic projection
  -> outline/reference/diagnostic/resource extension consumers
```

Forbidden paths include Agent-to-Milkdown transactions, renderer-authored files, Milkdown DOM as
outline authority, streaming/final renderer switching, old/new renderer registration, raw HTML
execution, fallback parsing and direct Renderer file access.

## User Data And Failure

- No existing file is migrated or rewritten on open.
- A Rich round-trip uncertainty preserves the source and disables only the unsafe Rich edit.
- An invalid GFM/extension projection reports a document-local diagnostic; Source editing and sibling
  documents remain available.
- A canonical Agent presentation failure reports against that content block and cannot switch to a
  candidate renderer or return a successful empty message.
- External Agent writes preserve dirty editor buffers and require the existing explicit conflict flow.

## Rollout

0. Complete the `add-ai-screenplay-authoring` native file authority gate: freshness/CAS overwrite,
   exact `.nkc`/`.otio` denial, and Host-driven clean reload/dirty conflict for open Text Documents.
1. Freeze the GFM profile and cross-surface corpus.
2. Spike Milkdown round-trip/IME/bundle behavior, then register the passing production Rich path.
3. Spike Streamdown against decisive current Agent renderer gates; record the no-go and keep the
   current renderer canonical.
4. Run deterministic, visible Desktop and adjacent regression validation; archive the change only
   after replaced paths and dependencies are absent.
