## Why

Three production paths currently violate OpenNeko's canonical-owner and fail-visible constraints: Search can hide missing dependencies and failed partitions, Canvas media messages are owned by Desktop and can pass through an open-ended message delegate, and Desktop owns Cut draft and Canvas-to-Cut business decisions. These paths passed topology gates because the problem is semantic ownership rather than a direct forbidden import, so they must be replaced before more callers build on them.

## What Changes

- **BREAKING**: Require complete Project Search runtime ports, reject duplicate adapter/provider identities, and return or throw explicit partition diagnostics instead of marking failed initialization or refresh work as fresh.
- **BREAKING**: Move the Canvas media request/response contract and codec into the Canvas owning package, expose only exact supported message kinds from the Canvas Webview host, and remove Desktop's package-local protocol copy and wildcard delegation path.
- Move Cut draft planning, naming, document identity/path planning, and Canvas-to-Cut target decisions into a host-neutral Cut application service. Desktop retains exact Window/Workspace authorization, native resource adapters, shell projection updates, and disposal.
- Add path-level tests proving missing Search dependencies, duplicate registration, invalid Canvas messages, and failed Cut application transactions cannot return success through an old or fallback path.

## Capabilities

### New Capabilities

- `project-search-index-coordination`: Defines explicit runtime dependencies, unique partition/provider registration, and fail-visible partition lifecycle semantics for project search.
- `canvas-media-host-contract`: Defines the Canvas-owned typed media protocol and the single exact Webview-to-Host message path.
- `cut-draft-application-ownership`: Defines Cut-owned draft planning and Canvas handoff decisions with Desktop restricted to trust-boundary and shell adapters.

### Modified Capabilities

None.

## Impact

- `packages/search/domain`: application/runtime coordination contracts, registration semantics, diagnostics, and tests.
- `packages/canvas/domain`: package-owned L0 media contract and codec.
- `packages/canvas/webview`: exact supported-message routing without wildcard delegation.
- `apps/neko-desktop`: Canvas Main/preload/renderer bridge consumes the Canvas public contract and deletes its local copy.
- `packages/cut/domain`: host-neutral Cut application planning service and tests.
- `apps/neko-desktop`: Cut runtime becomes an Electron/shell adapter and no longer decides domain draft or handoff outcomes.
- Public TypeScript contracts change atomically across producers, consumers, fixtures, and tests; no compatibility alias or dual protocol remains.
