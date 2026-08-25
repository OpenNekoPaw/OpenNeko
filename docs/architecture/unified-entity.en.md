# Unified Entity Architecture

[中文](unified-entity.md)

Project Entity is the project-local authority for “who or what is this.” It is not a superclass or payload
container for Character or World. See [Creative Resource and Semantic Boundaries](creative-resource-semantic-boundaries.md)
for the complete cross-domain model.

## Minimal Authority

A Project Entity owns only:

- stable Entity and Project identities plus a semantic kind;
- canonical/display names and aliases;
- active/deprecated lifecycle and an explicit replacement identity;
- accepted project representation bindings;
- owner-required creation and update timestamps.

It does not own Character or World definitions, provider/model configuration, memory, storyline, runtime
state, usage statistics, package provenance, or interaction sessions. Candidate evidence, occurrences,
availability, inferred relationships, recent use, and usage counts are rebuildable Search/local-metadata
projections.

Existing records that exceed the narrowed contract must be qualified before the strict reader changes.
Unsupported records remain byte-preserved and visible with record-local diagnostics; normal startup does
not migrate, discard, or fabricate defaults for them.

## Representation Identity

An accepted binding points to an owner-qualified durable resource reference: workspace content, a document
entry, a generated output, or an exact Asset package member. It never persists an absolute path, link
target, cache path, provider URL, Renderer URL, runtime handle, or retired catalog identity.

Availability is derived through the resource owner. Missing or mismatched content produces a visible
orphan/needs-attention state and an explicit rebind, reinstall, or reconnect action. It never triggers a
same-name, latest-revision, active-workspace, or side-catalog fallback.

## Character and World Composition

Global Characters do not require an Entity. A project-local Character is connected by a Project-owned
exact association containing only `projectId`, `entityId`, and `characterProjectId`. CharacterProject does
not store a project Entity ID. Character dialogue, Room, embody, Conversation, Agent launch, and exact
CharacterVersion selection remain Chara-owned.

World can associate a world-local location or object with a Project Entity for discovery. World definition,
actor bindings, runs, saves, and branches remain World-owned, and actors reference an exact
CharacterVersion.

## Resource Browser and Inspector

Resource Browser presents one Resources experience with owner-preserving source filters such as Project
Files, Shared Media, Installed Assets, and Project Elements. Filtering, search, selection, and preview do
not convert identities or create a common mutable catalog.

Entity Inspector owns candidate decisions, naming, lifecycle, bindings, and reference diagnostics. It can
project Chara/World navigation or actions only when their exact association and owner contract exist. It
does not synthesize Agent commands, fallback conversations, or latest-version selection.

## Asset Boundary

Asset packages hold ordinary reusable resources. Character portability uses the Chara-owned
`.neko-character` transport, and World publication remains World-owned when its dependency closure exists.
The canonical product path does not expose Entity Asset publication, instantiation, provenance, update
availability, or three-way diff/apply.

Implemented experimental Entity Asset contracts and services are removed from public entries and
production registration after a consumer reachability audit. Existing bytes are preserved with an
unsupported diagnostic; no compatibility reader or reinterpretation is introduced.

## Safety Invariants

- Discovery cannot create or confirm Entity, Character, World, or Asset identity.
- Entity merge/delete operations require current typed reference readers; a usage projection cannot
  authorize destructive work.
- Removing a resource does not remove an Entity; it makes an affected binding orphaned.
- One invalid record or projection remains local and does not block sibling records or the workspace.
- Desktop performs sender/workspace authorization and typed delegation only; Entity policy stays in its
  owning package.
