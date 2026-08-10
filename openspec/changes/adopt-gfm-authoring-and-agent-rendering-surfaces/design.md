## Context

The Text Editor now uses lazy Milkdown for Markdown Rich and CodeMirror for Source. The Agent Webview
uses `@neko/markdown` `MarkdownStreamingSession` plus a package-local React renderer for GFM,
Mermaid, resource references, semantic spans, creative tables and composite content. Streamdown
2.5.0 is installed only as a dev spike and has no production registration.

The current Agent layout projects blocks rather than turns. Each Markdown block becomes a primary
result, flushes an adjacent process group and receives a `Response` header. The process group then
renders Tool and Thinking presenters that add their own headers, cards and disclosure state. A real
Desktop run therefore exposes several process disclosures and nested controls around a single final
answer. The new design moves grouping to a turn-level presentation projection before changing the
Markdown engine.

The implementation improves creator editing and preserves incomplete Agent output without creating another
authoritative document, an Agent-to-editor mutation route or multiple successful render paths in one
owning surface.

### Five-layer analysis

- **Responsibility:** `@neko/markdown` owns syntax/profile semantics; Text Editor Domain owns the
  accepted Window working source; Text Editor Webview owns Rich/Source interaction; Agent application
  projection owns exact Timeline block roles; Agent Webview owns turn presentation and disclosure
  state plus browser presentation scheduling; Desktop Shell owns command-scoped pending presentation;
  Content owns authorized Workspace bytes.
- **Dependencies:** Markdown core remains host-neutral. Milkdown is isolated behind an explicit
  browser-only `@neko/markdown` entry consumed by Text Editor and Canvas; CodeMirror remains a
  browser-only Text Editor dependency. Streamdown is a dev-only Agent Webview spike dependency.
  Desktop imports only package public Roots and typed ports.
- **Interfaces:** one GFM profile and corpus constrain each surface. Rich and Source submit ordered
  changes to one exact Text Document session. Agent text, process evidence, deliverables, diagnostics
  and approvals retain exact Timeline content-block identity while a disposable turn projection
  decides visual placement. Streaming scheduling consumes the same ordered Timeline patches and
  changes no Host contract; file artifacts consume Workspace-relative file identity.
- **Extension:** GFM additions and Neko extensions enter through explicit profile/extension contracts
  and atomic surface registration. No first-compatible parser, renderer priority, source rewrite or
  fallback chain is allowed.
- **Testing:** deterministic corpus and round-trip tests prove syntax behavior; Webview tests prove
  editor, stream lifecycle, bounded publication and final convergence; Desktop renderer tests prove
  pending-scope isolation; visible Electron tests prove IME, CSP, layout, external changes and user
  workflows. Agent Evaluation is excluded for pure rendering scheduling but retained for the existing
  Desktop event-projection and native file-authoring behavior.

## Goals / Non-Goals

**Goals:**

- Provide a creator-oriented WYSIWYG Markdown editor without losing source access.
- Make one public GFM profile portable for humans and file-native Agents.
- Render incomplete and final Agent text through one stable message surface.
- Present one Assistant turn as a primary answer document, typed deliverables and at most one bounded
  activity disclosure.
- Keep ordinary progress narration, Tool execution and Thinking trace secondary without hiding errors,
  approvals or deliverables.
- Preserve outline, references, syntax highlighting, resource projection and fail-visible security.
- Keep `.md` bytes and the existing Text Document session as the only file/working-source authorities.

**Non-Goals:**

- MDX, JSX, arbitrary component execution, collaborative OT/CRDT or a user-visible Neko Markdown
  file format.
- Using Milkdown as the Agent chat renderer or Streamdown as a document editor/Artifact authority.
- Replacing CodeMirror for JSON, YAML, Fountain, TXT, HTML or complete Markdown source editing.
- Routing Agent file changes through Milkdown/ProseMirror or CodeMirror transactions.
- Registering the current and candidate Agent renderers in parallel or retaining either as fallback.
- Persisting collapsed state as a business fact, reordering the authoritative Timeline or inferring a
  deliverable from a tool name or arbitrary JSON payload.

## Decisions

### 1. Assign one owner to each presentation intent

| Intent                 | Owner / engine                                 | Input authority                        | Lifecycle                          |
| ---------------------- | ---------------------------------------------- | -------------------------------------- | ---------------------------------- |
| Markdown Rich engine   | `@neko/markdown` browser entry / Milkdown      | caller-owned controlled source         | mounted visible browser Surface    |
| Markdown file edit     | `@neko/text-editor-webview` Rich adapter       | exact Text Document session projection | mounted visible editor View        |
| Canvas Markdown edit   | `@neko/canvas-webview` node adapter            | exact Canvas Markdown node             | explicitly activated node Surface  |
| Markdown Source edit   | `@neko/text-editor-webview` / CodeMirror 6     | same exact session projection          | mounted visible editor View        |
| Other text edit        | `@neko/text-editor-webview` / CodeMirror 6     | same session contract                  | mounted visible editor View        |
| Agent text message     | `@neko/agent-webview` / canonical text adapter | exact Timeline content block           | partial delta through final state  |
| Tool/Approval/Artifact | owning typed React presenter                   | typed Timeline/domain projection       | exact block lifecycle              |
| Markdown semantics     | `@neko/markdown`                               | source string/revision                 | disposable host-neutral projection |

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

The common controlled Milkdown Surface is exported only from an explicit browser entry. It owns
Milkdown creation/destruction, GFM parser/serializer registration, composition handling, history,
round-trip mutation gating, reconciliation and disposable focus/undo/redo/heading actions. It does
not own a file session, Canvas document, edit sequence, Host port, media lease or persisted buffer.
Callers provide the accepted source and apply emitted source through their exact owning command.

Text Editor wraps the Surface with its existing ordered edit queue, Text Document projection and
authorized media presentation extension. Canvas wraps the same Surface with an exact-node update and
does not import Text Editor contracts or runtime. A Canvas Markdown node renders a compact, read-only
WYSIWYG projection by default. Selection only exposes node operations; explicit double activation
enters Rich mutation, and leaving selection or pressing Escape exits editing. Unsupported constructs
remain readable and disable only Rich mutation with a node-local diagnostic. Raw Markdown textarea
editing is not selected implicitly and Canvas does not gain a second Text Document session.

### 4. Narrow Agent Markdown responsibility and reopen the atomic Streamdown gate

Streamdown 2.5.0 was evaluated as a sole Agent text-content renderer because it includes `remend`,
GFM, React components, block memoization and hardening. The original spike verified completed GFM,
CJK, raw HTML/URL hardening and stable completed-block identity.

The spike covered incomplete emphasis/link/fence/table/list, CJK, stable content-block identity,
scroll anchors, code highlighting, Mermaid, safe links/raw HTML, resource references, semantic spans,
creative tables and typed sibling blocks. Passing parity would have required Neko extensions to enter
through package-owned remark plugins/custom components or typed siblings, not ad hoc source
preprocessing or a Streamdown fork.

The candidate did not preserve incomplete emphasis and had no direct owner-aware path for Workspace
resource references, semantic source spans, Canvas creative tables, current Mermaid feedback or
structured artifacts. Its isolated core bundle was 507,659 bytes minified and 151,943 bytes gzip,
before package adapters. That dated no-go remains evidence against assigning those business and
extension responsibilities to Streamdown.

The renewed gate evaluates a smaller contract: portable GFM, bounded incomplete suffixes, CJK,
hostile markup, stable completed blocks, safe external links, authorized image projection and
explicit Mermaid presentation. Tool, approval, evidence, deliverable, Diff, Artifact, creative table
and owning-domain results remain typed siblings. Streamdown default styles and permissive resource
settings are not accepted; the package adapter supplies exact components, hardening and theme.

The 2026-08-10 narrowed rerun passes portable GFM/CJK, incomplete-suffix visibility, stable completed
blocks and hostile HTML/URL hardening. It still renders `[[resource]]` and `![[resource]]` as ordinary
text and cannot consume the existing owner-aware authorized resource projection without a new
package-owned source-range plugin. That required hard gate fails, so the current normalized presenter
remains canonical and Streamdown stays dev-only. Evaluation creates no runtime fallback, feature flag,
renderer priority or streaming/final switch.

### 5. Project one readable Assistant turn

The authoritative Timeline order and block identities remain unchanged. A disposable Webview
projection groups them into three presentation roles:

1. `answer`: the final or currently terminal answer Markdown document;
2. `deliverable`: typed user-facing media, file, Diff, Artifact or owning-domain result;
3. `activity`: progress narration, Thinking, Tool execution and non-deliverable evidence.

The application-owned Timeline projection must expose the role when runtime semantics know it. The
Webview may derive the terminal answer from exact block order and terminal run state only as a
disposable read model; it cannot persist that classification or rewrite the Timeline. Tool names do
not decide whether output is evidence or a deliverable.

A completed turn renders at most one compact activity summary before the prominent final answer and
deliverables, matching the processing-to-result reading order. Expanding it renders a flat activity
list with no nested Thinking or Tool disclosure cards.
Running turns expose one current activity status. Failed Tool calls and pending approvals remain
visible and actionable even when prior completed activity is collapsed.

The activity summary title reports Turn elapsed time (`Processing …` while active and `Processed …`
after completion), not the implementation-oriented `Process records` label. Completed duration is
the interval from the earliest item `createdAt` owned by the Turn through the authoritative
`completion.completedAt`. The active label uses the same earliest timestamp and a disposable Webview
clock. Tool durations remain optional row-level diagnostics and are never summed into Turn duration,
because Tool calls may overlap. Tool and Thinking counts remain secondary metadata visible only in
the expanded activity detail.

The expanded activity list iterates one ordered projection built directly from the surviving Timeline
items. It does not regroup by content type or reconstruct sequence from separate Thinking, Tool,
progress or evidence arrays. Pending approvals and failed Tool calls are projected into the always-
visible actionable role before the activity summary, so collapse state cannot conceal them.

Read-only pages returned by document/image inspection are evidence owned by their exact Tool item.
Their thumbnail gallery is rendered beneath that Tool row inside the activity timeline. Clicking a
thumbnail opens the authorized full projection or exact document location. A compact overflow menu
offers copy-reference and Canvas handoff when those typed operations are available; raw JSON and a
persistent information button are not primary user actions. Only typed generated, published or saved
outputs enter the post-answer deliverable region.

Ordinary answer Markdown has no per-block `Response` label, file icon or repeated avatar. The turn
owns one assistant identity gutter and one action/timestamp area. Text uses a constrained reading
column; tables, Diff and media may enter a wider lane without expanding paragraph measure.

### 6. File-native Agent output remains outside editor transactions

Agent chat deltas are transient Timeline projections rendered by the package-local Agent presentation
surface. When an Agent creates or changes `.md`, the canonical Workspace file Tool publishes through
the Content freshness/CAS boundary. An open clean Text Document session reloads from the file; a dirty
session retains its source and shows an external-change conflict. Neither Agent presentation output
nor Milkdown/CodeMirror view state is the successful artifact fact.

After publication, Resource Browser/Text Editor reopens or reloads the actual file. A chat preview is
not promoted into the editor by copying renderer DOM or a Milkdown transaction.

### 7. Keep dependencies lazy and package-owned

Milkdown enters only lazy Rich chunks in Text Editor and explicitly activated Canvas Markdown nodes.
It is not part of the ordinary Canvas node-reading path. Streamdown is dev-only and enters no
production chunk. CodeMirror remains absent from Canvas/Cut/Preview startup chunks;
optional code highlighting and Mermaid dependencies must not be duplicated when an existing
package-owned component can be reused without creating a second renderer path.

Desktop Vite pre-optimizes the exact third-party Milkdown import specifiers used by that lazy chunk.
This prevents the first development Rich mount from triggering a dependency-discovery page reload;
the Desktop config still imports only the Text Editor public Root and owns no editor state or renderer
selection policy.

Before implementation, record current and candidate chunk sizes, first-render time, sustained delta
update cost and long-message/long-document memory. Bundle cost alone cannot override correctness,
but a candidate exceeding the accepted Desktop budget does not pass the spike.

### 8. Keep active output interactive without weakening turn identity

Agent run state, composer availability, Markdown presentation work and Desktop command pending state
are separate owners:

- The current Turn freezes only the model/generation configuration captured by that Turn. The composer
  remains editable, Stop remains available and eligible Agent-mode plain text continues through the
  existing exact queue contract. Attachments, context references and action triggers remain unavailable
  for queueing until their runtime contract can carry an immutable queued-input snapshot.
- The Timeline projection replica still commits every ordered patch. The Agent Markdown registry may
  accumulate append-only source for one short browser presentation interval after an initial visible
  snapshot, parse only the latest accumulated source for that interval, and publish one coherent
  snapshot. It must preserve every byte, flush completion synchronously, and reject replacement,
  finalization or identity mismatches through the existing fail-visible path.
- While a newer append is awaiting presentation, the canonical Markdown component keeps displaying the
  last coherent normalized snapshot. It does not render raw text, switch renderer or treat delayed
  presentation as final. Semantic extensions consume the same displayed snapshot source.
- Desktop Shell tracks scene, Workbench layout, PrimarySidebar/catalog and composer-target mutations by
  owning scope. A scene transition may block controls whose identity it replaces; a layout mutation may
  briefly block layout controls; neither an Agent run nor an unrelated sidebar/target command disables
  the other scopes.

This keeps urgent browser input and pointer tasks schedulable without changing AgentSession, queue,
projection attachment, Markdown profile or file authority. The bounded presentation interval is a
discardable Webview scheduling policy, not a cache, alternate data source or persisted state.

### 9. Reconstruct one persisted Pi turn before Webview presentation

Live Timeline projection already gives one user turn one assistant message owner. Persisted Pi history
contains multiple assistant entries for a tool-using turn because each provider iteration is recorded
around Tool results. `@neko/agent-runtime` history projection, not the Webview, owns the conversion of
that provider transcript into product `Message` records.

The canonical history projector segments the active Pi branch at user-message boundaries. Within one
segment it:

- creates at most one successful assistant `Message`, owned by the first assistant Pi entry;
- appends assistant text, Thinking and Tool blocks in exact entry/content order;
- binds each Tool result to its exact preceding Tool call without creating another assistant message;
- retains entry-derived block identities and the first assistant timestamp; and
- closes the segment only when the next user message begins.

A terminal provider-error entry remains a separate typed error message so the existing actionable
diagnostic is not hidden by normal turn content.

An orphan Tool result, unsupported role or invalid structured user presentation remains a local
projection error. The projector does not search another turn, merge by Tool name, use timestamps as a
compatibility heuristic or fall back to the previous per-entry presentation. The Webview receives the
same one-message turn shape for live and reopened conversations and applies the same
answer/deliverable/actionable/activity presenter once.

History projection must also carry the same presentation timing facts as live Timeline projection.
It derives the first item timestamp and terminal completion timestamp while segmenting the persisted
turn, then emits the canonical `Message` projection once. The Webview must not infer a different
reopened duration from mount time, block-type grouping or Tool durations.

This is a canonical projection from the authoritative Pi transcript, not transcript mutation or
migration. Raw Pi entries remain unchanged and continue to own provider continuation history.

### 10. Evaluation disposition for Turn timing and evidence interaction

The summary label, duration arithmetic, exact sequence, role placement and thumbnail control contract
are deterministic presentation behavior. They are `excluded` from a new model Judge and are accepted
by Timeline/history projector tests plus Agent Webview presenter/component tests. The existing
`agent-runtime.stream-delivery` and persistence/resume dispositions are reused for the unchanged real
Agent event path; no Prompt, Skill, Tool routing, provider or model behavior changes.

Visible Desktop validation remains applicable because the hierarchy, disclosure and thumbnail actions
are user-visible. It must inspect active/completed timing, collapsed/expanded sequence, an actionable
failure or approval, ReadImage evidence under its Tool row, final answer placement and a true generated
deliverable. If the configured visible Desktop/provider boundary is unavailable, record the exact
blocker and do not substitute deterministic DOM tests for visual acceptance.

The canonical Turn activity summary also replaces the older conversation-level execution status as
soon as that Turn owns a visible timing record, including when its only visible blocks are failed Tools.
The Webview must never show both clocks for one running Turn. Consecutive completed Tool calls with the
same exact typed target may be compacted into one group regardless of success, but the group remains
actionable when any call failed and preserves each call and diagnostic in its disclosure. Pending
approval calls are never compacted.

## Canonical Paths

```text
Workspace .md -> Content read -> TextDocumentSession accepted source
  -> Milkdown Rich or CodeMirror Source -> revisioned edit command
  -> accepted source -> fingerprint-CAS save -> Workspace .md
```

```text
Pi/AgentSession Timeline blocks -> exact turn/block identity and terminal state
  -> package-owned turn projection + earliest item/completion timing
  -> actionable / elapsed activity / answer / deliverable
  -> one canonical Agent text surface for answer Markdown
```

```text
Persisted Pi branch entries -> user-turn segmentation in Agent runtime history projector
  -> one restored assistant Message with ordered typed blocks
  -> the same package-owned Webview turn projection used by live output
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
3. Replace block-level layout with one turn projection and activity disclosure.
4. Re-spike Streamdown against the narrowed text-only gate and either switch atomically or record the
   renewed no-go without registration.
5. Run deterministic, visible Desktop and adjacent regression validation; archive the change only
   after replaced paths and dependencies are absent.
