> Follow-on storage decision (2026-08-13):
> [`separate-project-facts-local-state-and-media-bindings`](../separate-project-facts-local-state-and-media-bindings/)
> replaces `ContentProjectComposition` as the association/membership root. The semantic boundary remains:
> Project owns exact Entity-to-Character association facts, while local membership, dependency summaries
> and Project Content are rebuilt from owning records.

## Why

OpenNeko currently exposes File, Media, Asset, Entity and Character as if they were peer user objects,
while several active changes duplicate character identity, representation, publication and interaction
facts across those owners. The product needs a layered model and one exact owner for local resource
access, project semantics and character authoring before the remaining Desktop wiring makes those
parallel paths harder to remove. World remains a future product extension outside this change.

## What Changes

- Define three layers: File/Media Library/Asset Library as local foundational resources, Project Entity
  as semantic information, and CharacterProject as an authorable project. The layers reference one
  another through exact owner-qualified identities without becoming one inheritance hierarchy.
- Present Files, linked Media and locally installed Assets through one owner-preserving Resources
  experience. Present project Characters, Worlds, other confirmed elements and candidates through a
  separate Project Content view; Entity is not exposed as a peer resource or top-level user concept.
- Define File as content addressed by the canonical Content contract, Media Library as connection and
  projection capability, and Asset as the only explicitly managed reusable package aggregate. File or
  Media discovery never creates Asset, Entity, Character, or World identity.
- **BREAKING**: narrow Project Entity to a project-local semantic anchor for kind, names/aliases,
  lifecycle, and accepted project representation bindings. Character definition, World definition and
  runtime, usage statistics, arbitrary domain payload, and interaction lifecycle are not Entity facts.
- Add an explicit project-owned Entity-to-Character association. Standalone Characters need no Entity;
  project-local Characters have one exact project Entity association; a Character Entity can remain
  non-interactive.
- Make prompt, file evidence, ordinary Asset representations, and confirmed Entity context seed the same
  fresh CharacterProject creation path. `.neko-character` remains a separate exact import workflow rather
  than another creator or live repository.
- Keep authoritative references in each consuming owner and project usage/recent/occurrence data as
  rebuildable Search/local-metadata projections. Destructive operations re-read typed reference owners
  and never trust a usage count or Entity registry as authority.
- **BREAKING**: remove Character dialogue, Room, and embody lifecycle commands from Entity ownership.
  Chara or product composition contributes exact CharacterProject/CharacterVersion handoffs only when an
  explicit association exists.
- **BREAKING**: remove Entity Asset publication, instantiation, provenance, and three-way update from the
  current canonical product path. Character portability stays Chara-owned and ordinary reusable
  representation resources stay Asset-owned. Local Asset install/resolve/uninstall is the only Asset
  lifecycle required by this change; cloud distribution is deferred.
- Compose existing WorldProject records into the read-only Project Content view without moving World
  authoring, version, runtime or persistence authority into Project or Entity.
- Retire remaining public legacy Character Registry and creative Entity asset-composition contracts;
  preserve existing user bytes and provide no compatibility or fallback reader.

## Capabilities

### New Capabilities

- `creative-resource-semantic-composition`: Defines the local foundational resource, Entity semantic and
  Character authoring layers plus their exact reference, creation, usage-projection and association
  boundaries across Content, Media, Asset, Entity, Chara, Search and Project.

### Modified Capabilities

- `media-library-resource-entry`: Presents only owner-preserving File, Media and Asset sources through
  Resource Browser; semantic Project content remains outside the resource source contract.
- `unified-entity-representation-bindings`: Narrows Project Entity facts and representation bindings,
  removes Entity Asset/interaction authority, and defines optional exact Character and World composition.

## Impact

- Owning responsibility: `@neko/content` keeps locator/read/representation contracts;
  `@neko/assets-domain` keeps Media connection projections and explicit Asset package lifecycle;
  `@neko/entity-domain` keeps minimal project semantic identity; `@neko/chara` keeps CharacterProject,
  CharacterVersion, Storyline and interaction;
  `@neko/project` keeps project-local membership and exact cross-domain association/dependency facts;
  Search/local metadata keeps rebuildable discovery and usage projections.
- Affected packages: `packages/content`, `packages/assets/*`, `packages/entity/*`, `packages/chara*`,
  `packages/project*`, `packages/search/*`, their Webview packages, and the thin Desktop
  composition root through public ports only.
- Affected active changes: `manage-project-entities-as-publishable-assets`,
  `establish-manifest-backed-asset-library` and `refine-character-management-authoring-and-version-graph`
  must remove or supersede conflicting tasks instead of retaining parallel success paths. World changes
  are not implementation dependencies of this change.
- User data: existing Project Entity, Character, Asset, file, Conversation, Room and memory records remain
  untouched. Contract removal must preserve bytes, expose exact diagnostics for
  unsupported former records, and must not invent migration, fallback, automatic association, or latest
  version selection.
