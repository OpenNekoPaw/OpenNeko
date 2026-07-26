## 1. Contract and regression coverage

- [x] 1.1 Replace layout/store assertions with Storyline-only session and rendering expectations
- [x] 1.2 Add Storyline component coverage for structural node order, route selection, diagnostics and authoritative-duration handling
- [x] 1.3 Preserve source-node selection, Overlay-safe reveal and single playback-controller path assertions

## 2. Storyline canonical path

- [x] 2.1 Refactor the compact route strip into the only horizontal Storyline node surface
- [x] 2.2 Keep multiple-route selection, current node state, diagnostics and keyboard activation inside Storyline
- [x] 2.3 Remove duration-proportional node sizing and the Storyline time ruler while retaining controller Seek

## 3. Matrix removal

- [x] 3.1 Delete Matrix component and projection modules and remove their production imports
- [x] 3.2 Delete Matrix/view-mode store state, actions and reconciliation
- [x] 3.3 Remove Matrix-only CSS, internationalization keys, tests and residual identifiers without compatibility fallback

## 4. Verification

- [x] 4.1 Validate OpenSpec artifacts and run focused Canvas Webview tests
- [x] 4.2 Run affected typecheck/build plus legacy-debt, unused and diff checks
- [x] 4.3 Validate the unified Preview/controls/Storyline panel and node-to-Canvas reveal path in an isolated Extension Development Host and record evidence
- [x] 4.4 Complete Neko quality review and document verification results and residual risk

## 5. Unified playback panel

- [x] 5.1 Replace layout and Toolbar tests with one Preview panel ordered as Preview, controls, then Storyline
- [x] 5.2 Move Storyline into the right-side Preview stage while preserving one controller model and source-node activation
- [x] 5.3 Delete the route Overlay, independent Storyline Toolbar action, route pane state, route height and Overlay-safe reveal compensation
- [x] 5.4 Remove Overlay-only CSS and localization without retaining a second presentation path

## 6. Unified-panel verification

- [x] 6.1 Re-run focused/full Canvas tests, production build, OpenSpec, formatting, dependency and repository quality gates
- [x] 6.2 Update quality review and verification evidence with the unified-panel result and remaining runtime risk

## 7. Preview Overlay design correction

- [x] 7.1 Replace unified right-panel tests with persistent Storyline plus on-demand Preview Overlay expectations
- [x] 7.2 Add Preview close, Escape and Webview-full-bleed presentation coverage while preserving one controller
- [x] 7.3 Remove Preview stage width/resize state and migrate Toolbar/session ownership without compatibility fallback
- [x] 7.4 Move Preview details and controls into the Overlay while keeping Storyline and Canvas visible

## 8. Minimal branch graph

- [x] 8.1 Add deterministic graph-layout coverage for shared prefixes, branches, merges and distinct same-label nodes
- [x] 8.2 Render all valid routes as horizontal lane connectors with selected-route emphasis
- [x] 8.3 Reduce visible node content to compact index and short label while retaining diagnostics and media state accessibly

## 9. Corrected-design verification

- [x] 9.1 Run focused and full Canvas tests, compile/build, formatting, OpenSpec and diff checks
- [x] 9.2 Run applicable legacy-debt, unused and repository quality gates
- [x] 9.3 Update verification evidence; do not launch or manipulate a non-isolated user VS Code instance

## 10. Unified collapsible Overlay

- [x] 10.1 Add regression coverage for one Overlay containing Storyline, controls and playback-state-driven Preview expansion
- [x] 10.2 Remove persistent Storyline and independent Preview visibility state without compatibility fallback
- [x] 10.3 Reorder the Overlay as Storyline, controls/progress, conditional Preview and footer actions
- [x] 10.4 Update compact/expanded/full-bleed styling and remove split-surface selectors and copy
- [x] 10.5 Run affected tests, builds, quality checks, OpenSpec validation and residual scans
- [x] 10.6 Update verification evidence without launching or manipulating the user's VS Code instance

## 11. Top-docked Storyline Overlay

- [x] 11.1 Add regression coverage for a top-docked non-modal collapsed state, centered modal playing state and return-on-pause behavior
- [x] 11.2 Make the collapsed Overlay backdrop-transparent and pointer-transparent outside its compact top strip
- [x] 11.3 Add a shared Storyline branch icon and replace the Canvas Toolbar play icon
- [x] 11.4 Update compact/expanded styling and accessibility semantics without creating another playback surface
- [x] 11.5 Run affected tests, builds, quality checks, OpenSpec validation and residual scans
- [x] 11.6 Update verification evidence without launching or manipulating the user's VS Code instance

## 12. Single Storyline playback component

- [x] 12.1 Add regression coverage for one Storyline playback component, playback-driven Preview expansion and centered time-free controls
- [x] 12.2 Move Storyline, controls, conditional Preview and footer ownership into one `StorylinePlaybackOverlay` component
- [x] 12.3 Remove separate Storyline/Preview surface composition and nested panel styling without changing the single playback session
- [x] 12.4 Center transport controls, remove visible time labels and remove time-formatted Seek tooltip while retaining relative Seek progress
- [x] 12.5 Run affected tests, builds, quality checks, OpenSpec validation and residual scans
- [x] 12.6 Update verification evidence without launching or manipulating the user's VS Code instance

## 13. In-place playback expansion correction

- [x] 13.1 Add regression coverage for stable top anchor, width, non-modal semantics and Storyline geometry across Preview expansion
- [x] 13.2 Replace playback-state backdrop/centering with one pointer-transparent top layer whose shell expands downward in place
- [x] 13.3 Keep the Overlay above Canvas context toolbars without blocking Canvas outside the shell
- [x] 13.4 Split playback synchronization from one-shot user navigation; remove Canvas selection and persistent playback highlight writes
- [x] 13.5 Run affected tests, build, OpenSpec validation and residual scans; update verification evidence

## 14. Overlay-lifetime Preview visibility

- [x] 14.1 Add regression coverage for default collapsed state, playback-triggered reveal and persistence across pause
- [x] 14.2 Move the Preview visibility latch into `StorylinePlaybackOverlay` and remove playback-state-derived collapsing
- [x] 14.3 Make full-bleed reveal Preview and preserve it after restoring the top-docked Overlay
- [x] 14.4 Verify close/reopen resets Preview to collapsed without adding session/store state
- [x] 14.5 Run affected tests, builds, quality checks, OpenSpec validation and isolated Extension Host verification; update evidence

## 15. Flat Storyline audio Preview

- [x] 15.1 Add regression coverage proving Storyline Preview audio omits the Canvas node waveform by default
- [x] 15.2 Delete the ambiguous `showWaveform` boolean while retaining one `InlineAudioPlayer` lifecycle
- [x] 15.3 Replace the stacked Storyline audio controls with one bounded responsive transport row directly on the existing owning surface
- [x] 15.4 Run focused tests/build, quality checks and isolated Extension Host validation; update evidence

## 16. Canvas audio node card

- [x] 16.1 Add regression coverage for the Canvas-only title, waveform/Seek and three-column transport layout
- [x] 16.2 Introduce an explicit node-card audio layout while preserving the Storyline Preview transport
- [x] 16.3 Keep both layouts on one stream/clock lifecycle and remove nested card/pill styling
- [x] 16.4 Run focused tests/build, quality checks and isolated Extension Host validation; update evidence

## 17. Storyline navigation and playback simplification

- [x] 17.1 Add regression coverage for no redundant title row, conditional route selector and one controlled Preview launch
- [x] 17.2 Delete the persistent route Tab row and render one compact selector only when multiple routes exist
- [x] 17.3 Keep node transport separate from route selection and suppress the controlled Preview idle play button
- [x] 17.4 Run focused/full Canvas tests, build, quality checks, OpenSpec validation and isolated Extension Host verification; update evidence
