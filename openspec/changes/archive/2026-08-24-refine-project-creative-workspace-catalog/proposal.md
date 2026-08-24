## Why

The Workspace Creation dock currently renders five fixed groups with row-like labels, detached
version selectors, and empty placeholders. It does not surface the existing Project Content Entity
and candidate projection, and it offers no cross-owner search, filtering, or meaningful ordering.
As Character, World, Content, Entity, and candidate records accumulate, the fixed groups consume
space without helping users find or assess the latest creative object.

## What Changes

- Replace the five fixed Workspace Creation groups with one compact card catalog.
- Load the existing Project Creative Workspace and Project Content projections together, without
  creating a generic writable creative aggregate.
- Add local search, owner-qualified type and scope filters, and recent/name/type sorting.
- Present Content, Character, World, Project Entity, Entity candidate, and exact global references
  with distinct card semantics and fail-visible diagnostics.
- Move exact global Character/World reference addition into a compact catalog command panel while
  preserving the existing add/update/remove/copy/synchronize commands.

## Impact

- Owning responsibility: `@neko/project-webview` owns catalog presentation and local presentation
  state; `@neko/project` owns the two canonical read projections and their composition metadata;
  Chara, World, Entity, and Content remain authoritative for their facts and timestamps.
- Package roles: `@neko/project` L0 contracts/application projection gain only owner-derived card
  metadata; `@neko/project-webview` consumes them; Desktop continues to authorize the exact
  Workspace and wire package ports.
- Canonical path: Desktop project-authoring bridge -> Project Creative Workspace and Project Content
  projections -> one Project Webview catalog. The replaced path is the five independent grouped row
  renderers in `ProjectWorkspaceRoot`.
- User data: no durable record, membership, reference, Entity, Character, World, or content file is
  migrated or rewritten. Query, filter, sort, and add-panel state are disposable Webview state.
- No generic creative DTO, shared writable registry, hidden retained Root, internal version field,
  fallback authority, or automatic Entity creation is introduced.
