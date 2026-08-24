# Design: Fence Asset Center Renderer Detach

## Five-layer analysis

### Responsibility

- Assets Domain owns the single Host request/result shape.
- Desktop Shell owns the current `rendererSessionId` for a Window.
- Desktop Main validates that identity at the Electron trust boundary.
- Assets Node owns the exact Asset Center session and continues to fail visibly when the current Renderer requests an invalid operation.

### Dependency

Renderer depends only on the package-owned Asset Center bridge and the Shell projection it already consumes. Main depends on the public Assets contract and Host Shell port. Assets Domain and Assets Node do not import Electron or Desktop implementation code.

### Interface

Every `AssetCenterHostRequest` carries `rendererSessionId` alongside the stable Asset Center identity. `session.detach` has one explicit result union:

- `status: detached` with the final projection when the current Renderer released the session;
- `status: stale` with no projection when an outgoing Renderer attempted cleanup after replacement.

All other successful management routes continue to return a projection. The old unfenced request shape and the assumption that every detach returns a projection are removed in the same change.

### Extension

The design reuses the Window renderer identity already used by Desktop Canvas, Preview, Cut and Text Editor boundaries. It introduces no attachment registry, internal version, feature flag, fallback path or second session owner.

### Testing

- Contract tests reject Asset Center requests without `rendererSessionId` and accept both detach outcomes.
- Renderer tests prove every request carries the exact Shell-projected Renderer identity.
- Main tests prove stale detach does not call Assets Node detach, while a stale ordinary request fails visibly.
- Node lifecycle tests continue to prove that a current-owner duplicate detach is unavailable and that valid detach releases Preview resources exactly once.

## Runtime sequence

1. Renderer constructs `DesktopAssetCenterRuntime` from the current Scene identity and Shell `rendererSessionId`.
2. Every bridge request includes both identities.
3. Main resolves the sender Window and reads the authoritative Shell projection.
4. If the Renderer identity matches, Main delegates through the existing Assets Node runtime.
5. If it does not match and the route is `session.detach`, Main returns `status: stale` without touching the Assets Node runtime or Shell preview projection.
6. If it does not match for any other route, Main throws a stale-Renderer diagnostic.

This ordering handles both reload races: an old detach arriving before replacement registration performs a normal release and the new Renderer reconstructs from the Assets-owned snapshot; an old detach arriving afterward is fenced and cannot release the replacement session.

## Canonical path and replaced behavior

| Responsibility                | Owner                       | Producer                       | Consumer                   | Runtime boundary     | Replaced path                              |
| ----------------------------- | --------------------------- | ------------------------------ | -------------------------- | -------------------- | ------------------------------------------ |
| Asset Center request identity | `@neko/assets-domain`       | Desktop Renderer adapter       | preload/Main               | Renderer → typed IPC | unfenced request without Renderer identity |
| stale cleanup decision        | Desktop Main trust boundary | authoritative Shell projection | Assets Node delegation     | Electron Main        | stale detach reaching `requireSession()`   |
| Asset session release         | `@neko/assets-node`         | current Renderer detach        | Asset controller/resources | Node runtime         | release authorized only by stable Scene ID |

Desktop-specific logic stays in `apps/neko-desktop` because it compares Electron sender-bound Window authority with the current Renderer registration. No host-neutral Asset business rule moves into the application root.

## Failure and data behavior

- Stale cleanup is an explicit non-mutating lifecycle outcome, not a silent catch or fallback success.
- Stale reads and mutations remain rejected before reaching Asset authority.
- Current-owner duplicate detach remains an error, exposing lifecycle defects.
- Presentation snapshots keep their existing owner and reconstruction semantics; user data is unchanged.
