## 1. Canonical contracts and package boundaries

- [x] 1.1 Add exact embedded Preview owner identity cases for Canvas and any migrated consumer missing an existing owner, update the single `AuthorizedPreviewSessionIdentity` codec atomically, and reject active/recent identity inference.
- [x] 1.2 Add Preview Domain producer/consumer fixtures covering valid Asset, Agent and Canvas descriptors plus malformed/expired single-resource fail-local behavior.
- [x] 1.3 Define the canonical `@neko/preview-webview/embedded` public entry and dependency edges for Agent, Canvas and Assets; add package-boundary assertions that Cut does not import it and `apps/neko-desktop` does not own Viewer logic.
- [x] 1.4 Add architecture poison tests proving raw path, arbitrary URL, hidden `PreviewRoot`, wildcard renderer and duplicate embedded Surface registrations cannot become successful inputs.

## 2. Shared Preview Viewer kernel and Surfaces

- [x] 2.1 Refactor `@neko/preview-webview` so Main Preview, Quick Preview and Embedded Preview use one strict internal image/video/audio/text/document/model Viewer registry without exposing raw internal players.
- [x] 2.2 Implement `QuickPreviewSurface` with descriptor-only input, bounded image/video/audio presentation, metadata-only preload, autoplay disabled by default and component-local loading/error state.
- [x] 2.3 Implement `EmbeddedPreviewSurface` with descriptor-only input, immersive image zoom/pan and complete audio/video controls without creating a Main Preview View/session.
- [x] 2.4 Implement explicit Surface-local ephemeral snapshot ownership for Quick/Embedded lifetimes while retaining Main Preview's package-owned persistent viewer snapshot path; fail visibly when a required owner is missing.
- [x] 2.5 Bind locale per mounted Surface and remove embedded rendering dependence on module-global mutable locale selection.
- [x] 2.6 Scope shared Viewer styling to Preview-owned classes/tokens, keep caller chrome outside the Surface, and lazy-load only the active content-kind module.
- [x] 2.7 Add Preview Webview tests for native `<img>/<video>/<audio>`, default paused behavior, descriptor switching, per-descriptor Overlay state, unmount cleanup, style isolation, locale isolation and unsupported-kind diagnostics.

## 3. Desktop authorization and resource lifetime

- [x] 3.1 Extend the Desktop Preview authorization adapter to project exact Canvas/Agent/Asset ContentLocator owners into short-lived descriptors while retaining sender, Window and Workspace trust checks only in the application boundary.
- [x] 3.2 Wire package public embedded Surface inputs through typed Desktop ports without exposing absolute paths, resource registry internals or Viewer decisions to Renderer packages.
- [x] 3.3 Add Main/preload/renderer contract tests proving exact sender/owner authorization, descriptor projection, release on Surface disposal and sibling-resource availability after one authorization failure.
- [x] 3.4 Add path-level tests that poison raw path, alternate protocol, arbitrary localhost, active Canvas and recent Workspace fallback routes.

## 4. Assets and Agent consumers

- [x] 4.1 Switch Resource Browser quick preview to the canonical Quick Surface while preserving item selection, virtualization and Resource Browser chrome ownership.
- [x] 4.2 Update Agent transcript and Generation Job media presentation to preserve ContentLocator and project authorized Preview descriptors for image, video and audio bodies.
- [x] 4.3 Replace only the Agent card/result media body with Quick Surface while retaining Tool/Job status, collapse, filename, error summary and multi-output collection ownership in Agent.
- [x] 4.4 Delete replaced Agent/Assets raw media success renderers, direct native element imports and alternate render-URL fallbacks; add poison tests proving only the shared Preview Viewer is reached.
- [x] 4.5 Add Agent/Assets Webview tests for compact layout, multiple outputs, expired descriptor diagnostics, card/slot unmount cleanup and unaffected sibling cards/items.

## 5. Canvas embedded preview composition

- [x] 5.1 Update Canvas immersive preview resolution to request an authorized descriptor using exact Workspace/document/node/output identity and mount Embedded Preview inside the current Canvas scene.
- [x] 5.2 Preserve Canvas ownership of result grouping, active item navigation, Overlay backdrop, keyboard handling, context actions and durable current-output commands while passing only one active descriptor to Preview.
- [x] 5.3 Support Canvas embedded image zoom/pan and audio/video playback through the shared Viewer, stopping and releasing the previous descriptor before result switching or Overlay close.
- [x] 5.4 Remove the replaced image-only immersive renderer and Canvas-to-Main-Preview navigation/effect path without changing `.nkc` facts or retaining a feature-flagged dual path.
- [x] 5.5 Keep Canvas inline hover/Playback Workspace ownership unchanged, and add boundary tests distinguishing its ordinary native playback from the shared immersive Viewer path.
- [x] 5.6 Add Canvas domain/Webview/Desktop tests for single and multiple outputs, duplicate node identity, failed authorization, Overlay close/reopen, unchanged selection/viewport and no hidden Main Preview session.

## 6. Text and Cut responsibility boundaries

- [x] 6.1 Keep Canvas Markdown node editing on `@neko/markdown/rich-surface` and read mode on `@neko/ui/markdown`; add tests proving it does not create a Text Editor document session or use Agent Streamdown for authoring.
- [x] 6.2 Keep Text Editor as the only complete Workspace text authoring owner and Main Preview as read-only plain-text/typed-Markdown viewer; ensure Quick Surface does not fetch full text for a card summary.
- [x] 6.3 Add Main Preview tests for plain text versus explicitly typed Markdown rendering and absence of edit commands/hidden Text Editor sessions.
- [x] 6.4 Add Cut architecture/runtime poison tests proving its dual video slots, Canvas composite, PCM clock and seek lifecycle do not mount or delegate to Quick, Embedded or Main Preview Surface.

## 7. Canonical-path and regression verification

- [x] 7.1 Run focused package verification: `pnpm --filter @neko/preview-domain test && pnpm --filter @neko/preview-webview test && pnpm --filter @neko/assets-webview test && pnpm --filter @neko/agent-webview test && pnpm --filter @neko/canvas-webview test && pnpm --filter @neko/cut-webview test`.
- [ ] 7.2 Run focused build/type verification: `pnpm --filter @neko/preview-domain typecheck && pnpm --filter @neko/preview-webview build && pnpm --filter @neko/assets-webview build && pnpm --filter @neko/agent-webview build && pnpm --filter @neko/canvas-webview build && pnpm --filter @neko/cut-webview build && pnpm typecheck:desktop`.
- [ ] 7.3 Run Desktop and architecture verification: `pnpm test:functional:headless && pnpm check:package-boundaries && pnpm check:application-boundaries && pnpm check:webview-boundaries && pnpm check:canvas-playback-boundary && pnpm check:no-internal-versioning && pnpm check:openspec`.
- [ ] 7.4 Run the authoritative visible Electron media qualification with `pnpm test:local:media-openneko` and targeted `pnpm test:local:ui` inventory for Agent cards, Resource Browser quick preview, Canvas immersive image/video/audio, Main Preview text/document and Cut playback.
- [ ] 7.5 Use the Neko UI validation workflow to capture direct image-capable review of compact/immersive/main layouts, concurrent Agent+Canvas style isolation, multi-output switching, zoom/playback, keyboard close and fail-visible states.
- [x] 7.6 Use the Neko quality review workflow to audit owner/dependency/interface/extension/test boundaries, confirm deleted/poisoned parallel paths, record all executed commands and list residual risks including deferred Canvas inline player convergence and large-document performance.
