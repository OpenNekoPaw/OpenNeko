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

### 8. Resource Browser facets are owner-preserving projections

Workspace Resource management exposes exactly four peer facets: `files`, `media`, `assets`, and
`entities`. They are views over different authorities, not copied catalogs:

- `files` browses workspace-owned directory and file locators.
- `media` browses workspace links into Media Library and preserves link availability.
- `assets` browses reusable Asset Library items by exact Asset identity; selecting one does not
  instantiate an Entity or copy bytes into the workspace.
- `entities` browses Project Entity semantic identity and derives representation availability from
  its owning resources.

Facet switching is Resource Browser display state, not Workbench navigation and not a second tab bar in
the preview/detail shell. Each facet retains its own selection and navigation state. Cross-owner search
results must retain their facet, owner identity, lifecycle, availability, and supported operations.

The Entity Inspector is the single semantic management surface. Preview and management intents remain
Entity/resource operations. Referencing an Entity in the active Agent context, starting Character
dialogue, opening a Room, or embodying a Character are capability-gated integration intents. Their
owning package must provide a typed handler and exact Conversation/Character/Room identity; the
Resource Browser must not synthesize an Agent slash command, mutate Agent Webview state, or restore the
removed Agent Header roleplay selector.

### 9. Current authority and consumer inventory

The migration boundary covers every current normal producer of Entity semantic facts rather than only
the Resource Browser reader. The following sources were audited before defining the canonical document:

| Current source                                                                      | Current producer / reader                                                                          | Classification and target                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| root `characters.json`                                                              | `ProjectEntityStore`, character registry adapters, Character profile assembly                      | Accepted character identity/name/alias/semantic fields migrate to canonical facts; character-only runtime projections remain owned by Chara.                                                                               |
| `neko/entities/scenes.json`, `locations.json`, `objects.json`, `styles.json`        | `ProjectEntityStore`, `CreativeEntityService`, Agent core tools                                    | Accepted identity/name/alias/semantic fields migrate to canonical facts; per-kind normal readers are poisoned after commit.                                                                                                |
| `neko/entities/candidates.json`                                                     | `CandidateStore`, `CreativeEntityService`, Search Entity adapter                                   | Evidence, confidence, source references, freshness, rejection and dismissal are rebuildable/workflow projection state; an explicitly confirmed or merged result becomes a canonical operation, not a copied candidate row. |
| `neko/entity-representation-bindings.json`                                          | `EntityRepresentationBindingService`, Resource Browser, Canvas/Cut/Agent representation resolution | Confirmed durable target, role, default selection, source and acceptance time migrate to canonical binding facts; suggested/rejected status, availability and orphan timestamps remain workflow/derived state.             |
| `neko/entity-asset-requirements.json`                                               | `EntityAssetRequirementService`, Chara profile assembly                                            | Current missing/suggested/generated/bound/dismissed rows are workflow state. Explicitly accepted representation intent is represented by canonical bindings; unresolved rows are archived for inspection.                  |
| `neko/visual-identity-drafts.json`                                                  | `VisualIdentityDraftService`, Chara profile assembly                                               | Prompts, generated output selections and extracted suggestions are authoring workflow state and remain outside canonical identity facts; accepted semantic values or bindings enter only through typed Entity operations.  |
| Entity Asset projection records in local metadata                                   | `EntityAssetMetadataProjector`, Search local metadata binding                                      | Candidate, occurrence, binding availability and freshness remain rebuildable projections; they never become a second fact authority.                                                                                       |
| Asset manifests and installed packages                                              | Assets manifest/lifecycle readers                                                                  | Immutable Entity Asset snapshots and exact package resources are import/publication inputs. Install, uninstall and sync never mutate Project Entity facts.                                                                 |
| Canvas/NKC, Agent context, Chara memory/dialogue and project portability references | Canvas contracts, Agent content effects/tools, Chara runtimes, Assets reference readers            | These are typed reference consumers. Merge/deprecate/delete must obtain a complete rewrite or blocker response from each owner; they do not own Entity facts.                                                              |

The normal consumer switch includes `CreativeEntityService`, Search `creative-entities`, Resource Browser,
Agent Entity capability/content effects, Canvas material Entity refs, Chara profile/dialogue projection,
and Assets project-reference/portability readers. Tests and migration-only inspectors may read archived
legacy inputs, but no normal consumer may return success from them after the canonical commit.

`scene` is a valid Project Entity kind in the v1 document. The current generic Asset manifest
`IdentityMetadata.identityKind` does not yet include `scene`; therefore scene Entity Asset publication
must fail with a typed unsupported-kind diagnostic until task 4.2 expands and tests that public Asset
contract. Project Entity storage and management must not omit or remap scene identity in the meantime.

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

- Which Canvas, Agent, Chara, document, and portability reference owners can participate atomically in
  the first merge/rewrite transaction, and which must initially return a typed blocker?
