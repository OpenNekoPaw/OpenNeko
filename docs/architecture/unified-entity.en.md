# Unified Entity Architecture

Updated: 2026-08-05

[中文](unified-entity.md)

Project Entity is the only mutable project authority for character, scene, object, location, and style
identity. Media Library owns directly accessible files. Asset Library owns explicitly managed,
immutable package revisions. These identities remain separate even when they refer to the same creative
subject.

## Current Boundary

- `neko/entities.json` is the versioned, expected-revision Project Entity fact authority.
- It stores stable IDs, kind, accepted names and facts, lifecycle, durable representation bindings, and
  exact Asset provenance.
- Candidate evidence, occurrences, binding availability, search rows, thumbnails, and authoring drafts
  are not facts. They are rebuildable local-metadata projections or workflow-owned state.
- Workspace, document, Media, and Asset discovery can emit candidates, but only an explicit Entity
  operation can create or change a stable Project Entity.
- Removing a file, Media link, generated output, or installed Asset never deletes or silently mutates a
  Project Entity.

## Representation Identity

An accepted binding points to one closed `ContentLocator`: `workspace-file`, `document-entry`,
`generated-output`, or `package-resource`. A package reference carries exact package ID, revision,
digest, and package-relative member identity. Bindings never persist absolute paths, link targets,
cache paths, provider URLs, Webview URLs, runtime handles, or retired catalog IDs.

Availability is derived through the resource owner. A missing or mismatched target produces a visible
needs-attention state and an explicit rebind, reinstall, or reconnect action. It does not trigger a
same-name, latest-revision, recent-workspace, or legacy-catalog fallback.

## Resource Browser And Inspector

Workspace Resource Browser exposes four owner-preserving facets: `files`, `media`, `assets`, and
`entities`. Facet switching is display state, not a Workbench tab or another catalog. Candidate,
confirmed, needs-attention, and deprecated Entity rows remain visibly distinct.

Entity management uses one package-owned `entity.manage` path. The Webview submits a versioned intent;
the Resource Browser controller validates the selected capability, Entity or candidate identity, and
project revision before delegation. The Entity Node runtime generates IDs, timestamps, and binding
authority and commits through the canonical operation service. Desktop Main only supplies the exact
workspace and public local-metadata repository.

Confirm, edit, bind, and unbind have a production Desktop path. Merge and deprecate remain hidden with a
blocker until every typed reference owner can participate in one complete rewrite plan. Asset,
Conversation, Character, and Room actions are exposed only when their exact owner port and identity are
present; the Inspector never synthesizes Agent commands or fallback conversations.

Candidate confirmation coordinates the canonical JSON commit and rebuildable SQLite decision through a
workspace-scoped recovery journal. Success is returned only after both effects complete. A subsequent
operation recovers an interrupted journal first. The journal is workflow recovery state, not a second
fact authority; unknown versions, corruption, and revision divergence fail visibly.

## Entity Assets

An Entity Asset is an immutable publication snapshot, not a live Project Entity. Instantiation creates a
new Project Entity ID and records the exact origin revision, digest, and import base. Updates use an
explicit three-way diff among import base, current project facts, and the newer Asset snapshot.
Conflicting fields remain unchanged until resolved.

The Entity domain already owns deterministic instantiate, portable-publication, diff, and apply
services. Production install, publication, and cloud replication are not available until the
manifest-backed Asset Library supplies its package lifecycle and provider adapters. Unsupported actions
stay capability-gated; they must not report success through an in-memory adapter, flat file catalog, or
legacy fallback.

## Ownership

| Owner                 | Responsibility                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| `@neko/entity-domain` | Entity codecs, lifecycle, Inspector intent routing, reference plans, Asset conversion and diff/apply   |
| `@neko/entity-node`   | Authorized atomic `neko/entities.json` repository, migration, candidate coordination, recovery journal |
| Search/local metadata | Rebuildable candidates, occurrences, availability, freshness, and search projections                   |
| Assets                | Immutable package lifecycle and distribution once the manifest-backed runtime is implemented           |
| Desktop               | Sender/window/workspace authorization and public-port composition only                                 |

See [Asset Library](asset-library.md), [Local Metadata](adr-local-metadata-store-sqlite.md),
[Package Boundaries](package-boundaries.md), and the active
[Project Entity OpenSpec](../../openspec/changes/manage-project-entities-as-publishable-assets/).
