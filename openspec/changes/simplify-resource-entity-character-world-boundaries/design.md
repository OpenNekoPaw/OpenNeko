## Context

The repository already has useful owner boundaries, but its product and contract vocabulary still treats
unlike things as peers instead of three layers:

- a File is byte-addressable content;
- Media Library is a linked-directory connection and rebuildable projection;
- an Asset is an explicitly managed reusable package;
- Project Entity is a project semantic identity;
- Character is an authoring and interaction aggregate;
- World is a future authoring/runtime extension and is not part of this change.

The active Entity change implemented a canonical `neko/entities.json`, candidate/occurrence projections,
binding availability and an Entity management surface. It also implemented deterministic Entity Asset
services and declared exactly four Resource Browser facets plus Entity-owned integration intents. Chara
now provides the stronger owner for Character definition, portability and interaction. Keeping all prior
decisions would leave duplicate identity, representation, publication and launch paths.

The change must preserve local user data, keep the Desktop composition root thin, retain strict typed
boundaries, and remove paths atomically rather than add compatibility readers, migrations, fallbacks or
feature-flag alternatives.

## Goals / Non-Goals

**Goals:**

- Establish three layers: local foundational resources, Entity semantic information and Character
  authoring projects.
- Keep one exact internal owner for content access, local reusable packages, project semantic identity
  and Character authoring/interaction.
- Preserve Entity's valuable role as a project semantic anchor for discovery, aliases, occurrences,
  cross-tool reference and explicit promotion into richer domain objects.
- Make every Character creation seed produce the same CharacterProject contract and repository result.
- Separate authoritative dependency facts from rebuildable usage/search/recent projections.
- Remove product and public-contract reachability for legacy registries, Entity Asset lifecycle and
  Entity-owned Character interaction.
- Record implementation gaps without presenting unimplemented Asset or World capabilities as available.

**Non-Goals:**

- A universal Resource, CreativeObject, Version, Graph, Session or package aggregate.
- Automatic candidate confirmation, Asset promotion, Character creation, association, content sync,
  latest-version selection or cross-world memory transfer.
- Moving Character facts into Entity or usage statistics into any authoritative
  domain record.
- Implementing World contracts/runtime/UI or Asset cloud distribution in this change.
- Reading, converting, migrating or deleting unsupported existing user records through normal product
  startup.

## Decisions

### 1. Classify the concepts by responsibility instead of inheritance

The canonical topology is:

```text
infrastructure
  ContentLocator + ContentRead/Representation
  Search/local-metadata projections

resource lifecycle
  MediaLibraryConnection
  AssetPackage / exact Asset revision

semantic and authoring layers
  ProjectEntity
  CharacterProject -> CharacterVersion
```

ProjectEntity is semantic information, not a superclass of Character. Character owns a richer,
independent authoring lifecycle and can exist in a standalone library.

Alternative considered: one universal Resource/Entity hierarchy. Rejected because file mutation,
directory relink, package install, semantic merge, Character finalization and World Save have incompatible
authority and deletion rules.

### 2. Unify resource presentation, not resource authority

Resource Browser presents one resource experience with owner-preserving sources such as Project Files,
Shared Media, Installed Assets and Project Elements. Source selection is package-owned display state; it
does not convert identities, copy records or create a cross-owner catalog.

The internal owners remain exact:

- Content/Host authorizes and reads workspace or document content.
- Media Library owns connection/relink/remove operations and source-derived projections.
- Asset Library owns only explicitly imported, installed or published package identity.
- Entity owns confirmed project semantic identity and accepted project representation bindings.

Search can aggregate a common read-only result projection containing owner, exact identity, label,
preview descriptor, availability and declared operations. The projection cannot become a write authority.

Alternative considered: retain exactly four mandatory peer facets. Rejected because it leaks internal
source taxonomy into every user workflow and causes linked Character/Entity results to appear as separate
objects. Owner-preserving source filters provide the same safety without four user mental models.

### 3. Narrow Project Entity to a project semantic anchor

The target ProjectEntity facts are limited to:

- stable `entityId` and project owner;
- semantic kind;
- canonical/display names and aliases;
- active/deprecated lifecycle and explicit replacement identity;
- accepted project representation bindings using closed durable resource references;
- creation/update audit timestamps required by the current owner.

Arbitrary Character payload, usage counts, recent-use, occurrences, inferred relationships,
Character association payload, runtime state, provider/model configuration and portable publication
provenance are not Entity facts. Candidate, occurrence, freshness and binding availability remain
rebuildable Search/local-metadata projections.

Existing canonical records containing fields removed by the new contract are preserved byte-for-byte and
reported as owner-local invalid records. Normal startup does not migrate or silently discard them. A later
explicit user-data qualification task must define a review/export repair operation before the stricter
codec becomes production canonical.

Alternative considered: retain unrestricted `facts` and document field ownership by convention. Rejected
because neither codecs nor tests can prevent Chara/World facts from becoming a second authority.

### 4. Project owns the Entity-to-Character association

The project composition owner records an exact association between one project Character Entity and one
CharacterProject. It stores only identities, not Character payload:

```ts
interface ProjectEntityCharacterAssociation {
  readonly entityId: string;
  readonly characterProjectId: string;
}
```

The association lives inside the exact `ContentProjectComposition`, whose `contentProjectId` is the
owner identity; it does not duplicate that identity inside each association row.

First-phase cardinality and behavior:

- a standalone Character has no required Entity;
- a project-local Character has exactly one project-local Character Entity association;
- a Character Entity has zero or one association;
- the same standalone CharacterVersion can be an external dependency of multiple projects, each with its
  own Entity association or project actor binding;
- runtime launch still requires an exact CharacterVersion and never infers latest/current/head.

Project owns the association because it decides how a reusable Character participates in one project's
semantic space. Chara remains reusable and does not persist project Entity identities.

Alternative considered: store `entityId` in CharacterProject. Rejected because a standalone Character can
participate in multiple projects and Chara must not own their semantic identity.

### 5. Character creation has one fresh-draft result

Manual entry, prompt, file evidence, ordinary Asset representations and confirmed Entity context are seed
sources for one fresh CharacterProject creation operation. They do not create distinct Character types or
repositories.

```text
prompt / evidence refs / exact Asset refs / confirmed Entity context
  -> canonical Agent Character Creator or manual authoring
  -> explicit destination and approval
  -> fresh CharacterProject draft
```

Project-local creation composes fresh CharacterProject creation, Project membership, ProjectEntity
creation-or-selection and exact association as one observable workflow. Partial commit must remain visible
and retry only the missing exact step; it must not select another active project or Character.

`.neko-character` remains a separate untrusted archive import because it preserves exact user-managed
Character records and identities. It is not a Character Creator input, live repository or mounted
Workspace.

### 6. Separate authoritative references from usage projections

Every consumer persists its own exact dependency:

- Chara stores exact representation refs and Chara-owned runtime facts.
- Canvas and documents store their own Entity or Content refs.
- Project stores local membership, external immutable dependencies and Entity/Character association.
- Agent/Chara launch records exact CharacterVersion and Conversation/Room identities.

Search/local metadata derives occurrence, usage count, dependency summary, recent-use and availability
views from owner records and owner-qualified notifications. Notifications only invalidate or incrementally
refresh projections; they are not a second event-sourced authority.

Before merge, delete, uninstall or version removal, the owning application service queries every required
typed reference reader against current authoritative records. A stale or incomplete usage projection can
never authorize a destructive operation.

Alternative considered: make Entity a global usage/reference registry. Rejected because it would copy
facts from every domain and make Entity availability a prerequisite for unrelated owner operations.

### 7. Chara and product composition own interaction handoffs

Entity management owns candidate confirmation, semantic naming/lifecycle, representation binding and
reference inspection only. It does not own Character dialogue, Room, embody, Conversation or Agent launch
commands.

When an exact ProjectEntityCharacterAssociation exists, the composed resource/Project Element projection
may include Chara-provided `Open Character`, `Open Studio` or `Start Interaction` actions. Those actions
carry exact CharacterProject/CharacterVersion inputs required by the Chara launch contract; Entity does
not define or execute their lifecycle.

Alternative considered: retain generic Entity interaction ports. Rejected because vague `characterId`
capabilities cannot enforce CharacterVersion selection and duplicate Chara's launch owner.

### 8. Portability stays with the owning product domain

The current canonical product path does not expose or wire generic Entity Asset instantiation,
publication, provenance, update availability or three-way diff/apply.

- ordinary reusable resources use Asset packages;
- Character portability uses Chara-owned `.neko-character` transport;
- mutable ProjectEntity facts remain project-local.

Implemented Entity Asset contracts/services are removed from public entries and production registration,
then deleted once reachability tests prove no consumer. Existing package bytes or Project records are
preserved; unsupported provenance is reported rather than migrated or reinterpreted.

Alternative considered: keep Entity Asset hidden for future use. Rejected because unused public contracts
and services preserve a parallel publication model and continue shaping Entity fields and UI intents.

### 9. Keep World as a future consumer

World is outside this change's implementation and acceptance scope. A future World change may reference
exact CharacterVersion and ProjectEntity identities, but it must keep world-local state in its own owner
and cannot copy or mutate Character or Entity facts. No World registry, repository, DTO, handler or UI is
added or changed by this change.

### 10. Owner and runtime boundary inventory

| Owner       | Canonical role/public path                              | Producer                                        | Consumer                                                        | Runtime boundary                         | Replaced path                                                              | User-data impact                                       |
| ----------- | ------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------ |
| Content     | `@neko/content` locator/read/representation contracts   | owning Content/Host adapters                    | Assets, Entity, Chara, World, Canvas, Preview                   | host-neutral contract + Host adapter     | per-feature file readers                                                   | no identity conversion; bytes remain with source owner |
| Media/Asset | `@neko/assets-domain` public entries                    | Media connection and Asset application services | Resource Browser and domain resource pickers                    | host-neutral + Node package/file adapter | flat/path-derived Asset catalog and peer UI concepts                       | links and package bytes remain independent             |
| Entity      | `@neko/entity-domain` canonical document and operations | Entity application service                      | Search, Agent context, Project, Canvas, Chara/World composition | host-neutral + Node repository           | legacy Character Registry, creative composition and Entity Asset lifecycle | existing invalid records preserved with diagnostics    |
| Project     | `@neko/project` composition public contracts            | Project application service                     | Workspace authoring, Chara, World, Desktop composition          | host-neutral + Node repository           | inferred active/current association                                        | stores exact membership/association only               |
| Chara       | `@neko/chara/contracts` and `@neko/chara/application`   | Chara authoring/interaction services            | Chara Webview, Agent launch, World actor binding                | host-neutral + Chara Node repository     | Entity-driven Character runtime and duplicate creator paths                | Character facts/versions remain unchanged              |
| World       | `@neko/world/contracts` and `@neko/world/application`   | World authoring/runtime services                | World Webview, Agent/Chara adapters                             | host-neutral + World Node repositories   | speculative parallel World/Experience paths                                | Foundation project/version/run/save remain unchanged   |
| Search      | `@neko/search-domain` and local-metadata public entries | analyzers and projection coordinators           | Resource Browser, Agent query, management summaries             | host-neutral + SQLite adapter            | Entity-owned usage registry                                                | projections are rebuildable and disposable             |
| Desktop     | app composition public-port wiring only                 | Main/preload sender-bound adapters              | visible package Roots                                           | Electron trust boundary                  | app-owned business routing                                                 | no domain fact ownership                               |

Production logic retained in `apps/neko-desktop` is limited to Electron sender/window authorization,
native picker/Trash/window lifecycle, typed IPC and package Root composition. Association rules, creation
policy, reference validation and projection semantics are host-neutral and must remain package-owned.

## Risks / Trade-offs

- **[Risk] Existing Entity facts/provenance become unsupported user data** → inventory exact record shapes,
  preserve bytes, expose record-local diagnostics and require an explicit reviewed repair/export design
  before switching the production codec.
- **[Risk] Removing Entity Asset invalidates implemented but unused code** → prove public/production
  reachability first, remove registrations and exports atomically, then delete services/tests that only
  validate the superseded path.
- **[Risk] One Resource Browser hides owner differences** → every result retains owner identity,
  lifecycle, availability and owner-declared operations; presentation aggregation never supplies generic
  mutation commands.
- **[Risk] Cross-domain project Character creation partially commits** → define an exact workflow receipt
  and fail-visible retry for the missing association/membership step without rollback of valid user data.
- **[Risk] Usage projection is stale** → use it only for display; destructive commands re-query typed
  authoritative readers.
- **[Risk] World scope remains ambitious** → keep Foundation independently usable and require real
  producer/consumer evidence before each optional subcapability enters production.
- **[Trade-off] Project-local Character creation involves multiple owners** → composition is explicit but
  prevents Chara or Entity from absorbing Project membership and keeps standalone reuse possible.

## Migration Plan

1. Freeze this ownership table and reconcile conflicting active OpenSpec requirements/tasks before new
   Desktop wiring.
2. Inventory production/public reachability and real user record shapes for legacy Character Registry,
   creative Entity composition, unrestricted Entity facts, Entity Asset and generic interaction ports.
3. Add Project-owned Entity/Character association and owner-qualified usage/reference projections with
   contract tests while keeping existing successful paths unchanged.
4. Atomically switch Character creation, composed actions and resource presentation to the new contracts;
   remove replaced registrations, exports, fixtures and tests in the same boundary.
5. Qualify existing Entity records. Preserve unsupported bytes and expose explicit record-level repair or
   export requirements; do not add a normal migration/compatibility reader.
6. Remove Entity Asset and legacy public code after reachability proof, then update stable architecture and
   product terminology.
7. Verify affected packages, architecture gates, real Resource/Character Electron flows and sibling
   failure isolation before marking the change complete.

Rollback is source-level only. It restores the previous canonical source revision without rewriting user
records, re-enabling retired readers, selecting fallback identities or deleting new valid records.

## Open Questions

- Which existing `ProjectEntityRecord.facts` keys contain user-authored facts that require an explicit
  review/export path before the strict minimal contract can be activated?
- Does the current Project owner already have an appropriate narrow association record, or should the
  association be added beside existing local Character membership in one canonical document?
- Which Entity Asset package bytes or provenance records exist outside tests and require user-visible
  unsupported-state handling?
- Which World optional subcapability is the first real product consumer after Foundation: Story,
  deterministic interaction surface, or Experience composition?
