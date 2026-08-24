## Context

The implemented Project Entity path now has one canonical Entity document, rebuildable candidate and
availability projections, an Entity-owned Inspector and sender-bound Desktop composition. Later
resource-boundary work retired Entity Asset publication, mandatory peer Resource Browser facets and
Entity-owned Character runtime actions. Current Project Content is an owner-preserving read projection;
it may navigate to an Entity owner but cannot become another Entity authority.

## Goals

- Preserve one canonical Project Entity fact owner.
- Keep candidate, occurrence, search and availability data rebuildable.
- Keep merge, deprecate and delete reference-safe and fail-visible.
- Expose exact Entity inspection and decisions through package-owned contracts.
- Preserve invalid records and valid siblings without reading fragmented historical authorities.

## Non-goals

- Entity Asset instantiate, publication, provenance, update or cloud distribution.
- A four-facet Resource Browser or a second semantic resource catalog.
- Character dialogue, Room or embody ownership inside Entity.
- Migration, compatibility reading or automatic repair of fragmented historical files.

## Five-layer analysis

| Layer          | Decision                                                                                                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | `@neko/entity-domain` owns facts, lifecycle, reference plans and Inspector contracts; `@neko/entity-node` owns Workspace persistence; Search/local metadata own rebuildable projections; Project owns only Project Content composition; Desktop owns sender authorization and wiring. |
| Dependency     | Entity contracts remain host-neutral. Renderer/Webview receives typed projections and intents, never filesystem paths, SQLite handles or Electron objects.                                                                                                                            |
| Interface      | The public path carries exact Project, Entity, request and owner identities. Unknown records or unsupported intents fail in the smallest Entity boundary.                                                                                                                             |
| Extension      | New reference owners participate through explicit narrow reference/availability ports. No registry fallback, wildcard handler or cross-domain Entity adapter is introduced.                                                                                                           |
| Testing        | Producer, consumer, Desktop delegation, stale request, conflict, retired-path absence and isolated Electron sibling-isolation evidence cover the retained path.                                                                                                                       |

## Canonical data and lifecycle

The canonical Entity repository stores accepted user facts and bindings. Candidate evidence,
occurrences, search rows and availability are projections that can be rebuilt from their current
owners. Missing resources can only produce a needs-attention diagnostic; they cannot delete or rewrite
Entity facts.

Create, confirm, edit, bind, merge, deprecate and delete enter through the Entity application owner.
Reference-changing operations collect exact owner responses before committing. An unknown or rejected
reference plan blocks only that operation and preserves original facts.

Fragmented historical files remain untouched and product-unreachable. The normal application never
classifies, imports, migrates or repairs them. Recovery would require a separately authorized offline
change.

## Presentation and Desktop composition

Project Content preserves Character, World, Entity and Candidate owner identity in a read projection.
When an Entity operation exists, navigation targets the exact Entity-owned Inspector. Project and
Desktop do not copy Entity payloads or synthesize a writable fallback.

The Entity Webview owns disposable selection and inspection state. Invalid presentation state resets
only that surface. Invalid Entity data produces an owner-qualified diagnostic while valid sibling
Entities, Project Content, Resources, other Workspaces and the Desktop Shell remain available.

Desktop Main binds the exact sender and Workspace grant, then delegates to Entity public ports.
Renderer cannot access files, metadata stores or a generic mutation channel.

## Retired scope

Entity Asset publication and update workflows, mandatory peer Resource Browser facets and Entity-owned
Character dialogue/Room/embody were retired before archival. Their delta specs and implementation
promises are deliberately absent from this change. The accepted resource/entity and Project Content
specifications remain authoritative for those boundaries.

## Verification evidence

- Entity Domain/Node, Search, Project, Assets and Desktop focused tests/typechecks passed.
- Producer/consumer, stale request, conflict, canonical handler and retired-path absence tests passed.
- Repository build/test/check/legacy/unused and local CI evidence is recorded in `tasks.md`.
- The isolated Electron Entity scenario passed candidate confirmation, binding attention, merge
  blockers and invalid-record sibling isolation.
- Superseded Entity Asset runtime behavior is neither implemented nor claimed.
