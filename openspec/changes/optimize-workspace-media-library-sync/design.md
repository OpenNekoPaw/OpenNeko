## Context

OpenNeko currently represents a project-linked Media Library as a direct
`neko/assets/<libraryName>` directory symlink on Unix and a directory junction on Windows. Project
facts persist ordinary workspace-relative `ContentLocator` values below that path. The link object is
machine-local and exactly excluded from Git, while package/export dereferences only explicitly
referenced bytes.

Desktop-global Media Libraries add another useful indirection:

```text
Project: neko/assets/<name>
  -> Machine-global connection: ~/.neko/media-libraries/<locationKind>/<name>
  -> Physical local, NAS, or synchronized directory
```

This is efficient and lets one global relink repair multiple projects, but a clone or synchronized
workspace contains neither link. Because linked roots are currently derived only from filesystem
entries, the product cannot distinguish "this project needs library X" from "this project has no
libraries". Copying every linked directory into every project would avoid broken links but would
duplicate large media, create divergent sources of truth, and change Media Library ownership.

Existing architecture also explicitly retires `library.json`, path variables, absolute targets, Asset
Source registries, and runtime fallback resolution. The optimization must therefore derive recovery
needs from authoritative project references and keep physical paths in Desktop Main.

### Five-layer analysis

- **Responsibility:** project-document owners know which portable content references are durable;
  the workspace link helper owns symlink/junction mutation; the global Media Library owner knows
  machine-local connections; Desktop composition coordinates them; Assets owns presentation.
- **Dependency:** shared L0 contracts contain no Node paths; Desktop Main performs filesystem,
  picker, content-access, and copy work; renderer receives target-free projections and typed intents.
- **Interface:** requirement and recovery DTOs carry project identity, owner/source fingerprint,
  library name, relative descendants, counts, safe diagnostics, request identity, and plan identity only.
- **Extension:** a future project-document type contributes one reference reader instead of adding
  another Media Library resolver or teaching Assets its file format.
- **Testing:** producer/consumer tests prove reference derivation, exact-name planning, stale rejection,
  path containment, cancellation, snapshot atomicity, retired-path absence, and real Electron flows.

## Goals / Non-Goals

**Goals:**

- Make missing Media Libraries visible and recoverable after Git clone, folder sync, or machine move.
- Preserve symlink/junction as the default zero-copy Media Library mechanism.
- Keep the OS link as the only runtime mapping from library name to physical target.
- Reuse the machine-global Media Library connection as the canonical project-link target for new
  Desktop mutations.
- Validate that a recovery candidate contains the referenced descendants before changing a link.
- Provide a self-contained, atomic portable project snapshot that collects only referenced linked
  bytes.
- Keep the global Asset center and project Resource Browser independent.

**Non-Goals:**

- Synchronizing Media Library bytes, credentials, mounts, or cloud-provider lifecycle.
- Committing symlink objects, physical targets, absolute paths, or global library IDs into projects.
- Reintroducing `library.json`, an Asset Source catalog, `${VAR}` paths, or a runtime mapping service.
- Reading or rewriting unrelated Desktop shell/window state or application preferences as part of Media Library
  recovery.
- Automatically authorizing a same-named directory or mutating links during project open.
- Copying an entire Media Library merely because it is linked.
- Mutating the source project in place during portable snapshot creation.
- Building multi-user conflict resolution or a remote collaboration service.

## Decisions

### 1. Keep symlink as the default and separate link recovery from media collection

Normal project operation continues to reference `neko/assets/<libraryName>/<relativePath>`. Recovery
recreates a machine-local link; it does not copy bytes. A separate "Create portable project snapshot"
operation materializes only referenced linked files into a new destination.

**Alternatives considered**

- **Copy every library on add:** rejected because it duplicates large media, makes project and library
  both appear authoritative, and causes uncontrolled sync/Git growth.
- **Persist absolute targets or variables:** rejected because projects become machine-specific and
  every consumer needs a mapping resolver.
- **Commit symlink objects:** rejected because targets remain machine-local and sync tools handle
  symlinks inconsistently.

### 2. Derive required libraries from authoritative project references

Shared contracts define a `ProjectContentReferenceReader`-style port whose implementations return a
revisioned snapshot of portable locators owned by one project document/domain. Desktop composition
directly combines the fixed Canvas, Cut, Entity representation, and other current owners. It does not
scan arbitrary JSON, infer usage from file extensions, or introduce a feature-package registry.

The host-neutral aggregator extracts canonical `neko/assets/<libraryName>/...` locators, groups them
by portable library name, and retains owner identity plus source fingerprint internally. Renderer projection is
bounded to name, state, reference count, missing count, and safe diagnostic codes. The full locator
set remains in Main for validation and snapshot planning.

The derived projection is rebuildable local state, not a committed project manifest. An unreferenced
linked root remains browsable but is not classified as required.

### 3. Classify symlink state by owner and use only the user-level metadata store

There is no symlink-related JSON authority to retain or migrate. The storage contract is:

| Data                                                                           | Canonical owner                  | Persistence                                            |
| ------------------------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------ |
| Library name to physical target mapping                                        | OS symlink/junction              | `neko/assets/<name>` and the machine-global alias tree |
| Project references and settings                                                | Owning project codecs            | Reviewable JSON, NKC, OTIO, and other project files    |
| Workspace checkout identity                                                    | Workspace identity contract      | Git-ignored `.neko/workspace.json` descriptor          |
| Requirement membership                                                         | Authoritative project references | Rebuilt into memory; no manifest or dedicated table    |
| Requirement/provider fingerprint, freshness, and current projection diagnostic | Local metadata projection owner  | Stable projection rows in user-level `~/.neko/neko.db` |
| Current link availability                                                      | Workspace link inspector         | Recomputed from OS inspection; process memory only     |
| Referenced-media probe cache                                                   | Local media metadata owner       | Existing `media_metadata` workspace partition          |
| Cross-restart snapshot lifecycle and minimal recovery cursor                   | Task owner                       | Existing `tasks` and `task_checkpoints` rows           |
| Raw operational history                                                        | Logger/Journal owner             | Existing JSONL/log files                               |
| Credentials or mount secrets                                                   | Secret owner                     | SecretStorage or system keychain                       |
| Media and retained artifact bytes                                              | File/artifact owner              | Managed files, never SQLite blobs                      |

The actual requirement set and current link availability are cheap, deterministic, and
safety-sensitive, so project open and every recovery plan computes them from current owner facts
and OS inspection. SQLite can accelerate freshness and media probe work but never authorizes a link,
supplies a target, or substitutes for re-reading current project facts. A stale or corrupt cache is
marked stale and rebuilt from files plus OS inspection.

All rows are partitioned by stable `workspace_id`; absolute paths, runtime URLs, active-workspace
fallbacks, global registry roots, and symlink targets are forbidden. No workspace-local SQLite
database is introduced. SQLite unavailable or incompatible fails visibly for durable projection/task
operations; the implementation must not read or write a parallel JSON cache to simulate success.

Desktop Shell and application settings are separate machine-local authorities. Media Library does not
read, import, rewrite or repair them. The canonical workspace identity descriptor remains deliberately
small, and secrets belong to SecretStorage/keychain rather than ordinary SQLite.

**Alternatives considered**

- **Persist a Media Library manifest or target record in JSON:** rejected because it duplicates the
  OS link mapping and becomes stale after a global relink.
- **Persist symlink targets in SQLite:** rejected because it creates a second resolver, stores
  machine-specific paths, and can falsely authorize a missing or changed OS link.
- **Create one SQLite database per workspace:** rejected because workspace moves and sync would carry
  stale database state and fragment the single local metadata authority.
- **Move all local JSON in this change:** rejected because shell state, preferences, identity,
  journals, and secrets have different durability and security contracts.

### 4. Expose a precise link state model

For each linked or required library, Desktop Main computes one state:

- `available`: a managed workspace link resolves and all checked referenced descendants are readable.
- `required-unlinked`: references exist but no workspace link exists.
- `global-connection-missing`: the project link points at a missing machine-global alias.
- `target-unavailable`: the alias exists but its physical target is unavailable or denied.
- `content-incomplete`: the target is contained and readable but one or more referenced descendants
  are missing.
- `entry-conflict`: the expected workspace entry exists but is not a managed directory link.
- `unreferenced-linked`: a valid linked root has no current authoritative project reference.

Diagnostics never include a physical target. Contract violations, unmanaged entries, stale project
identity, and link loops fail visibly rather than becoming an empty library.

### 5. Recovery is a revisioned plan followed by explicit confirmation

Recovery first creates an immutable plan against:

- exact project/workspace identity;
- requirement snapshot fingerprint and owner/source fingerprints;
- current workspace link inspection;
- an exact-name machine-global Media Library candidate;
- contained existence checks for every referenced descendant, bounded by a declared limit.

No fuzzy name, basename, historical target, or similarly named directory is accepted. If no global
candidate exists, the user may explicitly select a directory; Desktop registers it globally, validates
the requirement, and then points the project link at the global alias. Cancellation changes neither
registry nor link. A failed second step rolls back only the newly created global connection.

Applying a plan rechecks the exact source fingerprints, plan identity and candidate identity, then atomically creates or replaces
the workspace link. New Desktop add/relink operations use the global alias as their target so a later
global relink repairs all participating projects. Existing direct-to-physical project links remain
readable and are converted only through an explicit confirmed relink; no startup process mutates
user state.

### 6. Portability readiness is result- and path-aware

A project is:

- `linked-ready` when all authoritative linked references are readable on this machine;
- `sync-requires-relink` when project facts are portable but one or more machine-local links are
  missing or unavailable;
- `portable-snapshot-ready` only when a completed snapshot contains every referenced external byte
  and all staged project documents reference the collected project-owned paths.

The check reports library-level counts and diagnostics. It never claims that Git/folder sync includes
Media Library bytes merely because links are currently readable.

### 7. Portable collection creates a new snapshot instead of mutating the source project

The user chooses a destination outside the source workspace. Desktop creates a sibling temporary
staging directory, copies the real project tree while excluding managed links, caches, scratch data,
and local state, and asks each reference owner to rewrite a staged copy of its documents.

Only authoritative linked references are collected. Their bytes are read through the existing Host
content boundary and written to deterministic project-owned paths such as
`media/collected/<libraryName>/<relativePath>`. The plan records byte length and fingerprint, checks
destination conflicts and available capacity before publishing, and preserves shared references by
deduplicating identical locator/fingerprint pairs.

The source project and external libraries are read-only throughout. Any cancellation, stale source
revision, missing byte, containment failure, rewrite failure, or publish conflict deletes the staging
directory and returns a diagnostic. The final destination appears through one atomic rename only
after all copied bytes and rewritten staged documents validate. This avoids a multi-document
transaction and rollback journal in the live workspace.

Snapshot execution uses the existing task lifecycle only when work must survive process restart.
`tasks` stores typed lifecycle state and `task_checkpoints` stores the minimum resumable cursor; they
must not contain media bytes, full project documents, absolute source/destination paths, credentials,
or an alternate link mapping. State-owned task commits are independent from cache-owned projection
updates, so a cache write failure cannot turn a published snapshot into a failed authority mutation.

### 8. Reuse existing content and UI boundaries

- Reuse `WorkspaceLinkedMediaLibrary` mutation/inspection, global Media Library files, shared content
  access, fingerprint, project-file IO, and Desktop native picker primitives.
- Extend the Assets-owned Resource Browser root rather than creating a Desktop-local link manager.
- Show missing required libraries in the project Media facet with status icon, tooltip, and explicit
  recover action; keep global Asset center selection and state independent.
- Add a project portability command/menu entry only where project lifecycle commands are owned; do
  not place it in global navigation or the Asset center.
- Keep the primary application sidebar free of persistent portability controls. Open the portability
  lifecycle dialog from the exact Project context menu, keep library status on Media facet items, and
  omit healthy zero-reference state from global navigation.

### 9. Preserve fail-visible security boundaries

Recovery and collection resolve each requested descendant through the existing direct-link and final
realpath containment guard. Nested symlink escapes, unmanaged workspace symlinks, unknown schema,
missing owner implementation, stale revision, and unsupported project-document types reject the
operation. Renderer never receives `file:`, absolute, global registry root, cache, temporary, or
credential-bearing values.

## Risks / Trade-offs

- **[Owner coverage is initially incomplete]** → Gate portability claims on the declared provider
  set; an unsupported persisted project-document kind returns `coverage-incomplete` instead of a
  false ready result.
- **[Large projects make descendant validation expensive]** → Use owner/source fingerprints, bounded
  concurrency, cancellation, and a rebuildable derived projection; do not hash bytes until collection.
- **[A library is intentionally partial on another machine]** → Recovery reports exact missing counts
  and refuses to claim success; users may choose another directory or keep the project unresolved.
- **[Two-level links add one failure layer]** → Emit distinct target-free diagnostics for project
  entry, global alias, and physical target while retaining global relink fan-out.
- **[Snapshot may require substantial free space]** → Calculate planned byte totals before writing,
  stage beside the destination, and never mutate the source project.
- **[Sync tools still differ in symlink behavior]** → Exact local Git exclusion remains mandatory and
  UI copy states that normal sync transfers references, not Media Library bytes.
- **[Existing direct project links cannot benefit from global fan-out]** → Keep them readable to
  protect user data and offer explicit normalization during relink; all new Desktop mutations use the
  global alias.
- **[SQLite projection is stale or unavailable]** → Never use cached membership or targets to
  authorize recovery; rebuild from project facts and OS inspection, mark the projection stale, and
  fail visibly when a durable task/checkpoint cannot be committed.

## Replacement Plan

1. Introduce and test the requirement/recovery/portability contracts and prove `library.json`, absolute
   target rows, workspace databases, and fallback lookup are absent from the runtime path.
2. Bind requirement freshness/diagnostics, referenced-media probe cache, and resumable task state to
   the existing user-level local metadata repositories; do not create a dedicated Media Library table
   or persist current link availability.
3. Add owner reference readers and aggregate only known authoritative project facts.
4. Project missing-required states without changing link mutation behavior.
5. Route new add/relink operations through the global alias and add explicit recovery planning.
6. Add portable snapshot staging and owner-specific staged rewrite implementations.
7. Validate package/export and existing direct links; no project bytes or target contents are rewritten
   automatically.
8. Remove any temporary dual route before release. The only successful new recovery route is
   plan/confirm/apply; direct legacy command aliases fail closed.

Rollback removes the new projection and commands without touching existing links, source projects,
global connections, or external media. Already-created portable snapshots are ordinary independent
projects and remain usable.

## Open Questions

- Which current project-document codecs beyond Canvas, Cut, and Entity representation bindings must
  be in the initial authoritative provider set before portability can report complete coverage?
- Should portable snapshots retain unreferenced project-owned files, or offer a separate compact mode
  after the first correctness-focused implementation?
- On Windows, must initial acceptance cover both local junction targets and a real UNC/NAS target, or
  can UNC remain a documented release blocker until a Windows host is available?

## Resource Browser retained navigation

Assets Webview may retain facet and navigation state by project identity, but a restored active container is valid
only when the current root/children projection contains that owner. If a fresh search or remount returns a root
projection without the retained container, the Resource Browser explicitly returns that facet to root before
filtering items. It must not turn available linked libraries into a successful empty list. Replaying a deeper path
requires an explicit Host children request and exact resource identities; no label/path guessing is permitted.
