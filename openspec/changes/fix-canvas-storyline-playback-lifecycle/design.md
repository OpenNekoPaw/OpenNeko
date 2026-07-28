## Context

`PlaybackWorkspace` owns two independent state dimensions:

1. whether the Host-enriched Storyline plan is current (`stale`);
2. whether the current Preview transport is `idle`, `playing`, or `paused`.

The current `markPlaybackWorkspaceStale(false)` implementation conflates them by always setting transport state to `idle`. The Host request is asynchronous, so plan completion can race with a user pressing Play. The resulting state reset prevents the controlled `PreviewSurface` from continuing to the media request path. Fullscreen reuses the same Storyline Preview, so it inherits the same failure.

### Five-layer analysis

1. **Responsibility**: `PlaybackWorkspace` owns Host-plan requests; `playbackStore` owns session transitions; `PreviewSurface` owns media rendering and must not infer plan freshness.
2. **Dependencies**: the fix remains Webview-local and does not change the Extension/media protocol.
3. **Interface**: `markPlaybackWorkspaceStale(true)` invalidates transport; `markPlaybackWorkspaceStale(false)` clears freshness only and preserves a valid transport state.
4. **Extension**: later plan refreshes can reuse the same transition without coupling transport behavior to request timing.
5. **Testing**: assert the store transition directly and simulate a Host response arriving after Play in `PlaybackWorkspace`.

## Decisions

### 1. Make stale transitions directional

Setting stale to `true` transitions playback to `stale`. Clearing stale preserves `idle`, `playing`, or `paused`; only a session that is already `stale` recovers to `idle`.

This keeps timeout invalidation explicit while preventing successful metadata reconciliation from cancelling a valid user command.

### 2. Keep one Storyline Preview across presentation changes

Fullscreen remains presentation-only. It must not remount the Preview surface, replace the playback request identity, or reset the playhead. The existing single-surface rendering path is retained and covered by regression tests.

### 3. Do not add media fallbacks

Unsupported codecs and missing hardware decoders continue to return explicit diagnostics. This change does not transcode, proxy, or decode video on the CPU and does not restore `neko-engine`.

## Risks / Trade-offs

- A successful Host plan may replace unit metadata while playback is active. Existing route/unit reconciliation remains authoritative; this change only prevents unrelated transport reset.
- Recovering from an actual stale state returns to `idle`, requiring an explicit new Play action. This avoids pretending an invalidated request remained successful.

## Runtime Verification

Use only `/Users/feng/Git/neko-test` in a real VS Code Extension Development Host. Verify a supported H.264 media node through inline playback, Storyline playback, fullscreen toggle, playhead advancement, and product-error console inspection.
