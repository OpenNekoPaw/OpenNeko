## Why

The previous pass collapsed the Media Library owner chain by treating the managed Workspace link as the
only business authority. A follow-up "restore" attempt then overcorrected in the opposite direction,
reintroducing a second `MediaLibraryContentLocator` content identity alongside the Workspace path. The
result was two durable content identities for the same mounted bytes — one Workspace path for Agent, one
Media Library locator for Canvas/Cut/Entity/Search/packaging — with producers translating between them.
That translation produced dual read paths, durable-locator rejection regressions and identity drift.

The product needs one durable content identity plus a distinct mount-management layer. A mounted Media
Library file is an ordinary Workspace file at `neko/assets/<libraryName>/<relativePath>`. Global directory
registration, the target-free project binding and the managed link remain the authorization and symlink
escape protection, not a second content identity.

## What Changes

- Keep the user-global Media Library catalog as the only source from which a project Media Library can be
  authorized, with target-free project-local `.neko/media-libraries` binding records, immutable recovery
  plans and exact global connection identity.
- Keep `neko/assets/<libraryName>` as a mandatory managed symlink/junction derived from an exact project
  binding — a mount-management projection, not a content identity.
- Unify content identity on one normalized workspace-relative `WorkspaceFileContentLocator`
  `neko/assets/<libraryName>/<relativePath>`. Remove `MediaLibraryContentLocator` and every media-library
  dispatch, handler, serializer, parser and path normalizer across Content, Canvas, Cut, Entity, Search,
  Resource Browser, Text Editor, packaging and Agent.
- Make mounted-file reads use the same workspace-file path as ordinary files. The binding-backed
  `authorizeProjectWorkspaceContentPath` validates the exact binding → global connection → managed link
  when the path falls under `neko/assets/<libraryName>`, preserving symlink escape protection without a
  second content authority.
- Preserve independent mount-management identities/types: global connection IDs, project bindings,
  project target kind, Canvas copy action IDs and the binding-backed workspace path authorizer.
- Keep Resource Browser projections hierarchy-closed and reject malformed input at the package boundary so
  one bad resource does not crash the containing Desktop panel.
- Preserve sync/package separation: project facts synchronize, `.neko` and managed links do not, and an
  explicit portable snapshot copies only referenced bytes.

## Capabilities

### Modified Capabilities

- `workspace-linked-media-library`: Defines the managed Workspace access projection, its derivation from
  project/global authorization, and the single workspace-relative locator path shared by all consumers.
- `media-library-resource-entry`: Keeps global registration, project binding and recovery as mount
  management while projecting mounted files as ordinary workspace-relative files.
- `desktop-assets-canvas-integration`: Keeps Desktop as sender/native-selection adapter; Agent and Canvas
  consume the managed Workspace projection through the shared workspace-file path.

## Impact

- `@neko/assets-domain` owns Media Library association/recovery policy and managed-link projection plans.
- `@neko/assets-node` owns global connection resolution, target-free local binding persistence, link
  inspection/materialization and the binding-backed workspace path authorizer.
- `@neko/content` keeps a single `ContentLocator` union with no media-library kind;
  `DocumentEntryContentLocator.source` is a `WorkspaceFileContentLocator`.
- Agent, Canvas, Cut, Entity, Search, Resource Browser, Text Editor and packaging all consume
  `neko/assets/<libraryName>/<relativePath>` as a durable workspace-file path.
- `apps/neko-desktop` remains a thin Electron adapter for sender identity and native directory selection.
- Existing `.neko` bindings remain current local authorization. Workspace links are retained and adopted
  only when they match one exact registered global connection; ambiguous or conflicting state remains
  visible for explicit repair.
