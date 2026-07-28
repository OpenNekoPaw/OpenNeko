## 1. Contracts and Regression Coverage

- [x] 1.1 Add Store tests for compact default mode and mode preservation
- [x] 1.2 Add PlaybackWorkspace tests for top Overlay geometry, Storyline/Matrix switching and source-node reveal
- [x] 1.3 Add playback tests proving one controller model and Preview auto-reveal

## 2. Playback Ownership

- [x] 2.1 Extract the Canvas playback controller state/actions into one reusable model while preserving the existing component API
- [x] 2.2 Render the shared controller in the route Overlay or Preview without creating parallel timer/request owners
- [x] 2.3 Preserve pause, Seek, step, media completion and stale behavior

## 3. Top Storyline Overlay

- [x] 3.1 Connect `routeViewMode` to production rendering and make Storyline the default
- [x] 3.2 Move the route surface from the bottom layout pane to a top downward-expanding Overlay
- [x] 3.3 Add Storyline/Route Comparison mode controls using shared UI primitives
- [x] 3.4 Account for Overlay height when revealing source Canvas nodes

## 4. Presentation and Internationalization

- [x] 4.1 Restore responsive Matrix styling with existing theme tokens
- [x] 4.2 Refine Storyline story-point, playhead, header and narrow-width styling
- [x] 4.3 Add matching English and Chinese labels, tooltips and accessible names

## 5. Verification

- [x] 5.1 Run focused Canvas Webview tests and build
- [x] 5.2 Run OpenSpec, architecture and diff quality checks
- [x] 5.3 Validate the top Overlay, mode switching, source-node reveal and
      Preview playback; future reruns use only the `~/Git/neko-test`
      Extension Development Host with a scenario-owned functional subtree
- [x] 5.4 Record executed commands, runtime evidence and remaining risks

## 6. Preview Isolation and Locale Follow-up

- [x] 6.1 Add regressions for Canvas-owned Overlay containment and complete Simplified Chinese chrome
- [x] 6.2 Move the Overlay ownership boundary into the Canvas pane without changing Preview media behavior
- [x] 6.3 Validate simultaneous Overlay and Preview rendering in a Simplified Chinese Extension Host at wide and narrow widths
