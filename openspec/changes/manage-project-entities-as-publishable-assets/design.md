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

- Establish one canonical project Entity fact authority and make derived state rebuildable.
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
kind, names/aliases, accepted facts, lifecycle state, accepted representation intent, and provenance.
An Entity Asset is an immutable user-managed Asset package revision containing a frozen semantic snapshot
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

### 9. Retired authority and consumer inventory

The retirement boundary covers every former producer of Entity semantic facts rather than only the
Resource Browser reader. The following sources were audited before defining the canonical document:

| Current source                                                                      | Current producer / reader                                                                          | Classification and target                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| root `characters.json`                                                              | `ProjectEntityStore`, character registry adapters, Character profile assembly                      | Retired input remains untouched and product-unreachable; new accepted character facts enter only through canonical Entity operations, while character runtime projections remain owned by Chara.                           |
| `neko/entities/scenes.json`, `locations.json`, `objects.json`, `styles.json`        | `ProjectEntityStore`, `CreativeEntityService`, Agent core tools                                    | Retired inputs remain untouched; per-kind normal readers are deleted.                                                                                                                                                      |
| `neko/entities/candidates.json`                                                     | `CandidateStore`, `CreativeEntityService`, Search Entity adapter                                   | Evidence, confidence, source references, freshness, rejection and dismissal are rebuildable/workflow projection state; an explicitly confirmed or merged result becomes a canonical operation, not a copied candidate row. |
| `neko/entity-representation-bindings.json`                                          | `EntityRepresentationBindingService`, Resource Browser, Canvas/Cut/Agent representation resolution | Retired bindings remain untouched; new confirmed target, role, default selection, source and acceptance enter only through canonical operations, while availability remains derived.                                       |
| `neko/entity-asset-requirements.json`                                               | `EntityAssetRequirementService`, Chara profile assembly                                            | Current missing/suggested/generated/bound/dismissed rows are workflow state. Explicitly accepted representation intent is represented by canonical bindings; unresolved rows are archived for inspection.                  |
| `neko/visual-identity-drafts.json`                                                  | `VisualIdentityDraftService`, Chara profile assembly                                               | Prompts, generated output selections and extracted suggestions are authoring workflow state and remain outside canonical identity facts; accepted semantic values or bindings enter only through typed Entity operations.  |
| Entity Asset projection records in local metadata                                   | `EntityAssetMetadataProjector`, Search local metadata binding                                      | Candidate, occurrence, binding availability and freshness remain rebuildable projections; they never become a second fact authority.                                                                                       |
| Asset manifests and installed packages                                              | Assets manifest/lifecycle readers                                                                  | Immutable Entity Asset snapshots and exact package resources are import/publication inputs. Install, uninstall and sync never mutate Project Entity facts.                                                                 |
| Canvas/NKC, Agent context, Chara memory/dialogue and project portability references | Canvas contracts, Agent content effects/tools, Chara runtimes, Assets reference readers            | These are typed reference consumers. Merge/deprecate/delete must obtain a complete rewrite or blocker response from each owner; they do not own Entity facts.                                                              |

The normal consumer switch includes `CreativeEntityService`, Search `creative-entities`, Resource Browser,
Agent Entity capability/content effects, Canvas material Entity refs, Chara profile/dialogue projection,
and Assets project-reference/portability readers. Product tests prove retired inputs are unreachable;
only an explicitly authorized offline repair tool outside the product graph may inspect them.

`scene` is a valid Project Entity kind in the canonical document. The current generic Asset manifest
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
- **[Trade-off] One JSON authority increases write contention** → Serialize mutations in the workspace
  Entity owner and use atomic replace with exact request identity.

## Replacement Plan

1. Add the canonical Entity codec/repository and identify all product-reachable Entity producers.
2. Delete fragmented readers/writers and prove retired files remain untouched and product-unreachable.
3. Write `neko/entities.json` atomically through the workspace Entity owner, compute candidate/search/
   availability projections, and verify reference resolution.
4. Switch Entity consumers, Resource Browser, Agent effects, and bindings to the canonical public ports.
5. Prove fragmented normal readers/writers, fallback mappings and product recovery archives are absent.
6. Enable Entity Asset instantiate/publish/update workflows over the generic Asset adapter and verify that
   cloud sync never reads the project Entity document.

Rollback is source-level and leaves all existing files untouched; normal retired readers are not re-enabled.

## Open Questions

- Which Canvas, Agent, Chara, document, and portability reference owners can participate atomically in
  the first merge/rewrite transaction, and which must initially return a typed blocker?

## Implementation Dependency Status

As of 2026-08-05, the canonical `neko/entities.json` repository, retired-path removal, candidate and
availability projections, Resource Browser Inspector, package-owned `entity.manage` route, and basic
confirm/edit/bind/unbind Desktop delegation are implemented. The Desktop application root only injects
the exact workspace and public repositories; Entity IDs, timestamps, operation semantics, canonical
commit, candidate decision, and interruption recovery remain package-owned.

Production merge/deprecate remains capability-blocked because the complete Canvas, Agent, Chara,
document, portability, and other reference-owner participant set is not yet configured. The dependency
change `establish-manifest-backed-asset-library` remains 0/25: there is no production immutable package
runtime, exact-revision reader, publication lifecycle, cloud provider, or tombstone path. Entity Asset
services and typed ports are deterministic and tested, but instantiate/publish/diff/apply-update must not
be exposed as successful production operations until that owner is implemented and wired.

## Verification Status

On 2026-08-05, affected package tests/typechecks, `pnpm build`, `pnpm test`, `pnpm check`,
`pnpm check:legacy-debt`, `pnpm check:unused`, and the complete `pnpm ci:local` gate passed. Canonical
resource and path tests prove fragmented readers are absent, serialize owner mutations, and keep
interrupted candidate decisions local without returning partial success.

The real Electron `resource-browser-entity-management` scenario passed and produced canonical revision 2
after candidate confirmation, then projected a missing binding as needs-attention and retained two exact
reference blockers. Unsupported Asset lifecycle operations were absent, and the run recorded no console
errors, warnings, or exceptions. The report is stored under the gitignored local evidence root at
`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-04T23-22-38.720Z-resource-browser-entity-management-development/report.json`.

Unknown legacy fields remain classified as `unresolved-archive`; ambiguous identity or binding values
remain explicit confirmation items. Residual user-data risk is limited to real heterogeneous workspace
migration coverage, not an unclassified deletion path. Complete reference-owner participation and the
manifest-backed publication/provider/tombstone runtime remain capability blockers, so tasks 5.3, 5.4,
and 6.3 stay open.

## Project-open migration composition

`@neko/entity-node` owns one `restoreProjectEntities` application path: inspect canonical document and legacy
inventory, archive and migrate only an unambiguous inventory, then refresh canonical Entity/candidate/occurrence
projection. Desktop Main only injects authorized workspace and local-metadata ports and calls this path before the
Assets Resource Browser snapshot is described as ready. Renderer must not read `characters.json`, candidate
registries, or semantic occurrence tables directly. Ambiguity, stale revision, archive failure, or invalid source
returns a typed diagnostic rather than a successful empty Entity facet.

## Resource context-menu ownership

Resource Browser owns one presentation-level context menu whose commands are derived from the selected
facet, item role, and declared capabilities. Workspace Files may create directories, import picker-authorized
local files, and move files or directories to the OS Trash through Assets Node operations with expected
projection revision and contained workspace locators. Import copies bytes in Node and never transports large
file bodies through Renderer IPC.

Media exposes library-link management and existing content actions, but deleting a linked content item is not
offered because the physical library may be shared by multiple projects. Assets remain read-only until the
manifest-backed Asset lifecycle owner exists. Entity lifecycle changes remain typed Entity Inspector intents.
The menu must not infer a generic delete operation across these owners or turn unsupported operations into a
successful no-op.

## Component-local data lifecycle

Resource Browser presentation state is rebuildable component-local memory. It has no schema/version field and no
migration path. A stale selection, expanded container, query, or view preference is discarded or reconciled only
inside the exact project Resource Browser instance; it never invalidates Project Entity facts, workspace content,
Canvas, Agent, or the surrounding Desktop scene.

Main/preload/Renderer messages are ephemeral typed wire contracts rather than component data. They remain strict
and fail-visible, but every runtime must load their canonical package source instead of a copied dependency
prebundle. Development reload does not add old/new-version compatibility branches: a changed contract rebuilds the
participating runtimes together. A Resource Browser snapshot or operation failure renders the owner-local
unavailable state and must not replace or disable sibling product surfaces.
