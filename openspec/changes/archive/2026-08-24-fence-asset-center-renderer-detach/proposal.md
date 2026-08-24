# Change: Fence Asset Center Renderer Detach

## Why

Asset Center uses a stable Scene-owned `assetCenterSessionId` so presentation can be reconstructed after Renderer replacement. During a Vite page reload, the outgoing Renderer may send its delayed `session.detach` after the replacement Renderer has already attached the same Scene identity. The unfenced detach can then release the replacement session, and a later cleanup produces the visible `Asset Center session ... is unavailable` IPC error.

Treating a missing session as unconditional success would hide real duplicate-detach defects and would not prevent a stale Renderer from releasing the current session. The Host request must carry the existing Window `rendererSessionId`, and the Desktop trust boundary must distinguish expected stale cleanup from a current-owner lifecycle violation.

## What Changes

- Add the current Window `rendererSessionId` to the canonical Asset Center Host request contract.
- Fence every Asset Center request against the current Shell Renderer identity before it reaches the Assets Node runtime.
- Return an explicit stale result for an outgoing Renderer detach without releasing the current session.
- Preserve fail-visible behavior for stale non-cleanup requests and for duplicate detach from the current Renderer.
- Update Asset contract, Desktop producer/consumer and lifecycle tests atomically; retain no unfenced request shape.

## Impact

- `@neko/assets-domain` owns the canonical typed Host request/result contract.
- `@neko/assets-node` remains the Asset Center session, presentation snapshot and resource-release owner; its session identity and data model do not change.
- `apps/neko-desktop` remains the Electron trust-boundary adapter: Renderer supplies the Shell-projected identity and Main compares it with the authoritative current Shell projection before delegation.
- No Asset, Media Library, Project or presentation data is migrated, rewritten or discarded. The change affects only transient Renderer attachment authority.
