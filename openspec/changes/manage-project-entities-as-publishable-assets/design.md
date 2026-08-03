## Context

Creative Entity is intended to be the sole semantic identity authority for characters, scenes, objects,
locations, and styles. Current facts are fragmented across root character files, per-kind files,
candidates, representation bindings, visual drafts, and requirements. Resource Browser exposes a
`materials` facet that actually contains Entity items, but it does not provide a complete candidate,
confirmation, merge, provenance, or publication workflow.

An Entity can originate from workspace evidence or an installed Entity Asset. During creation it remains
mutable and project-specific; when shared it must become an immutable versioned Asset. Treating both as
one mutable globally synchronized record would couple project facts, remote distribution, and resource
files and would make deletion/update unsafe.

This change depends only on the public Asset contracts from
`establish-manifest-backed-asset-library`. It must remain testable with an in-memory Asset adapter before
a real cloud provider exists.

## Goals / Non-Goals

**Goals:**

- Establish one versioned project Entity fact authority and make derived state rebuildable.
- Make inferred candidates searchable immediately while requiring explicit intent for stable Entities.
- Provide Entity management in Resource Browser and an Entity Inspector.
- Define safe instantiate, bind, publish, update, diff, and apply workflows for Entity Assets.
- Preserve references and user data when source files, links, or remote Assets change or disappear.
- Reuse generic Asset Library distribution without creating Entity-specific global sync.

**Non-Goals:**

- Automatically promoting every detected name or file into a stable Entity.
- Live bidirectional synchronization between a Project Entity and an Entity Asset.
- Uploading mutable project facts through background Asset synchronization.
- A second Entity catalog, Entity cloud service, or arbitrary semantic merge performed by Assets.
- Storing rebuildable candidate, occurrence, availability, or search rows in the canonical Entity file.

## Decisions

### 1. Separate Project Entity from Entity Asset

A Project Entity is a mutable semantic aggregate owned by the workspace. It contains stable project ID,
kind, names/aliases, accepted facts, lifecycle state, accepted representation intent, provenance, and
revision. An Entity Asset is an immutable Asset package revision containing a frozen semantic snapshot
and package-owned resources suitable for reuse.

Instantiating an Entity Asset creates a new Project Entity ID and records `originAssetId`, applied Asset
revision/digest, and an import base snapshot. Thereafter the project record is independent. An available
Asset update is compared with that base and the current project record; changes are applied only through
an explicit Entity-domain operation.

Alternative considered: use the Asset ID as project Entity identity. Rejected because one Asset may be
instantiated more than once and project-specific edits must not mutate or collide with global identity.

### 2. One canonical project fact document; projections stay outside it

The canonical user-visible authority is a versioned `neko/entities.json` document. It stores confirmed
Entities and their durable semantic/binding facts, not candidate scores, occurrences, availability,
orphan timestamps, search rows, thumbnails, validation sessions, or visual-generation drafts. Those are
rebuildable SQLite/cache projections owned by Search/local metadata or workflow state owned by their
feature packages.

One document is selected instead of one file per Entity because project operations such as merge,
reference rewrite, uniqueness checks, and revision preconditions require an atomic semantic commit. It
also avoids a directory of tiny files while remaining inspectable, syncable with the workspace, and
recoverable by users.

Alternative considered: keep all Entity facts only in SQLite. Rejected because users need to perceive,
version, synchronize, and recover project semantics with the workspace.

### 3. Detection creates candidates, explicit intent creates authority

Workspace/document analysis and Asset/Media discovery emit candidate and occurrence evidence into a
rebuildable projection. Candidates are searchable and can appear beside confirmed Entities with an
explicit status, but they cannot be referenced as a durable Entity until the user or an authorized Agent
confirms, creates, merges, or imports them through typed operations.

Candidate disappearance removes only the projection. Confirmed Entity facts never disappear because a
source file, linked library, model result, or candidate score changes.

Alternative considered: automatic creation above a confidence threshold. Rejected because false semantic
identity is expensive to undo and threshold behavior is unstable across analyzers.

### 4. Bindings record durable targets and derive availability

Bindings use the existing closed resource-reference model for workspace files, document entries,
generated outputs, or package-owned references. A package reference adds immutable Asset
`assetId/revision/digest` provenance and package-relative resource identity; it never stores cache paths,
absolute paths, link targets, or provider URLs.

Availability and attention status are derived by resolving the binding through its owner. A missing file,
removed Media Library link, uninstalled package, or fingerprint mismatch marks a binding unavailable and
offers explicit rebind/reinstall operations. It does not delete the Entity or select a similar resource
automatically.

### 5. Entity publication owns semantic conversion; Assets owns distribution

`@neko/entity-domain` validates the Project Entity snapshot, selects/embeds or declares representations,
checks that no absolute or linked external path leaks into the package, and creates the Entity Asset
publication request. `@neko/assets-domain` validates generic manifest/dependency rules and owns revision,
install, publish, and cloud replication.

An external Media Library representation must be explicitly copied into the Entity Asset package or
replaced with a declared installable Asset dependency before publication. Publishing never mutates the
Project Entity. The returned Asset ID/revision/digest is recorded only after remote/local package commit
succeeds.

Generic Asset cloud sync installs and distributes Entity Asset revisions. It does not inspect or upload
`neko/entities.json`; there is no Entity-specific sync service.

### 6. Entity operations are reference-safe and fail-visible

Merge and deprecate use expected project revision and rewrite every known project reference through a
typed reference index. Unknown or unrewritable references abort the commit and produce a diagnostic.
Updates use a three-way semantic diff: imported base, current Project Entity, and new Entity Asset.
Conflicting fields remain unapplied until explicitly resolved.

Alternative considered: field-level last-write-wins. Rejected because it can silently overwrite creative
decisions and cannot distinguish local customization from upstream correction.

### 7. Package ownership and runtime boundaries

| Owner                     | Package role and canonical public entry                                         | Producer                                                    | Consumer                                             | Runtime boundary                     | Replaced path                                     | User-data impact                                      |
| ------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------ | ------------------------------------------------- | ----------------------------------------------------- |
| Entity semantics          | `packages/entity/domain` via `@neko/entity-domain`                              | Entity codec, lifecycle, diff/apply, publication conversion | Node, Search, Webview, Agent effects, Assets adapter | Host-neutral TypeScript              | Fragmented character/per-kind/binding authority   | Defines the only canonical semantic model             |
| Workspace persistence     | `packages/entity/node` via `@neko/entity-node`                                  | Atomic `neko/entities.json` repository and migration        | Desktop composition                                  | Node filesystem                      | Multiple normal readers/writers                   | Archives, migrates, and atomically commits user facts |
| Entity search projections | `packages/search/domain` and `packages/search/local-metadata` public entries    | Candidate/occurrence/index projections                      | Entity Webview and Agent query                       | Host-neutral + Node/SQLite adapter   | Ad hoc candidate files and mixed `materials` rows | Rebuildable; never semantic authority                 |
| Entity presentation       | Entity-owned Webview surface consumed through Resource Browser public contracts | Entity facet and Inspector intents                          | Desktop renderer                                     | Renderer sandbox                     | `materials` facet                                 | No durable facts; projects status and operations      |
| Asset distribution        | `@neko/assets-domain` public lifecycle ports                                    | Installed/published Entity Asset revisions                  | Entity adapter                                       | Host-neutral contract + Node adapter | Separate Entity catalog/sync idea                 | Does not read mutable project facts                   |
| Application composition   | `apps/neko-desktop` typed preload/IPC and composition root                      | Sender-bound ports and window lifecycle                     | Renderer/package services                            | Electron                             | App-owned Entity business logic                   | No Entity authority; only Desktop-specific wiring     |

Production logic remains in `apps/neko-desktop` only for Electron sender authorization, preload
projection, window/workspace lifecycle, and composition. Entity semantics, persistence, search projection,
and publication conversion stay package-owned.

## Risks / Trade-offs

- **[Risk] Canonical migration loses fragmented facts** → Inventory every source, archive exact inputs,
  classify fields, and abort on ambiguity or revision changes.
- **[Risk] Candidates are mistaken for confirmed facts** → Use distinct IDs/status and reject durable
  references until explicit confirmation/import.
- **[Risk] Entity Asset update overwrites local creativity** → Store the import base and require three-way
  diff/apply with explicit conflict resolution.
- **[Risk] Publication leaks external paths or inaccessible bytes** → Validate every representation and
  require package copy or installable Asset dependency.
- **[Risk] Merge leaves dangling references** → Require a complete typed reference rewrite plan and fail
  before commit when any owner cannot participate.
- **[Trade-off] One JSON authority increases write contention** → Use expected revision and atomic replace;
  the local Desktop product has bounded writers and benefits from atomic cross-Entity operations.

## Migration Plan

1. Add the canonical Entity codec/repository and a read-only inventory of all current Entity-related
   files and known project references.
2. Produce a migration plan and immutable archive with input digests; require confirmation for ambiguous
   facts, identity merges, or unknown fields.
3. Write `neko/entities.json` atomically under expected workspace revision, rebuild candidate/search/
   availability projections, and verify reference resolution.
4. Switch Entity consumers, Resource Browser, Agent effects, and bindings to the canonical public ports.
5. Poison fragmented normal readers/writers; retain old files only in the explicit recovery archive.
6. Enable Entity Asset instantiate/publish/update workflows over the generic Asset adapter and verify that
   cloud sync never reads the project Entity document.

Before the canonical switch, rollback leaves existing files untouched. After a successful switch,
rollback exports from the canonical document or restores the immutable archive with explicit user intent;
normal legacy readers are not re-enabled.

## Open Questions

- Which existing Entity-related fields are true accepted project facts versus workflow drafts requiring
  archive-only preservation?
- Which project reference owners must participate in the first merge/rewrite transaction?
- Should `scene` be added to the current `IdentityMetadata.identityKind` in the same implementation or in
  a prerequisite contract cleanup?
