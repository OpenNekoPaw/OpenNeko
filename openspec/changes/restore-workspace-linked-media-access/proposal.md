## Why

The current refactor simplified the implementation instead of the user workflow. It made the Workspace
link the Media Library authority, removed project-local bindings and Media Library content identity, and
forced every consumer onto `workspace-file`. This discarded existing global-library reuse, recovery,
availability, portability and owner-specific content behavior, while also creating Resource Browser and
Agent authorization regressions.

The product needs a simple UI backed by explicit layers: users choose an existing global Media Library or
register a directory once; the system owns project authorization, a recoverable local binding, and a
managed Workspace access link. Agent sees only the Workspace projection, but that restriction must not
flatten every other domain contract.

Media Library remains optional: project files are the default authoring path, while external media serves
large directories, existing archives and cross-project file reuse without copying. Character, World and
other semantic reuse remains owned by the corresponding Asset/domain model.

## What Changes

- Restore the user-global Media Library catalog as the only source from which a project Media Library can
  be authorized. A newly selected directory is first registered globally and then associated with the
  current project atomically.
- Restore target-free project-local `.neko/media-libraries` binding records, immutable recovery plans,
  availability states and exact global connection identity. These records are disposable local
  authorization, not synchronized project facts.
- Keep `neko/assets/<libraryName>` as a mandatory managed symlink/junction, but define it as a rebuildable
  Workspace access projection derived from an exact project binding, not as the business authority.
- Restore `MediaLibraryContentLocator` for Canvas, Cut, Entity, Search, Resource Browser and portable
  project facts. Project facts remain independent of machine paths and Workspace mount layout.
- Project linked-media reads use one physical path: validate media locator and binding, validate the exact
  global connection, validate/rebuild the matching managed link, and read through the managed Workspace
  path guard. There is no direct-target read fallback.
- Project-to-Agent producers translate the authorized media identity to
  `workspace-file:neko/assets/<libraryName>/<relativePath>`. Agent remains restricted to its sender-bound
  Workspace and never receives binding, connection or target data.
- Restore distinct user actions: “associate global Media Library” and “add directory to global Media
  Library”. Both end with the same project binding plus managed-link projection.
- Make Resource Browser projections hierarchy-closed and reject malformed input at the package boundary so
  one bad resource does not crash the containing Desktop panel.
- Preserve sync/package separation: project facts synchronize, `.neko` and managed links do not, and an
  explicit portable snapshot copies only referenced bytes.

## Capabilities

### New Capabilities

- `workspace-linked-media-library`: Defines the managed Workspace access projection, its derivation from
  project/global authorization, Agent projection and link-safe synchronization behavior.

### Modified Capabilities

- `media-library-resource-entry`: Restores global registration, project binding, Media Library content
  identity, recovery and hierarchy-safe browsing.
- `desktop-assets-canvas-integration`: Keeps Desktop as sender/native-selection adapter and requires Agent
  handoff to use the managed Workspace projection.

## Impact

- `@neko/assets-domain` owns Media Library association/recovery policy and managed-link projection plans.
- `@neko/assets-node` owns global connection resolution, target-free local binding persistence, link
  inspection/materialization and the single authorized read chain.
- `@neko/content` restores the owner-qualified Media Library locator and exact handler composition.
- Agent receives only a Workspace locator produced after exact project authorization; other domains retain
  their canonical Media Library identity.
- `apps/neko-desktop` remains a thin Electron adapter for sender identity and native directory selection.
- Existing `.neko` bindings and `media-library` project facts are restored as current data, not legacy data.
  Workspace links created by the rejected refactor are retained and adopted only when they match one exact
  registered global connection; ambiguous or conflicting state remains visible for explicit repair.
