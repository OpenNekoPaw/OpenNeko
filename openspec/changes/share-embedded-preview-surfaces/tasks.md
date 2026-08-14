## 1. Canonical contracts and package boundaries

- [x] 1.1 Add exact Preview owner identity cases for Canvas and any migrated consumer missing an existing owner, update the single `AuthorizedPreviewSessionIdentity` codec atomically, and reject active/recent identity inference.
- [x] 1.2 Add Preview Domain producer/consumer fixtures covering valid Asset, Agent and Canvas descriptors plus malformed/expired single-resource fail-local behavior.
- [x] 1.3 Export canonical `LightweightPreview` through the existing `@neko/preview-webview/root` public entry and define dependency edges for Agent, Canvas and Assets; add package-boundary assertions that Cut does not import it and `apps/neko-desktop` does not own Viewer logic.
- [x] 1.4 Add architecture poison tests proving raw path, arbitrary URL, hidden `PreviewRoot`, wildcard renderer and duplicate lightweight renderer registrations cannot become successful inputs.

## 2. Shared Preview Viewer kernel and Surfaces

- [x] 2.1 Refactor `@neko/preview-webview` so Main Preview and `LightweightPreview` use one strict internal image/video/audio/text/document/model Viewer registry without exposing raw internal players.
- [x] 2.2 Implement compact `LightweightPreview` with descriptor-only input, bounded image/video/audio presentation, metadata-only preload, autoplay disabled by default and component-local loading/error state.
- [x] 2.3 Support full controls through parameters on the same `LightweightPreview`, including image zoom/pan and audio/video controls without creating a Main Preview View/session.
- [x] 2.4 Implement explicit lightweight ephemeral snapshot ownership while retaining Main Preview's package-owned persistent viewer snapshot path; fail visibly when a required owner is missing.
- [x] 2.5 Bind locale per mounted preview and remove rendering dependence on module-global mutable locale selection.
- [x] 2.6 Scope shared Viewer styling to Preview-owned classes/tokens, keep caller chrome outside the Surface, and lazy-load only the active content-kind module.
- [x] 2.7 Add Preview Webview tests for native `<img>/<video>/<audio>`, default paused behavior, descriptor switching, per-descriptor Overlay state, unmount cleanup, style isolation, locale isolation and unsupported-kind diagnostics.

## 3. Desktop authorization and resource lifetime

- [x] 3.1 Extend the Desktop Preview authorization adapter to project exact Canvas/Agent/Asset ContentLocator owners into short-lived descriptors while retaining sender, Window and Workspace trust checks only in the application boundary.
- [x] 3.2 Wire package public lightweight preview inputs through typed Desktop ports without exposing absolute paths, resource registry internals or Viewer decisions to Renderer packages.
- [x] 3.3 Add Main/preload/renderer contract tests proving exact sender/owner authorization, descriptor projection, release on Surface disposal and sibling-resource availability after one authorization failure.
- [x] 3.4 Add path-level tests that poison raw path, alternate protocol, arbitrary localhost, active Canvas and recent Workspace fallback routes.

## 4. Assets and Agent consumers

- [x] 4.1 Switch Resource Browser preview to the canonical `LightweightPreview` while preserving item selection, virtualization and Resource Browser chrome ownership.
- [x] 4.2 Update Agent transcript and Generation Job media presentation to preserve ContentLocator and project authorized Preview descriptors for image, video and audio bodies.
- [x] 4.3 Replace only the Agent card/result media body with `LightweightPreview` while retaining Tool/Job status, collapse, filename, error summary and multi-output collection ownership in Agent.
- [x] 4.4 Delete replaced Agent/Assets raw media success renderers, direct native element imports and alternate render-URL fallbacks; add poison tests proving only the shared Preview Viewer is reached.
- [x] 4.5 Add Agent/Assets Webview tests for compact layout, multiple outputs, expired descriptor diagnostics, card/slot unmount cleanup and unaffected sibling cards/items.

## 5. Canvas lightweight and fullscreen preview composition

- [x] 5.1 Update Canvas fullscreen preview resolution to request an authorized descriptor using exact Workspace/document/node/output identity and mount `LightweightPreview` inside the current Canvas scene.
- [x] 5.2 Preserve Canvas ownership of result grouping, active item navigation, Overlay backdrop, keyboard handling, context actions and durable current-output commands while passing only one active descriptor to Preview.
- [x] 5.3 Support Canvas fullscreen image zoom/pan and audio/video playback through the shared Viewer, stopping and releasing the previous descriptor before result switching or Overlay close.
- [x] 5.4 Remove the replaced image-only fullscreen renderer and Canvas-to-Main-Preview navigation/effect path without changing `.nkc` facts or retaining a feature-flagged dual path.
- [x] 5.5 Move Canvas ordinary node playback onto `LightweightPreview` while retaining Canvas playback-intent ownership; add boundary tests that poison Canvas-local native players.
- [x] 5.6 Add Canvas domain/Webview/Desktop tests for single and multiple outputs, duplicate node identity, failed authorization, Overlay close/reopen, unchanged selection/viewport and no hidden Main Preview session.

## 6. Text and Cut responsibility boundaries

- [x] 6.1 Keep Canvas Markdown node editing on `@neko/markdown/rich-surface` and read mode on `@neko/ui/markdown`; add tests proving it does not create a Text Editor document session or use Agent Streamdown for authoring.
- [x] 6.2 Keep Text Editor as the only complete Workspace text authoring owner and Main Preview as read-only plain-text/typed-Markdown viewer; ensure compact Lightweight Preview does not fetch full text for a card summary.
- [x] 6.3 Add Main Preview tests for plain text versus explicitly typed Markdown rendering and absence of edit commands/hidden Text Editor sessions.
- [x] 6.4 Add Cut architecture/runtime poison tests proving its dual video slots, Canvas composite, PCM clock and seek lifecycle do not mount or delegate to Lightweight or Main Preview.

## 7. Canonical-path and regression verification

- [x] 7.1 Run focused package verification: `pnpm --filter @neko/preview-domain test && pnpm --filter @neko/preview-webview test && pnpm --filter @neko/assets-webview test && pnpm --filter @neko/agent-webview test && pnpm --filter @neko/canvas-webview test && pnpm --filter @neko/cut-webview test`.
- [ ] 7.2 Run focused build/type verification: `pnpm --filter @neko/preview-domain typecheck && pnpm --filter @neko/preview-webview build && pnpm --filter @neko/assets-webview build && pnpm --filter @neko/agent-webview build && pnpm --filter @neko/canvas-webview build && pnpm --filter @neko/cut-webview build && pnpm typecheck:desktop`.
- [ ] 7.3 Run Desktop and architecture verification: `pnpm test:functional:headless && pnpm check:package-boundaries && pnpm check:application-boundaries && pnpm check:webview-boundaries && pnpm check:canvas-playback-boundary && pnpm check:no-internal-versioning && pnpm check:openspec`.
- [ ] 7.4 Run the authoritative visible Electron media qualification with `pnpm test:local:media-openneko` and targeted `pnpm test:local:ui` inventory for Agent cards, Resource Browser quick preview, Canvas immersive image/video/audio, Main Preview text/document and Cut playback.
- [ ] 7.5 Use the Neko UI validation workflow to capture direct image-capable review of compact/immersive/main layouts, concurrent Agent+Canvas style isolation, multi-output switching, zoom/playback, keyboard close and fail-visible states.
- [x] 7.6 Use the Neko quality review workflow to audit owner/dependency/interface/extension/test boundaries, confirm deleted/poisoned parallel paths, record all executed commands and list residual risks including deferred Canvas inline player convergence and large-document performance.

## 8. Canvas preview routing and interaction isolation

- [x] 8.1 Add separate Canvas-owned fullscreen preview and Preview-owned Main Preview toolbar actions with distinct identities, labels and icons; keep EPUB/PDF/DOCX/CBZ Main Preview-only.
- [x] 8.2 Add Canvas fullscreen text/Markdown/JSON file viewing through `LightweightPreview` without creating a Text Editor or Main Preview session.
- [x] 8.3 Separate thumbnail variants from exact viewer-source registration so video/audio/text viewers receive authorized content instead of thumbnails.
- [x] 8.4 Suspend Canvas viewport gestures and editor shortcuts while the fullscreen Overlay owns focus, preserving viewport state and restoring focus on close.
- [x] 8.5 Add Canvas Webview/Desktop tests for dual action routing, fullscreen text preview, document-only Main Preview, exact media projection and input isolation.

## 9. Fullscreen text reader presentation

- [x] 9.1 Add a Preview-owned solid reading page for fullscreen plain text, JSON and Markdown with bounded measure, independent scrolling, selectable content and high-contrast local loading/error states.
- [x] 9.2 Remove the empty Canvas gallery footer for single-resource previews and keep caller chrome outside the shared Viewer.
- [x] 9.3 Add scoped-style and rendering tests proving the fullscreen text reader does not inherit the translucent Canvas Overlay presentation.
- [x] 9.4 Isolate Preview descriptors and resource leases per request so stale React effect cleanup cannot invalidate a remounted text viewer.

## 10. Collapse preview UI and media capability paths

- [x] 10.1 Replace the three-presentation design with one `LightweightPreview` public entry and a Main Preview shell that composes the same Viewer kernel; remove `QuickPreviewSurface`, `EmbeddedPreviewSurface` and `main | quick | embedded` Viewer dispatch.
- [x] 10.2 Make lightweight and Main image/video/audio rendering use the same image element and `AudioPlayer`/`VideoPlayer`; allow UI-density and snapshot parameters to change controls only, never the resource, codec or element implementation.
- [x] 10.3 Migrate Agent and Assets media bodies to `LightweightPreview`, retaining caller-owned cards, collections, virtualization and actions; poison duplicate single-resource media renderers.
- [x] 10.4 Migrate Canvas ordinary image/audio/video nodes and fullscreen Overlay to `LightweightPreview`; remove Canvas `InlineVideoPlayer`, `InlineAudioPlayer` and independent media success paths while retaining Canvas node/selection/playback-intent ownership.
- [x] 10.5 Route Canvas, Agent, Assets and Main Preview descriptors through the same exact-resource registration and Range path, remove caller-local format acceptance decisions, and add WebM/audio/image path-level tests.
- [x] 10.6 Add shared Preview Webview tests for identical lightweight/Main media element implementation, contain/centering/no-extra-margin rules, loading/error/unmount behavior and controlled playback parameters.
- [x] 10.7 Run focused package tests/builds, Desktop media qualification, UI validation and quality review; record any blocked visual evidence and residual format risk.
- [x] 10.8 Keep lightweight video on native controls, restore the Preview-owned compact waveform transport for lightweight audio, and classify non-source `play()` rejection separately from media element source failure.
- [x] 10.9 Keep shared media setup keyed to descriptor resources so Canvas projection rerenders cannot pause/restart playback; add Resource Browser ambient video parameters, remove Asset Center's duplicate hover renderer, and release Canvas descriptor leases by recorded owner after Workbench detachment.
- [x] 10.10 Extend the same explicit ambient media parameter to Resource Browser audio so hover starts the shared native audio element without waveform/thumbnail controls and leave pauses/releases the exact resource; classify shared media command events separately from manual interaction so Canvas hover cannot steal manual ownership or restart after pointer leave.
- [x] 10.11 Remove Canvas ordinary-node hover playback ownership, keep playback manual across pointer/selection/drag interactions, and make controlled storyline mounts hide internal media controls; update focused and Desktop functional coverage without changing Resource Browser ambient playback.
