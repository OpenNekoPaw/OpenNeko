# Neko Assets

Neko Assets owns the Desktop Media Library surface and composes the Creative Entity browser. It does not maintain an Asset catalog or a second semantic identity model.

## Responsibilities

- Derive Media Library roots from direct filesystem links under `neko/assets/<libraryName>`.
- Browse, search, preview, and diagnose files by canonical workspace-relative `ContentLocator` values.
- Add, relink, and remove library links. Link removal never mutates target contents.
- Copy to or delete from a selected writable library through authorized Content I/O operations.
- Build rebuildable technical metadata, recent-use, and search projections.
- Compose Creative Entity UI and Agent capabilities through `@neko/entity`.
- Generate thumbnail bytes for the shared representation/cache boundary without exposing cache paths.

## Boundaries

- The OS link is the only mapping from a Media Library name to its target. No settings variable, source registry, or `library.json` duplicates that mapping.
- Files use `neko/assets/<libraryName>/...` locators directly. Discovery does not create entities or bindings.
- Creative Entity owns character, scene, object, location, and style identity plus representation bindings.
- Generated outputs, document entries, and package resources retain their owner-specific identities and lifecycle.
- Cache paths, absolute link targets, Webview URIs, and Engine tokens are runtime-only implementation details.

## Runtime

Desktop Main composes the package's host-neutral services through public entries.
`WorkspaceLinkedMediaLibraryService` manages links, `MediaLibrarySearchService` owns search/recent
projections, and `SemanticSourceDiscoveryService` emits reviewable semantic evidence without writing
Entity facts. The package-owned renderer root projects those services through typed Desktop IPC.

Legacy Asset catalog data is handled only by the explicit inspection and migration facilities in `@neko/shared`; normal Neko Assets runtime does not read it.
