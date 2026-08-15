> Extended by `restore-workspace-linked-media-access`: the target-free project binding and global
> connection remain canonical; `neko/assets` is restored as a binding-derived Workspace access projection
> for Agent and other Workspace-restricted consumers, not as a replacement authority.

## Context

The current product has three coupled storage paths:

- `neko/project-composition.json` is a single strict root for project identity, local target
  membership, publication dependencies, and Entity-to-Character associations. Adding one required
  field invalidated existing roots and the Workspace scene transition currently fails before unrelated
  project capabilities can remain available.
- Project-linked media is represented as a `workspace-file` locator below
  `neko/assets/<libraryName>/...`; an OS symlink/junction at that path is both authorization and target
  mapping. The link is machine-local but lives under the synchronized project-fact namespace.
- The accepted Local Metadata ADR treats every project `.neko/` path as retired, while the desired
  product contract allows package-owned machine-local configuration that can be deleted and initialized
  without losing project facts.

The replacement must preserve one canonical path per intent, must not introduce a product migration or
fallback reader, and must protect existing bytes. Project sync must work without `.neko`; external media
use may require a local binding, but that absence must affect only the dependent resource. Desktop Main
remains the native path and sender trust boundary, not the owner of composition or binding policy.

## Goals / Non-Goals

**Goals:**

- Define synchronized project facts, disposable project-local state, and user-global state as distinct
  authorities with explicit owners and deletion semantics.
- Make the whole project `.neko/` tree safe to delete and initialize without inventing or overwriting
  project identity, user content, bindings, dependencies, or versions.
- Store media intent as a portable owner-qualified locator and store only machine-local resolution
  state below project `.neko/`.
- Keep global Media Library connections reusable across projects while requiring exact project-local
  authorization before an external target is read or mutated.
- Make normal sync target-free and make portable packaging self-contained, reference-scoped, atomic,
  and source-preserving.
- Split Project facts so one invalid association or projection cannot invalidate the full project or
  block Workspace scene composition.
- Keep one global manifest-backed Asset Library and exact project Asset pins.
- Delete the old successful runtime paths atomically and prove absence through path-level tests.

**Non-Goals:**

- Synchronizing `.neko`, external Media Library bytes, global connections, credentials, or mounts.
- Creating a workspace Asset Library, generic Resource authority, generic settings bag, workspace
  database, cloud sync provider, or remote collaboration protocol.
- Automatically authorizing a same-named global connection, silently repairing project facts, or
  reading old shapes as successful compatibility input.
- Moving Character, World, Entity, Canvas, Cut, Asset, or Agent facts into Project or Local Metadata.
- Copying an entire linked library during ordinary linking, sync, or portable packaging.

## Decisions

### 1. Storage scope follows authority and deletion semantics

The canonical layout is:

```text
<workspace>/
  neko/                             synchronized package-owned project facts
    project.json                    stable Project identity and minimal metadata
    project-bindings/
      entity-character/             one Project-owned association record per identity
  media/                            project-owned media bytes
  .neko/                            machine-local, disposable, package-owned state
    media-libraries/                Assets-owned project binding records
    presentation/<package>/         optional package-owned presentation snapshots
    cache/<package>/                optional disposable derived files

~/.neko/
  media-libraries/                  authorized user-global physical connections
  assets/                           manifest-backed global Asset packages
  neko.db                           user-global structured state/projections/tasks
  cache/                            user-global derived bytes
```

`neko/` contains only facts that must survive clone, sync, package, and machine changes. `.neko/`
contains only state for which deletion has the permanent meaning “initialize the current canonical local
state”. `~/.neko/` contains user-global state shared by local projects. A package chooses exactly one
authority for each datum; it cannot dual-write project `.neko` and `neko.db`.

Project identity remains in `neko/project.json`. `.neko/workspace.json` is not an identity authority.
Missing or invalid project identity is an exact Project diagnostic and must never be replaced with a new
random identity. Missing local state, by contrast, initializes as an empty binding, cache, or presentation
record.

Project `.neko` is not a generic settings folder. Each direct owner defines a strict bounded codec,
canonical default, initialization point, deletion behavior, and diagnostic. Credentials, background task
authority, unsent valuable authoring facts, conversations, World saves, domain versions, exact Asset pins,
and Entity/Character bindings are forbidden.

Alternative considered: keep all machine-local Workspace state in `~/.neko/neko.db`. Rejected because
path-local bindings and disposable checkout presentation have a different deletion/move lifecycle. The
global database remains canonical for user-global catalogs, projections, and resumable tasks.

### 2. Product sync and package code exclude `.neko` by contract

Every product-owned project enumerator, sync planner, portable snapshot copier, package/export builder,
generic Resource Browser mutation planner, and Agent project-file contributor treats root `.neko/` as a
reserved local subtree. It must not traverse, follow links from, serialize, hash into project identity,
upload, package, or surface that subtree as ordinary project content. Project templates and Git setup add
an advisory `.neko/` ignore, but correctness does not depend on Git configuration.

Project codecs reject absolute paths, `.neko/...` locators, user-global connection identities, resolved
targets, native authorization handles, runtime URLs, and local cache paths. The package/export validator
scans the staged project facts for these forbidden values before publication. Logs and diagnostics use
logical library and record identities only.

Alternative considered: rely only on `.gitignore` or `.git/info/exclude`. Rejected because folder sync,
archive, package, and non-Git projects require the same invariant.

### 3. Media Library receives its own canonical ContentLocator kind

`@neko/content` adds one canonical locator and updates the closed union atomically:

```ts
interface MediaLibraryContentLocator {
  readonly kind: 'media-library';
  readonly libraryName: string;
  readonly relativePath: string;
  readonly fingerprint?: ContentFingerprint;
}
```

`DocumentEntryContentLocator` keeps the archive entry as the durable identity and accepts either a
`WorkspaceFileContentLocator` or `MediaLibraryContentLocator` as its exact container owner. This is a
closed non-recursive source union: archive entries may not contain another document entry, generated
output, package resource, runtime URL, or native path. Host entry reads first authorize and resolve the
exact source owner, then read the requested contained entry.

`libraryName` is one portable logical segment and `relativePath` is normalized, relative, dot-segment
free, and independent of a Workspace path. The locator never contains `.neko`, `neko/assets`, an absolute
target, connection identity, provider, mount, credential, or runtime handle. A project-owned collected
file continues to use `WorkspaceFileContentLocator`; an installed Asset continues to use
`PackageResourceContentLocator`.

`ContentReadService` adds one exact Media Library handler. Its document-entry handler resolves the
container through the exact Workspace or Media Library owner before reading the archive entry.
Producers and consumers in Canvas, Cut,
Entity representation, Agent context, Preview, Search, Resource Browser, package/export, and tests switch
to the new locator in one source change. The `workspace-file + neko/assets` interpretation is removed,
not retained as an alias or try-next path.

Alternative considered: keep `neko/assets/...` as a virtual workspace path. Rejected because it would
make a project fact look like a real synchronized file while requiring hidden special resolution.

### 4. Project-local binding is disposable authorization, not project authority

`@neko/assets-domain` defines a strict local binding record keyed by exact Project and logical library
name. `@neko/assets-node` stores one bounded record below `.neko/media-libraries/`. The record may contain
an opaque user-global connection identity and binding fingerprint but never a physical target. A missing
directory initializes empty; one malformed record is preserved, diagnosed, and ignored without clearing
valid sibling bindings.

The user-global Media Library owner resolves the exact connection identity to an already authorized
global connection. Desktop Main supplies the concrete native path only inside the Node read/mutation
adapter. It validates both the selected descendant and final realpath containment on every operation.
There is one resolver chain:

```text
MediaLibraryContentLocator
  -> exact project-local binding
  -> exact authorized user-global connection
  -> contained physical descendant
```

There is no resolution by active Workspace, similarly named directory, recent target, raw path,
historical link, cache, or first compatible provider. Deleting project `.neko` removes authorization on
that machine but does not change project facts or global connections.

Alternative considered: relocate the existing OS link into project `.neko`. Rejected because symlink or
junction targets can disclose machine paths when users copy the raw directory. A target-free binding
record keeps the sensitive physical mapping only in the user-global owner.

### 5. Requirements are derived; rebinding is explicit and fail-local

Each authoritative project-document owner exposes current Media Library locators through a fixed public
reference reader. Assets aggregates logical library names and descendants and reports available,
required-unlinked, connection-missing, target-unavailable, content-incomplete, binding-invalid, and
unreferenced-local-binding states. Requirement membership is rebuilt from current project facts and is
never a durable manifest or binding fact.

After `.neko` deletion, initialization creates no binding. The system derives requirements and may show
an exact-name global candidate, but it cannot authorize or write a binding until the user confirms an
immutable plan. Missing bindings do not block Workspace open, Project Files, Character, World, Agent, or
unrelated media. Operations requiring the missing media fail with the exact locator diagnostic.

Alternative considered: automatically bind an exact-name global connection. Rejected because opening a
project must not authorize access to external directories.

### 6. Project composition becomes facts plus projections

`neko/project-composition.json` is removed from the canonical runtime. Its fields are classified as:

| Current field | Canonical replacement |
| --- | --- |
| `contentProjectId` | `neko/project.json` Project identity |
| `localTargets` | derived from Chara/World records scoped to the exact Project |
| `dependencies` | derived from exact owner references and Asset/package/version pins |
| `entityCharacterAssociations` | Project-owned per-record facts under `neko/project-bindings/entity-character/` |

Project association files contain one exact Entity-to-Character decision and are independently parsed.
Invalid association files remain visible with a record diagnostic; valid siblings, Project Files, and
other domains remain available. Project Content, target navigation, resource usage, dependency status,
and publication readiness are read-only projections assembled from the current Project identity,
association facts, and fixed owner ports.

Chara and World own the record declaring their exact Project scope. Project does not maintain a second
mutable membership list. Consumer owners retain exact external version and Asset pins. Project may
aggregate those references but cannot create an unused dependency summary as authority.

Scene transition first validates the target Window/Workspace authority and mounts the Workspace shell.
Project Content projection failure is returned to that Surface only; it cannot roll back or half-commit
unrelated shell navigation.

Alternative considered: make `project-composition.json` optional and recreate empty arrays. Rejected
because an empty default would silently erase Entity associations and explicit dependency facts.

### 7. Sync is lightweight; portable packaging is self-contained

Normal project sync copies synchronized facts and project-owned bytes only. It keeps logical Media
Library locators unchanged and reports that another machine may require binding. It does not copy
external bytes or local binding records.

Portable packaging creates an independent sibling staging tree, excludes `.neko` and all managed local
state, rereads current owner references, validates complete reference-reader coverage, copies only
referenced external bytes into deterministic project-owned `media/collected/...` paths, and asks each
owner to rewrite its staged document from `media-library` to `workspace-file`. It verifies fingerprints,
byte lengths, rewritten codecs, forbidden local values, and capacity before one atomic publish. Any
missing byte, stale owner, cancellation, path escape, write failure, or conflict removes staging and
leaves the source project and external library unchanged.

The task owner may persist bounded progress/checkpoints in user-global `neko.db`; task records cannot
contain media bytes, full documents, `.neko` paths, absolute source/target paths, or credentials.

Alternative considered: sync every linked library or include the binding record in a package. Rejected
because it duplicates large mutable sources and cannot reproduce another machine's authorization.

### 8. Asset Library remains user-global and project references stay exact

The manifest-backed Asset Library under `~/.neko/assets` remains the only installed Asset aggregate.
Projects do not own a second library and do not copy packages merely to browse them. Consumer facts keep
exact `assetId + revision` pins; availability is a rebuildable projection with “project in use”, “globally
available”, and “missing dependency” presentation. A self-contained export includes the declared Asset
dependency closure through the Asset package/export owner; it never reconstructs membership by scanning
files.

### 9. Resource management cannot mutate package-owned facts generically

Resource Browser keeps exactly Files, Media, and Assets sources. Files may browse ordinary project
content but reserve `neko/` and `.neko/` from generic rename, trash, copy-over, and import-destination
operations. Domain records remain manageable only through their owning Character, World, Entity,
Project, Asset, or document application service. Media mutation targets the exact external connection;
Asset mutation targets manifest-backed membership/package lifecycle.

### 10. Owner and runtime inventory

| Owner | Package role / canonical entry | Producer | Consumer | Runtime boundary | Replaced path | User-data impact |
| --- | --- | --- | --- | --- | --- | --- |
| Project storage classification | `@neko/local-metadata` L0 layout/policy contract | package owners | Node repositories, sync/package | host-neutral classification | blanket workspace `.neko` prohibition | new local files are disposable; facts unchanged |
| Project facts/projections | `@neko/project` contracts/application | Project, Chara, World, Entity and reference owners | Project Content, navigation, publication | host-neutral + authorized Node repository | monolithic composition service/root | old bytes preserved; new facts are per-record |
| Project fact IO | `@neko/project-node` | Project application service | authorized Workspace adapter | Node filesystem | `project-composition.json` repository | atomic per-record writes; no fallback |
| Media locator/read dispatch | `@neko/content` contracts/core | document owners | Content consumers | L0 contract + injected handler | `workspace-file` under `neko/assets` | old records unsupported until offline conversion |
| Media binding/recovery | `@neko/assets-domain` application | exact project requirement and user intent | Assets UI, content handler | host-neutral policy | filesystem-derived project links | local binding is disposable |
| Media filesystem work | `@neko/assets-node` | Assets application plans | global connection/content ports | Node filesystem | workspace symlink inspection | no external byte mutation without explicit intent |
| Global Asset Library | `@neko/assets-domain` / `@neko/assets-node` | explicit import/install | project consumers, Resources | host-neutral + Node package store | flat scanned membership | installed packages remain global |
| Desktop | `apps/neko-desktop` composition adapters | sender, Window, native picker/path grants | package public ports | Electron Main/preload/renderer | app-owned composition/recovery decisions | no durable fact ownership |

Production logic retained in Desktop requires the Application boundary only where it checks Electron
sender/window identity, obtains native directory grants, resolves an authorized connection to a native
path, registers short-lived resource handles, or applies a package-produced Shell plan. Classification,
binding state, recovery plan, composition, projection, packaging policy, and diagnostics are host-neutral
or Node package behavior and must not remain in `apps/*`.

## Risks / Trade-offs

- **[Risk] Existing projects use the replaced locator and composition shapes.** → Preserve bytes and
  provide a separate exact-target offline conversion tool with backup, dry inspection, atomic write, and
  post-validation; keep it unreachable from product startup/build/public imports.
- **[Risk] Existing Canvas documents reference entries inside linked EPUB/CBZ containers.** → Keep
  `document-entry` as the entry identity, convert only its retired Workspace source to the exact Media
  Library source, and test the full authorize-container/read-entry path.
- **[Risk] Moving from workspace paths to a Media Library locator touches many consumers.** → Inventory
  every producer/consumer, switch the closed union and dispatch atomically, poison the old path prefix,
  and add source/reachability tests proving no alternate read succeeds.
- **[Risk] An invalid local binding could hide valid siblings.** → Store and decode one record per logical
  library and return identity-scoped diagnostics beside valid bindings.
- **[Risk] External folder sync can copy `.neko` despite product exclusions.** → Store no physical target
  or credential in project `.neko`, provide advisory ignores, and make product sync/package exclusions
  programmatic. Raw third-party directory copy remains outside product control but contains only bounded
  local connection identity, never its target.
- **[Risk] Deriving Project membership exposes inconsistent Chara/World scope records.** → Keep owner
  records authoritative, project each invalid/mismatched entry separately, and block only operations that
  require that exact target.
- **[Risk] Portable collection can be large or interrupted.** → Preflight capacity/conflicts, use bounded
  task checkpoints, copy into sibling staging, and publish only through one atomic rename.
- **[Risk] Windows binding and NAS behavior differs from macOS.** → Use the global connection adapter and
  final containment checks on each supported platform; Windows local/NAS acceptance remains a release
  gate for affected capabilities.

## Migration Plan

1. Add and test storage classification/layout contracts and project `.neko` exclusion/initialization
   without moving any facts.
2. Add the new Media Library locator, binding contract, Node handler, and tests; atomically switch all
   producers/consumers and delete `neko/assets` runtime resolution in the same source boundary.
3. Add per-record Project association facts and derived Project projections; switch every Project
   consumer and delete the composition repository/service/scene-transition dependency.
4. Update sync/package staging and Resource Browser protection, then validate no `.neko`, native target,
   or connection identity appears in synchronized or packaged facts.
5. Add the product-unreachable offline converter for explicitly selected existing projects. It creates
   an immutable backup, converts only recognized current records, validates the new canonical project,
   and never registers a product reader or compatibility route.
6. Run package contract/unit tests, Desktop integration and real Electron scenarios, architecture and
   dependency gates, macOS link/packaging checks, and Windows/NAS acceptance where available.

Rollback during development is a source revert before any new canonical project fact is produced. Once
new facts exist, rollback must not reinterpret them through old code; preserve the project bytes and use
only an explicitly authorized offline tool against an exact backup.

## Open Questions

None. The accepted scope fixes project `.neko` as disposable, retains global Asset and Media connection
owners, and chooses an owner-qualified Media Library locator rather than a virtual workspace path.
