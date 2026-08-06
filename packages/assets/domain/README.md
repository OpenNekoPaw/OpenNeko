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

The project Resource Browser is independent from the global Library Browser. It exposes the four
owner-preserving `files`, `media`, `assets`, and `entities` facets and keeps per-facet selection,
navigation, query, and list/grid state. Asset results retain exact Asset identity; Entity and candidate
results retain their Entity owner identity. The package-owned `entity.manage` route validates selection,
capability, identity, and expected project revision before delegating to the exact Entity owner. It does
not infer Entity operations or write project files in the Renderer or Desktop application root.

The browser projects safe required, unavailable, incomplete, conflict, and unreferenced statuses without
receiving a physical target. Recovery is an explicit revisioned plan followed by confirmation and apply;
generic repair routes fail closed. Add and relink create OS links through the machine-global alias
topology and never copy a whole library.

Entity Asset intents remain capability-gated until the manifest-backed Asset package runtime,
publication lifecycle, and remote provider are production-wired. The flat global Asset file surface is
not a fallback package provider.

Portable snapshot execution is owned by the Desktop project lifecycle surface, not this browser.
That operation creates a new independent project, collects only authoritative referenced bytes, and
leaves the source workspace and external Media Library unchanged.

## Global Library Browser

The browser-safe `global-library` entry owns the shared list/grid presentation for global Media
Library connections and OpenNeko-owned Asset Library files. It accepts only opaque owner/item
identities, catalog revisions, relative Media Library locators, and revisioned `icon`/`hover`
thumbnail descriptors. Basenames beginning with `.` never enter either projection.

Desktop Main remains the authority for native selection and Electron wiring. Assets Node owns
absolute-path resolution, thumbnail input authorization, operation-owned import staging, and the
persistent Asset Library membership lifecycle. Removing a Media Library connection unlinks only the
managed connection; the ordinary Asset remove action marks only its membership record as removed and
preserves the source file. Uninstall and unreferenced-byte garbage collection are separate explicit
operations. Hover previews are static images and do not open or autoplay a media session.
