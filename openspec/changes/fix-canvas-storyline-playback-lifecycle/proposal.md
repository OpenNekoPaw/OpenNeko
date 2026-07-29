## Why

Canvas Storyline resolves an initial playback plan locally and then replaces it with a Host-enriched plan asynchronously. A successful Host response currently clears the `stale` flag by unconditionally resetting the playback session to `idle`. If the user starts playback before that response arrives, the valid `playing` request is cancelled. Inline Canvas-node playback does not use this plan lifecycle, which explains why node playback works while Storyline and its fullscreen presentation can appear unable to play.

## What Changes

- Separate Host-plan freshness reconciliation from transport playback state.
- Preserve `playing`, `paused`, and `idle` when a successful Host plan clears a non-stale state.
- Keep timeout/topology invalidation fail-visible by transitioning the session to `stale`.
- Preserve one mounted Preview surface, request identity, and playhead while toggling Storyline fullscreen.
- Add regression coverage for the delayed Host-plan race and the store state transition contract.

## Capabilities

### New Capabilities

- `canvas-storyline-playback-lifecycle`: Storyline plan freshness, playback-state ownership, and fullscreen continuity.

### Modified Capabilities

None.

## Impact

- `packages/neko-canvas-webview`: playback session store semantics and focused Storyline tests.
- No Extension Host message, media adapter, codec, Engine, project schema, or CPU-transcode fallback changes.
