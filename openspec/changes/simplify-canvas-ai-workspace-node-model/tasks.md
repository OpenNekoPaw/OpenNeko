## 1. Contract and migration

- [x] 1.1 Add failing shared-contract tests for the six canonical node types and three connection types
- [x] 1.2 Define Markdown, Media, Group, Job, File, and CanvasEmbed data contracts
- [x] 1.3 Add versioned load-boundary migration tests for each removed node family
- [x] 1.4 Implement deterministic legacy migration and reject legacy types after load

## 2. Canvas domain and authoring

- [x] 2.1 Replace Canvas Agent/catalog authoring schemas with the canonical node model
- [x] 2.2 Replace Shot/Scene generation inputs with Job and generic content refs
- [x] 2.3 Update Workspace Board planning to emit Markdown, Media, File, and derived-from connections only
- [x] 2.4 Delete or poison Storyboard/Narrative/Behavior/Entity/Memory authoring and Extension command paths
- [x] 2.5 Delete the unconsumed `canvas-creative-ai-actions` public DTO/validator surface and guard
      it from returning as a parallel authoring contract

## 3. Webview

- [x] 3.1 Replace Basic/Professional and subsystem catalogs with the canonical node renderer model
- [x] 3.2 Implement shared Media renderer variants plus Markdown, Group, Job, File, and CanvasEmbed renderers
- [x] 3.3 Update source-add intents for Image, Audio, Video, File, and Subcanvas
- [x] 3.4 Remove old node renderers, property editors, overlays, presets and subsystem loading
- [x] 3.5 Simplify connection creation/editor/rendering to sequence, reference, and derived-from
- [x] 3.6 Preserve generic node transforms, properties, ports, Markdown rendering, connection editing, and generation provenance UI

## 4. Preview input and host integration

- [x] 4.1 Adapt generic Markdown/Media/Group projection into the existing Preview workspace and route/storyboard matrix
- [x] 4.2 Remove obsolete Narrative authoring feature flags and Shot/Scene commands without removing Preview workspace or media runtime
- [x] 4.3 Update outline, status, clipboard, drag/drop and Extension API paths
- [x] 4.4 Preserve the Extension-authorized Engine stream and `@neko/neko-client` playback path with canonical-path tests
- [x] 4.5 Route quick generation from explicit Canvas selection into Agent-owned Job execution

## 5. Documentation and acceptance

- [x] 5.1 Update Canvas README/architecture and affected Agent/Workspace Board documentation
- [x] 5.2 Run shared producer/consumer tests and Canvas Webview/Extension builds
- [x] 5.3 Run `pnpm build`, `pnpm test`, `pnpm check`, legacy-debt and unused-code gates
- [ ] 5.4 Validate the node catalog, source actions, migration diagnostics, Preview workspace, matrix and media path in Extension Development Host

## 6. Contextual add actions

- [x] 6.1 Replace the right node-library Dock with a left-toolbar add popover
- [x] 6.2 Share one add action catalog between the popover and Canvas context menu
- [x] 6.3 Remove empty JobCard authoring while retaining Job projection/rendering
- [x] 6.4 Localize add actions and enforce English/Simplified Chinese key parity
- [ ] 6.5 Run focused Webview tests, build/quality gates, and Extension Development Host acceptance
