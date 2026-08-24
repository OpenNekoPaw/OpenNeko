## Why

Project Entity facts were fragmented across character, per-kind, candidate, binding, requirement and
draft files. The product needed one canonical project fact authority plus searchable candidates,
reference-safe lifecycle operations and an owner-qualified Entity inspection path without creating a
global Entity catalog or another resource authority.

## What Changes

- Define Project Entity as the canonical mutable project instance for character, scene, object,
  location and style identity.
- Consolidate confirmed Entity identity and accepted representation intent into one canonical project
  fact authority under `neko/`; keep candidates, availability, occurrences and other rebuildable
  workflow state outside that authority.
- Make Workspace/document/Asset/Media analysis produce searchable candidate and occurrence
  projections; stable Entity operations require explicit create, confirm, merge or import intent.
- Provide an Entity-owned Inspector for confirmed facts, bindings, reference blockers, candidate
  decisions and fail-local diagnostics. Project Content may navigate to this owner but does not copy
  Entity facts or fabricate a writable Inspector.
- Keep missing content, removed Media Library links, unavailable Assets and changed fingerprints from
  deleting or silently mutating Project Entity facts.
- **BREAKING**: leave fragmented historical files untouched but outside product reachability; normal
  runtime accepts semantic facts only through canonical Entity operations.
- Entity Asset publication, mandatory peer Resource Browser facets and Entity-owned Character
  dialogue/Room/embody were superseded by later owner-boundary changes and are not part of this
  archived capability.

## Capabilities

### New Capabilities

- `project-entity-authority`: Canonical project Entity document, candidate/confirmed lifecycle,
  searchable projections, reference-safe merge/deprecate and derived availability rules.
- `project-entity-management-surface`: Entity-owned inspection, candidate decisions, binding
  management, reference blockers and failure-scoped presentation.

### Modified Capabilities

None.

## Impact

- `@neko/entity-domain` owns Project Entity semantics, codecs, lifecycle, reference plans and
  Inspector contracts; `@neko/entity-node` owns Workspace file adapters.
- Search/local metadata own rebuildable candidate, occurrence and availability projections.
- `@neko/project` composes owner-preserving Project Content read projections; it does not become an
  Entity writer.
- Entity Webview owns Inspector presentation; Desktop only composes sender-bound typed ports and
  owner-qualified navigation.
- Existing fragmented Entity-related bytes remain untouched. Canonical readers reject only the exact
  invalid record, preserve valid siblings and never invoke a migration or compatibility reader.
