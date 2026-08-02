# @neko/assets-domain

Neko Assets owns the Desktop Media Library surface and composes the Creative Entity browser. It does not maintain an Asset catalog or a second semantic identity model.

## Responsibilities

- Derive Media Library roots from direct filesystem links under `neko/assets/<libraryName>`.
- Project required-but-unlinked libraries from authoritative project `ContentLocator` references.
- Browse, search, preview, and diagnose files by canonical workspace-relative `ContentLocator` values.
- Add, relink, and remove library links. Link removal never mutates target contents.
- Copy to or delete from a selected writable library through authorized Content I/O operations.
- Build rebuildable technical metadata, recent-use, and search projections.
- Compose Creative Entity UI and Agent capabilities through `@neko/entity-domain`.
- Generate thumbnail bytes for the shared representation/cache boundary without exposing cache paths.

## Boundaries

- The OS link is the only mapping from a Media Library name to its target. No settings variable, source registry, or `library.json` duplicates that mapping.
- Files use `neko/assets/<libraryName>/...` locators directly. Discovery does not create entities or bindings.
- Creative Entity owns character, scene, object, location, and style identity plus representation bindings.
- Generated outputs, document entries, and package resources retain their owner-specific identities and lifecycle.
- Cache paths, absolute link targets, Webview URIs, and runtime tokens are implementation details that never become durable content identity.

## Runtime

Desktop Main composes the package's host-neutral services through public entries.
`WorkspaceLinkedMediaLibraryService` manages links, `MediaLibrarySearchService` owns search/recent
projections, and `SemanticSourceDiscoveryService` emits reviewable semantic evidence without writing
Entity facts. The package-owned renderer root projects those services through typed Desktop IPC.

The project Resource Browser is independent from the global Library Browser. It keeps its own
selection, facet, query, and list/grid state, and projects safe required, unavailable, incomplete,
conflict, and unreferenced statuses without receiving a physical target. Recovery is an explicit
revisioned plan followed by confirmation and apply; generic repair routes fail closed. Add and
relink create OS links through the machine-global alias topology and never copy a whole library.

Portable snapshot execution is owned by the Desktop project lifecycle surface, not this browser.
That operation creates a new independent project, collects only authoritative referenced bytes, and
leaves the source workspace and external Media Library unchanged.

## Global Library Browser

The browser-safe `global-library` entry owns the shared list/grid presentation for global Media
Library connections and OpenNeko-owned Asset Library files. It accepts only opaque owner/item
identities, catalog revisions, relative Media Library locators, and revisioned `icon`/`hover`
thumbnail descriptors. Basenames beginning with `.` never enter either projection.

Desktop Main remains the authority for native selection, absolute-path resolution, thumbnail
generation, operation-owned Asset import staging, and system-trash removal. Removing a Media
Library connection unlinks only the managed connection; removing an Asset validates the current
owned regular file and moves it to the operating-system trash. Hover previews are static images and
do not open or autoplay a media session.

Retired Entity Asset graph data is handled only by explicit inspection and migration in
`@neko/entity-node`; the normal Assets runtime does not read a legacy Asset catalog.
