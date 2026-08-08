## Context

OpenNeko currently has two partially conflicting authoring models. Agent core `Read`/`Write` operates
directly on an authorized Workspace, while the implemented screenplay capability adds three domain
Tools and extends `TextDocumentIdentity` with an Agent Conversation owner. Canvas and Cut already have
headless owning-domain authoring services, but the generic file policy does not yet prevent raw access
to their `.nkc` and `.otio` project documents.

The target separates the paths by the authority carried by the document. Portable content-source
files expose their text as the collaboration contract. Structured project files expose domain
identity, commands and projections as the collaboration contract even when their serialization is
JSON.

### Five-layer analysis

- **Responsibility:** Agent Runtime owns generic Workspace file execution and permission; Text Editor
  owns only an open Window's dirty editing state; Screenplay/Markdown own parsing and diagnostics;
  Canvas/Cut own structured project meaning and mutation.
- **Dependencies:** the native content path depends on the core file access policy and Host-authorized
  Workspace root, not Text Editor or Screenplay application services. Structured capabilities depend
  on owning-domain public ports and codecs, not Renderer state or generic file Tools.
- **Interface:** portable content uses relative file path plus current bytes/fingerprint. Structured
  projects use exact document identity, domain object identity, expected project revision and typed
  operation.
- **Extension:** a format enters the structured path only when an owning package defines cross-field
  invariants and a headless query/authoring contract. JSON syntax or a custom extension alone does not
  make a file structured.
- **Testing:** path tests prove native content never enters Text Editor/Screenplay mutation services,
  protected projects never enter core file read/write, and missing structured operations fail without
  raw-file fallback. Evaluation proves the model selects the native content path in a complete Desktop
  Agent session.

## Decisions

### 1. Classify by authority, not serialization

| Class                      | Examples                                                           | Authoritative collaboration surface              | Agent path                                   |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------ | -------------------------------------------- |
| Portable content source    | Markdown, Fountain, TXT, HTML, subtitles and declared content text | Workspace file bytes                             | core file read/write                         |
| Ordinary user data         | non-domain JSON/YAML/CSV                                           | Workspace file bytes                             | core file read/write                         |
| Structured/spatial project | Canvas `.nkc`, World/scene project documents                       | owning-domain model and project revision         | domain query/authoring capability            |
| Timeline project           | Cut `.otio`, future animation/audio timelines                      | owning-domain timeline and project revision      | domain query/authoring capability            |
| Packaged/fixed deliverable | PDF, EPUB, DOCX, CBZ                                               | source document or owning export/import workflow | inspect/extract or regenerate; no byte patch |

The protected-project set is exact and owner-declared. There is no heuristic based on JSON content,
no first-compatible codec and no fallback from an unknown structured format to ordinary text.

### 2. Content documents use the native Agent file path

The Agent reads, searches, creates and changes portable content through the existing core file Tool
family under one Workspace-scoped file access policy. Model-visible targets remain Workspace-relative;
the Host resolves physical paths and enforces containment and ignore rules.

The successful mutation fact is the resulting file write. Markdown/Fountain parsing, Search indexing,
Text Editor refresh and Preview rendering are downstream projections of those bytes. Invalid content
may produce explicit parser diagnostics after a successful file write; the parser does not silently
repair, reject or reroute the write. Agent behavior may read those diagnostics and perform a later
explicit edit, but there is no automatic repair loop.

Native content authoring does not create `TextDocumentSession`, use an Agent Conversation document
owner, call an editor command or depend on a visible Root. File changes therefore work before any
editor opens and survive editor/renderer lifecycle independently.

### 3. Open editor state treats Agent writes as external changes

Workspace bytes remain authoritative while `TextDocumentSession` owns only the current Window's
accepted dirty buffer and base fingerprint. A clean session may reload an observed Agent file change.
A dirty session preserves its buffer and reports an external-change conflict with explicit Reload or
Keep Editing actions. It does not merge, overwrite, transfer the buffer to the Agent or make the Agent
write appear as an editor transaction.

The canonical core file contract carries the `Read` fingerprint into `Write` replacement and commits
through the atomic Content writer. The implementation does not introduce a screenplay-only writer,
dual write path or editor-owned fallback.

### 4. Structured projects use owning-domain interfaces

Core file access rejects content reads and writes for `.nkc`, `.otio` and every future exact protected
project format. Directory/catalog metadata may reveal the stable project record needed to choose a
target, but raw project bytes are not supplied as an alternate editing surface.

Canvas queries and mutations use Canvas document/node/resource identities plus the expected Canvas
revision. Cut queries and mutations use the exact OTIO document, track/clip/time identities and
expected Cut revision. Both paths remain headless and save through their owning codecs. Selection,
viewport and playhead are interactive presentation state and cannot substitute for document targets.

An unsupported domain operation returns a typed diagnostic. The Agent cannot then call generic
`Read`, `Write`, shell redirection or another provider/adapter against the same protected document.

### 5. Retire the specialized screenplay mutation path atomically

The screenplay capability provider, its three Tool names, prompt fragment, Desktop registration,
Agent-owned Text Document sessions, authoring service and old Evaluation assertions are one replaced
path. Producers, consumers, fixtures, suite mapping and tests switch together; no compatibility
registration or feature flag keeps both paths available.

`@neko/screenplay-domain` continues to parse Fountain for editor preview, outline, diagnostics and
Search. A future read-only semantic projection may be exposed only if a real consumer cannot obtain
the required evidence from native file reads; it must not regain mutation authority.

### 6. Evaluation disposition

The existing `agent-runtime/screenplay-authoring` suite remains the owner but changes disposition to
`update`. The positive case must prove the exact core file Tool writes a durable `.fountain` artifact
without any screenplay Tool or Text Document session. The boundary case must prove generic file access
to `.nkc`/`.otio` is denied and an unavailable structured capability cannot fall back to raw bytes.

Real Evaluation remains required because Tool selection, capability availability and durable artifact
publication change user-visible Agent behavior. Key-free validation is authoring readiness only; one
visible complete Desktop path and one real-provider complete-session path remain required.

## Canonical Paths

```text
Desktop composer -> Pi turn -> core Workspace file Tool -> authorized content-source file
-> file change -> parser/Search/Text Editor/Preview projections
```

```text
Desktop composer -> Pi turn -> exact Canvas/Cut Tool -> owning-domain application service
-> revisioned apply -> owning codec -> .nkc/.otio -> editor projection
```

Forbidden paths are Agent-owned Text Document sessions, screenplay-specific mutation Tools, generic
file access to protected project documents, Renderer mutation, active/recent document fallback,
parser-gated content publication, domain-capability failure followed by raw file fallback and
Evaluation direct-runtime substitution.

## User Data

Native content writes remain inside the authorized Workspace and must replace existing files only with
an exact freshness check. Dirty editor buffers survive external Agent writes and conflicts. Structured
project mutations require an expected domain revision and preserve the existing project on validation
or save failure. Neither path migrates, repairs or normalizes existing user files implicitly.
