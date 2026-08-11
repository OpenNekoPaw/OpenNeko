# Evaluation: Canvas Generation Recipe Nodes

## Agent Evaluation

### Scope

- Change: remove Agent composer direct Image/Video/Audio modes while retaining natural-language media generation through approved Agent Tools; Canvas Generation Node authoring remains a typed non-Agent operation.
- Disposition: `update` and reuse `agent-runtime.workflow-controller`; Canvas execution and static composer-control absence remain excluded from Agent Evaluation and are covered by Canvas/Generation tests plus visible Electron UI validation.
- Canonical Agent path: `Conversation -> Turn -> approved GenerateImage Tool -> exact Workspace GenerationJob -> durable generated-output -> Workspace Board`.
- Forbidden paths: Agent direct submit, media `SessionMode`, Canvas routing, generic Job Tool fallback, alternate provider/model, active/recent Workspace and generic Task/subagent substitution.

### Cases

- Updated `media-tool-terminal-result` with one configured positive image-generation turn, generated-output handoff to `ReadImage`, exact Board projection and forbidden-path assertions.
- Added a second turn in the same Conversation that explicitly switches to `nekoapi-chat-without-image-generation`; `GenerateImage` must end in `error` without Job success or fallback.
- Kept the scenario matrix on `configured-default`; the missing-binding profile is step-scoped so the positive turn is not duplicated under an intentionally invalid image binding.

### Verification

- `pnpm test:agent:eval`: passed, 44 files / 294 tests; all-suite key-free dry-run passed for 24 suites / 64 cases.
- This is authoring/harness evidence only. No provider-backed Agent behavior run was attempted because no explicit provider/model and cost authorization was supplied.
- Real Agent result: `infrastructure-blocked: no explicit provider/model and cost authorization`.

## UI Validation

### Scope And Runtime

- Applicable surfaces: Canvas add menu, Prompt/Image/Video/Audio Generation Node Recipe editors, compact layout, imported Media behavior and Agent composer direct-control removal.
- Authoritative runtime: visible development Electron 43.2.0 / Chrome 150 on macOS arm64, crossing package Webview, renderer, preload, Main, workspace persistence and OpenNeko resource transport.
- Report: `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T06-30-26.011Z-canvas-openneko-consumer-development/report.json` (`passed`, no console errors, warnings or Renderer exceptions).

### Inventory And Evidence

- Passed: ordered add catalog `Text, Table, Image, Video, Audio, 3D Director`; screenshot `02-canvas-generation-add-menu-large.png`.
- Passed: all four empty Generation Node kinds expose prompt, provider, model, legal kind parameters and one explicit Run control; screenshots `03`, `05`, `06` and `07`.
- Passed: Prompt Recipe editor at `1040x700` with no body-width overflow; screenshot `04-canvas-generation-prompt-selected-compact.png`.
- Passed: imported video/audio remain ordinary Media Nodes, preserve Preview/Add-to-Cut behavior and use authorized resource URLs; screenshot `08-canvas-node-selected-without-property-dock.png` plus the scenario playback checkpoints.
- Passed: Agent composer contains zero `.agent-control-chip-mode`, session-mode menu and direct-generation status surfaces; screenshot `16-desktop-dock-theme-surfaces.png`.
- Adjacent regression passed: video/audio playback, Cut handoff, Canvas Root teardown, exact Canvas reopen, Dock resize and resource projection/release.
- Blocked: visible provider-backed Run/Cancel/progress/success/failure, output-history selection and stale-Recipe states. The component and owning runtime tests cover their deterministic contracts, but no screenshot is claimed for these states without an authorized provider/model and paid execution.

### Visual Findings

- All eight current artifacts used for the claims above were inspected directly. Menu labels and icons remain compact and readable; Recipe controls fit within the selected node; the Run control remains visible; no text overlaps or horizontal page overflow were observed.
- The selected Generation Node intentionally overlays older Canvas content at its new top z-index in this dense fixture. Its creation position is now centered by node dimensions, so it remains within the owning Canvas pane rather than placing its top-left corner at the viewport center.
- Result: `blocked` overall because provider-backed running/history/stale states are unexecuted. The idle authoring, compact layout, imported Media and composer-removal inventory items passed.

### Follow-up: Ordered Mutations And Three-layer Selection

- Deterministic acceptance passed: one per-session Webview Host command queue commits a queued deletion before Generation Node creation, publishes the same ordered snapshot and remains usable after one narrow command fails locally.
- Focused acceptance passed: all four Generation kinds use the detached input panel; ordinary referenced nodes do not render it; prompt, references, provider/model, legal parameters, run/cancel, output history, diagnostics and result content remain bound to the same durable node.
- Visible Electron evidence captured the add menu plus Prompt desktop and `1040x700` compact states in `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T10-53-35.978Z-canvas-openneko-consumer-development/`. Direct image review confirmed the action toolbar, content node and input panel are distinct, readable, within the viewport and non-overlapping. The compact state moves the input panel above the node without clipping.
- The functional assertion now measures the content card rather than intentional connection ports outside the interaction container, and deletion uses the visible selection overflow action before the next add operation.
- Follow-up result: `blocked`. A separate Desktop development process occupied the canonical Vite port; isolated reruns were redirected and exceeded the 120-second scenario budget before producing current Image/Video/Audio screenshots. Those states retain deterministic component coverage and the earlier full visible evidence, but task `7.8` remains open because the current graphical rerun is incomplete.

### Follow-up: Configured Model Composer

- Agent Evaluation disposition: `excluded`. This follow-up changes the Canvas Host configuration projection and typed Recipe editor only; it does not change Agent prompts, Skills, Tool routing, provider selection, Conversation/Turn ownership or Agent runtime behavior. Existing Agent evaluation evidence above remains applicable.
- At this checkpoint the exact Workspace `ConfigManager` projected enabled, purpose-qualified model bindings and display labels into the Canvas Host snapshot without credentials or provider options. Default initialization was added later by the “Opaque Nodes, Workspace References And Defaults” follow-up; missing or stale authored bindings still disable Run with a local diagnostic and never fall back to the first catalog entry or another provider.
- Deterministic acceptance passed for configured model purpose filtering and exact persistence, bounded Image/Video parameter choices, Audio versus Music purpose switching, stale binding rejection and compact Composer safe-area calculation. Canvas Webview passed 59 files / 352 tests; Canvas Domain passed 32 files / 261 tests; Canvas Node passed 3 files / 18 tests; targeted Desktop Canvas/Resource coverage passed 3 files / 27 tests.
- Visible generation evidence is retained in `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T17-32-14.339Z-canvas-openneko-consumer-development/`. The `canvas-generation-authoring` checkpoint passed for all four kinds, including the configured Image/Audio model menus, Image/Video/Audio parameter panels, explicit Audio/Music tabs and desktop/compact Composer placement. Screenshots `03` through `14` were inspected directly.
- Direct image review found the original narrow-pane parameter alignment defect and a later top-clipping defect. The final responsive contract keeps the menu within the Composer width and viewport, permits bounded vertical scrolling when nineteen Image options cannot fit in a roughly 400px-wide Canvas pane, and uses the Canvas root's visual bounds plus the measured Composer height for safe panning.
- The same visible run continued beyond all generation checks and failed in the unrelated OTIO action inventory: runtime actions were `cut:open`, `preview:open`, `node:duplicate`, while the existing scenario expected another action. A later final-layout rerun was blocked before the Canvas checkpoint by concurrent unrelated Agent/Extension writes that caused repeated Vite HMR invalidations and page reloads. The freshly built packaged target was also unable to acquire an independent CDP target while another OpenNeko instance held the app lifecycle. No user-owned process was terminated.
- Follow-up result: `blocked` overall. Tasks `4.8`, `6.4` and `7.9` have deterministic and visible generation evidence. Task `7.8` remains open until the complete adjacent visible scenario can run without concurrent HMR and the pre-existing OTIO inventory mismatch is reconciled. Paid provider execution in task `7.6` remains separately blocked on explicit provider/model and cost authorization.

### Follow-up: Node-following Composer Surface And Dimensions

- The selected Generation composer now derives its screen position from the exact node plus current Canvas pan/zoom, uses the live drag projection during node movement, prefers a 16px gap below the node, flips above when the lower side cannot fit and keeps its horizontal bounds inside the owning Canvas viewport. Desktop width is capped at 680px; compact width retains 16px viewport insets, with Prompt/Image/Video and Audio using separate compact height budgets.
- Direct image review rejected a fully transparent first iteration because dense Canvas content bled through the prompt and model controls. The accepted surface uses the same elevated editor token family as Agent/input controls and does not reuse the tinted Canvas background. Model and parameter menus now use fixed viewport-aware placement, select the side with more room, apply a 16px safe area and scroll only within the bounded menu when the complete option set cannot fit.
- Deterministic acceptance passed in Canvas Webview: 59 files / 353 tests plus TypeScript build. Position coverage proves pan/zoom projection, below/above placement, compact safe-pan and measured-height behavior. OpenSpec strict validation, focused ESLint, functional-script syntax and `git diff --check` passed.
- Visible Electron generation acceptance reached and passed the `canvas-generation-authoring` checkpoint for Text/Image/Video/Audio in `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T18-07-15.069Z-canvas-openneko-consumer-development/report.json`. Every kind recorded the `editor` surface, non-transparent `rgb(255, 255, 255)` background, 16px anchor gap, zero center delta and no node/input/toolbar overlap or input overflow. Prompt drag changed the authoritative node position to `{ left: 26, top: 255 }` while the composer retained the same screen center and 16px gap; compact resize flipped it to `node-above` without body overflow. Screenshots `04` through `15`, including `05-canvas-generation-prompt-node-follow.png`, were inspected directly.
- The complete adjacent Canvas scenario still fails after the generation checkpoint when its later legacy Video Node center click is covered by an existing toolbar button/connection projection. This does not invalidate the generation checkpoint, but task `7.8` remains open because the whole adjacent scenario and provider-backed result-fill inventory did not complete. Paid task `7.6` remains blocked on explicit provider/model and cost authorization.

### Follow-up: Fixed Attachment Stack, References And Parameter Overlay

- This follow-up supersedes the independent above/below Composer placement described in the previous checkpoint. The selected toolbar, Generation node and Composer now share one screen-space attachment contract: toolbar above, Composer below, and one horizontal center. The Canvas viewport safe-pan contains the stack when it fits; neither accessory independently clamps or flips away from the node. Live drag projection is supplied to both accessories.
- Generation content no longer requests an opaque foundational surface. The Generation frame, content area and foundational selection/hover states retain transparent backgrounds while the Composer continues to use the non-transparent editor control surface.
- The Composer reference `+` is now a real button. Its typed `attach-generation-reference` Host intent authorizes a kind-appropriate Workspace source, projects exactly one material node and appends exactly one `reference` connection to the exact Generation node in the same serialized command. Renderer code receives no raw local path; cancellation returns the unchanged document as a successful no-op.
- Portal-rendered model and parameter overlays now recover the measured Composer width after leaving its DOM subtree and clamp against the owning Canvas viewport bounds rather than the Desktop window. Model and provider labels share one row. Image/video option groups retain multi-column grids and bounded internal scrolling instead of collapsing to the viewport-spanning single column shown in the defect screenshots.
- Deterministic evidence passed: Canvas Domain 32 files / 264 tests; Canvas Webview 59 files / 354 tests; full workspace TypeScript; focused ESLint; strict OpenSpec; Webview and application boundaries; packaged macOS arm64 Desktop build; `git diff --check`. New tests cover successful and cancelled atomic reference attach, invalid reference kinds, exact Webview button routing, fixed node geometry, transparent surface class, inline model/provider structure and Portal Composer-width propagation.
- Visible Electron evidence is infrastructure-blocked before any Canvas assertion. Development reports `2026-08-09T18-42-24.614Z`, `18-44-12.937Z` and `18-46-13.957Z` plus packaged report `18-46-38.313Z` under `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/` all fail waiting for the CDP target. The development process started without the isolated remote-debugging/user-data arguments; a direct packaged executable probe with an explicit debug port also remained before Renderer/Helper creation. The probe process was terminated and its empty temporary user-data directory was removed. No user-owned process or workspace was modified.
- Full repository `check:package-boundaries` reached and passed the architecture/package phase, then failed the unrelated product-status ledger because concurrent Automation edits make `@neko/automation-contracts` and `@neko/automation-node` production-reachable while marked retained-kernel. `check:no-internal-versioning` self-tests passed and then failed on three concurrent `packages/agent/runtime/src/extensions/extension-manager.test.ts` occurrences. No Canvas/OpenSpec file is named by either gate.
- Follow-up result: implementation task `4.10` is complete. Evidence task `7.11` remains open because the upgraded visible scenario could not reach a Desktop Renderer; no screenshot or graphical pass is claimed. Tasks `7.8` and paid-provider task `7.6` remain separately open.

### Follow-up: Opaque Nodes, Workspace References And Defaults

- Generation content now uses the opaque neutral Canvas node surface again; the composer remains a distinct editor surface and its footer is visually separated from prompt/reference content. Parameter overlays are capped at 460px, retain two or more option columns when space permits and scroll only inside Canvas viewport bounds.
- The reference `+` opens two explicit sources: Workspace reference and external import. Workspace Resource Browser drags reuse the strict `ContentLocator` payload and direct-reference authoring path; external files go through the existing Host import path so no absolute path becomes Canvas fact. Compatible drops are limited by Recipe kind and are atomically authored and connected to the exact Generation node.
- Desktop model projection marks the exact purpose default first and uses the configured model-type default only when no purpose override exists. New nodes copy that exact binding plus canonical typed kind defaults once at authoring time. Audio/Music tab changes apply the configured default for the new purpose when present; neither node creation nor mode switching selects the first catalog entry.
- Deterministic evidence passed: Canvas Webview 59 files / 356 tests plus TypeScript build; Canvas Domain 32 files / 266 tests; targeted Desktop Canvas runtime/model catalog 2 files / 19 tests; full workspace TypeScript; strict OpenSpec and all 70 OpenSpec items; Webview/Application boundaries; focused ESLint/Prettier; functional-script syntax and `git diff --check`.
- The visible Electron scenario was attempted and failed before a Renderer existed. Report `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T19-43-53.539Z-canvas-openneko-consumer-development/report.json` records that the concurrent Desktop development launcher forwarded `--openneko-functional-fixture` to Electron Forge as an unknown option, after which the CDP target timed out. No Canvas checkpoint or screenshot is claimed.
- Follow-up result: implementation task `4.11` is complete. Evidence task `7.12` remains open until the authoritative visible Desktop scenario reaches the Renderer at desktop and compact sizes; paid-provider task `7.6` remains separately blocked on explicit model and cost authorization.

### Follow-up: Compact Canvas Node Density

- Canvas Domain now owns one compact default/minimum size catalog consumed by Webview creation, Headless authoring and Generation authoring. New Text and Prompt nodes use `240x160`, Image/Video nodes use `240x180`, Audio uses `240x120`, File uses `220x150`, Job uses `240x150` and Group uses `320x220`. Existing persisted creator sizes remain authoritative.
- Workspace Board image projection uses a `208px` compact default width while preserving intrinsic aspect ratio; portrait regression coverage proves both generated `2:3` metadata and intrinsic `900x1600` dimensions. Reprojection coverage proves a manually authored size remains unchanged. Projection lane spacing was reduced consistently with the smaller cards.
- Deterministic evidence passed: Canvas Domain 33 files / 269 tests; Canvas Webview 59 files / 357 tests; focused Webview sizing/creation/store coverage 3 files / 24 tests; Canvas Webview build; full workspace TypeScript; strict OpenSpec and all 70 OpenSpec items; package, product-status, Webview, application and internal-versioning boundaries; functional-script syntax; focused ESLint with only six pre-existing warnings in the Workspace Board projection file; `git diff --check`.
- The authoritative visible Electron command `node scripts/run-desktop-ui-functional.mjs --scenario canvas-openneko-consumer --target development` was attempted. The CDP target did not become ready before timeout (`fetch failed`), so no Renderer checkpoint or screenshot is claimed. The scenario now contains exact DOM size assertions for all four Generation kinds at desktop size and for Prompt after compact-window resize, ready to become visible evidence when the Desktop target starts.
- Follow-up result: implementation task `4.12` is complete. Evidence task `7.13` remains open because visible desktop/compact screenshots could not be captured; no automatic rewrite of existing `.nkc` node sizes was introduced.

### Follow-up: Unified White And Light-Glass Canvas Surfaces

- Canvas cards now own one white/light-glass neutral surface with a shared subtle border and shadow. Generation content remains transparent only inside that card so it does not create a nested second panel. The selected-node toolbar, Generation composer, add/model/parameter/reference popovers and overflow menu use the corresponding elevated surface family.
- Composer footer, shared toolbar mode group, model/reference rows, parameter options and ordinary buttons no longer carry persistent gray or tinted fills. Hover, selected and focus states use restrained neutral tints; delete remains a danger-foreground action with only a soft interaction tint instead of a saturated red block.
- An older untouched Recipe with no model, prompt, references, run/output state or authored parameters now adopts the exact configured `isDefault` binding once and persists its canonical kind parameters through the typed Recipe update. Authored Recipes remain unchanged, and missing configuration never falls back to the first catalog entry.
- Deterministic evidence passed: focused Canvas Webview surface/default suites 3 files / 51 tests; shared-toolbar surface regression 1 test; Canvas Webview TypeScript build; Canvas Domain full tests and typecheck; targeted Desktop model-catalog projection; full workspace TypeScript; strict change validation and all 70 OpenSpec items; package/product-status, application and Webview boundaries; `git diff --check`. The full Canvas Webview run reached 358 / 360 passing before two five-second timeouts under repository load; both affected files then passed alone (11 / 11). The full shared UI run similarly reached 213 / 214 before one five-second timeout, and that file passed alone (4 / 4). No assertion failure remained.
- The authoritative visible Electron command was attempted again. Report `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T20-37-07.142Z-canvas-openneko-consumer-development/report.json` contains no checkpoint because the Desktop CDP target failed before Renderer creation (`fetch failed`). No current graphical pass or screenshot is claimed. The scenario now asserts a non-transparent outer node/toolbar/composer surface, transparent inner Generation content/footer/resting controls and the existing compact model/parameter geometry once the Renderer becomes reachable.
- The Canvas surface follow-up removes the Canvas vignette and inset shadow, keeps node content on the solid elevated surface, gives default/hover/selected nodes three restrained shadow levels and uses an explicit `2px` neutral selected outline. Toolbars and popovers retain the light-glass overlay while the Generation composer remains solid white; MiniMap and Zoom controls own one shadow each instead of inheriting a parent drop shadow. At `<=920px`, an open Generation composer hides the MiniMap and moves the still-available Zoom controls to the top-left so the HUD no longer overlaps the composer.
- Current deterministic evidence passed: Canvas Webview 62 files / 375 tests, Canvas Webview TypeScript build, Webview boundaries, strict OpenSpec validation and `git diff --check`. Supporting browser-owned review loaded the production Canvas CSS and real `BaseNode`, `MiniMap` and `ZoomControls` components. Direct pixel review covered desktop default/hover/selected nodes, add and model overlays, plus `760x680` and `480x720` compact states. Captures are under `reports/ui-validation/canvas-surface/2026-08-11/`; computed surfaces were white, hover strengthened only border/shadow, selected used the exact outline/shadow state, overlay rows used neutral selection tint, and no compact overflow or HUD/composer overlap remained.
- The current authoritative visible Electron retry remains blocked. Report `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-10T18-03-36.243Z-canvas-openneko-consumer-development/report.json` has no checkpoint: an existing Desktop development process owns the checkout's Vite bundle, so the isolated scenario timed out before Renderer creation. Browser-owned captures are supporting presentation evidence only and do not replace the missing Desktop lifecycle/runtime evidence.
- Follow-up result: implementation task `4.13` is complete. Evidence task `7.14` remains open until the authoritative visible scenario can inspect desktop and compact node, composer, toolbar and popover states. Paid-provider task `7.6` remains separately blocked on explicit model and cost authorization.

### Follow-up: Reference-Aligned Composer And Image Parameters

- The node-following Composer now caps at `620px`, keeps its reference strip at the top, lets the prompt region absorb the remaining editor height and preserves one non-wrapping footer for model, parameter summary, output count and Run. Footer controls are shrinkable at compact widths and hide only the secondary provider label before allowing horizontal overflow.
- Image parameters now present fourteen common square/landscape/portrait/wide ratios in a five-column desktop card grid, explicit 1K/2K/4K resolution and low/medium/high quality labels. Output count is removed from the general parameter surface and exposed as a separate `124px`-class vertical `1..4` popover, while both controls still update the same typed Image Recipe through the same serialized Host intent.
- Deterministic evidence passed: Canvas Webview 59 files / 361 tests; focused Composer/layout coverage 2 files / 46 tests; Canvas Webview TypeScript build; focused ESLint and Prettier; strict OpenSpec; Webview boundaries; functional scenario syntax and `git diff --check`. Existing Radix SSR and React test-environment warnings remain visible but no test failed.
- The authoritative Desktop scenario was attempted with `node scripts/run-desktop-ui-functional.mjs --scenario canvas-openneko-consumer --target development`. Report `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T20-54-16.871Z-canvas-openneko-consumer-development/report.json` failed before Renderer creation because the CDP target was not ready (`fetch failed`), so no new screenshot or graphical pass is claimed. The scenario now verifies the image footer exposes two typed controls, the grouped parameter surface remains contained and the independent count surface contains exactly `× 1..4` within `140px`.
- Follow-up result: implementation task `4.14` is complete. Evidence task `7.15` remains open until the authoritative Desktop runtime can capture and directly inspect default, parameter-open, count-open and compact states.

### Follow-up: Media-specific Material Actions And Keyboard-only Delete

- Audio, Video and Image material operations now use stable action identities and one capability-owned toolbar projection. Existing canonical owners surface real Edit/Cut, Save material and full-screen Preview actions; advanced operations are ordered by media kind only when an exact owner contributes them. Missing owners omit the action instead of rendering disabled or no-op controls.
- Delete was removed from the selected-node toolbar, overflow menu and node context menu. The Canvas keyboard controller remains the sole node-deletion UI path and retains focus-scoped `Delete`/`Backspace` behavior; text inputs continue to consume those keys locally.
- Deterministic evidence passed: Canvas Domain 33 files / 269 tests; focused Canvas Webview selection/context-menu/keyboard coverage 3 files / 20 tests; Canvas Domain typecheck; Canvas Webview production build; Desktop typecheck; strict OpenSpec; Webview, package, application and internal-versioning boundaries; `git diff --check`. The focused toolbar coverage proves media-specific ordering, advanced owner contribution and omission, exact Cut dispatch and absence of synthetic unavailable actions.
- Visible Electron acceptance was attempted against the current checkout after terminating only validation processes that held the app single-instance lock. Electron Main, Host ports, resource/workspace registries and Renderer all reported loaded, but the `localhost:5173` window remained an empty white surface with no Canvas accessibility tree or interactive Root. The development process was then terminated; no Workspace fact or user file was changed. No desktop or compact graphical pass is claimed.
- Follow-up result: implementation task `4.16` is complete. Evidence task `7.17` remains open until the authoritative visible Desktop runtime renders the Canvas and the Audio/Video/Image toolbars can be inspected at desktop and compact sizes.

### Follow-up: Generated-output Material Actions

- A Generation Node with one exact selected Image, Video or Audio output now resolves that output through the same material-action target catalog as an ordinary Media Node. Empty Prompt Recipes and Generation Nodes without a selected successful media output remain non-material targets and contribute no synthetic actions.
- Generated Video contributes the real Cut-owned Edit and Audio separation descriptors. Audio separation imports the exact selected output into the exact Cut draft and applies Cut's canonical `separate-audio` command in the same owning runtime; Canvas does not emulate the operation and missing owners still omit unavailable actions.
- The selected-node toolbar now keys action resolution by selected material identity, including Generation `selectedOutputId`, kind and locator. A successful output arriving on the already selected node therefore re-resolves the toolbar immediately without requiring deselection, Canvas reopen or a node-id change.
- Deterministic evidence passed: Canvas Domain 33 files / 272 tests and typecheck; Cut Node 5 files / 18 tests and typecheck; Canvas Webview 61 files / 368 tests and production build; targeted Desktop Canvas/Cut 2 files / 44 tests; Desktop typecheck; strict OpenSpec and all 72 OpenSpec items; package, application, Webview and internal-versioning boundaries; `git diff --check`.
- Visible Electron inspection reached the current Canvas before a concurrent development HMR invalidation. The existing Desktop process then failed to reload because `@neko/automation-webview/target-selection/root` is not exported from a concurrently modified package, so the authoritative Renderer could not be restored for a current toolbar screenshot. This import error is outside the Canvas/Cut files changed by this follow-up; no graphical pass is claimed and no user Workspace fact was changed.
- Current deterministic recheck passed: focused selection/context-menu/keyboard coverage 4 files / 26 tests, Canvas Domain 34 files / 277 tests, Canvas Webview 63 files / 381 tests, targeted Desktop Canvas runtime 1 file / 22 tests, Canvas Webview TypeScript build, strict OpenSpec validation, Webview boundaries and `git diff --check`. Material-action resolution and exact execution failures now remain visible on the selected-node toolbar instead of silently dropping owner actions.
- The current authoritative Desktop retry is blocked before Canvas becomes visible. The standard development runner could not acquire the checkout's existing Vite bundle owner; an isolated Electron launch against the built runtime then failed in unrelated Project composition navigation with `ProjectCompositionError` / `project-composition-not-found`. Report `reports/desktop-functional/add-canvas-generation-recipe-nodes/canvas-media-node-actions/report.json` contains the diagnostic and no Canvas checkpoint or screenshot, so neither desktop nor compact graphical acceptance is claimed.
- Follow-up result: implementation task `4.17` is complete. Evidence task `7.17` remains open until the authoritative Desktop runtime can enter Canvas and the Image/Audio/Video toolbars can be inspected at desktop and compact sizes.

### Follow-up: Text And File Material Actions

- Generic File nodes with an authorized `ContentLocator` now resolve as canonical `document` targets when `mediaKind` is absent; an explicit media kind remains authoritative, and no extension inference grants Image/Audio/Video capabilities. A selected successful Prompt output resolves as an immutable generated document target, while an empty Generation node remains non-material.
- The capability owner contributes `text:edit` only for an admitted referenced document and dispatches the exact Canvas identity and target to the canonical Desktop Text Editor runtime. Generated Prompt output can still receive Preview, Finder and Media Library actions from their owners, but never mutable Text Editor ownership. Image/Audio/Video File nodes reuse the same kind-specific toolbar presentation as Media and selected Generation outputs.
- Deterministic evidence passed: Canvas Domain 34 files / 280 tests and typecheck; Canvas Webview 63 files / 386 tests and production build; targeted Desktop Canvas runtime 1 file / 23 tests; focused ESLint and Prettier; strict OpenSpec validation; Webview boundaries and `git diff --check`. New coverage proves referenced text dispatch, generated Prompt omission, generic File document semantics, explicit File media labels/actions, empty Generation omission and visible resolution/execution diagnostics.
- The authoritative `canvas-text-file-preview` Desktop scenario now asserts Text Edit, Save material, Preview, Finder and global Media Library layout at desktop and compact sizes, then performs the real Text Editor handoff. Its current run is infrastructure-blocked before Renderer creation because Desktop development process PID 4986 already owns this checkout's Vite bundle. Report `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-10T22-29-31.734Z-canvas-text-file-preview-development/report.json` contains no checkpoint or screenshot; no user process was terminated.
- Supporting direct inspection of the already-running OpenNeko window reached the current Workspace Canvas. Selecting `project.json` exposed `编辑文本`, `存为素材`, duplicate and `全屏预览`; More exposed `在访达中显示` and `复制到全局媒体库`. The inspected nodes used white cards with restrained borders/shadows and a visible selected state. This supports the visible toolbar claim only and does not replace the blocked isolated desktop/compact handoff scenario.
- Follow-up result: implementation task `4.16` is complete. Evidence task `7.17` remains open because authoritative isolated Desktop and compact action/handoff evidence is incomplete.

### Follow-up: External Node Names

- BaseNode now owns one external icon-and-name slot above the card. Ordinary Image/Video/Audio, File and Generation renderers supply identity content to that slot; media preview/player bodies no longer position names internally or append a footer below the card.
- File display still resolves only the basename from its durable path/title facts. Media display resolves an authored title or source basename without changing the stored node data. No Desktop, ContentLocator or persistence contract changed.
- Selection attachment geometry now reserves the external label before placing the action toolbar. The toolbar remains above the label at compact, default and enlarged zoom, and Generation safe-pan measures the same shared toolbar top instead of using a conflicting local height estimate.
- Deterministic evidence passed: focused node and selection coverage 6 files / 46 tests; full Canvas Webview 62 files / 372 tests; Canvas Webview TypeScript build; focused ESLint with three pre-existing hook/non-null warnings and zero errors; package and Webview boundaries; strict OpenSpec; `git diff --check`.
- Focused UI validation used the real Canvas Webview React components and production CSS because the affected placement is browser-owned and does not cross Host authorization or lifecycle. At the desktop viewport, Video `Cut Basic Functional Fixture.mp4`, File `volume-01.epub` and Image Generation labels were all visible above their cards with a measured 6px gap. At `640px`, the Video and File labels remained fully inside the viewport, above the cards and unclipped. Both captures were inspected directly; no overlap, duplicate/bottom title, missing File name or runtime warning/error was observed.
- The full Desktop runtime remains unavailable because a concurrent unrelated `@neko/automation-webview/target-selection/root` export error prevents renderer loading. This does not weaken the browser-owned layout result, but it remains a separate blocker for the broader Desktop evidence tasks already listed above.
- Follow-up result: implementation task `4.18` and focused evidence task `7.18` are complete.

## Foundational Matrix

### Follow-up: Agent Generation Tool Discovery

- Evaluation disposition is `reuse`: `agent-runtime.workflow-controller/media-tool-terminal-result`
  already requires the public Agent input path, an exact flat `image.generate` binding, one
  `GenerateImage` Tool call, Generation Job/artifact/Workspace Board evidence and a same-Conversation
  missing-binding failure with no provider, Canvas or direct-generation fallback. No Scenario or
  runner contract change is required for this defect.
- Deterministic evidence adds the missing preconditions below that behavior case: Entry Draft
  projection of the configured image model, Draft-submit contract validation, pending first-Turn
  persistence/restart restoration and Desktop controller projection of a domain-executed
  `image.generate` policy beside a text-only `agent.main` model.
- Key-free Agent Evaluation and the focused Scenario dry-run pass. These results prove schema,
  discovery and harness readiness only. The provider-backed visible case remains unexecuted because
  this task has no explicit provider/model cost authorization.

- Covered deterministically: basic and multi-turn Conversation behavior, queue/terminal convergence, Canvas run-intent persistence, uncertain submission recovery, exact Job reattachment, result apply after Recipe edits, renderer unmount/reopen, output preservation and Conversation/Workspace isolation through Agent Runtime, Canvas Domain/Node and Desktop headless tests.
- Unaffected and rechecked: compaction continuation, transcript restoration, Conversation switching and transcript/config/context isolation remain owned by the existing Agent Runtime suites, which passed in the full package run.
- Blocked as real-provider evidence: natural-language Agent generation, visible Canvas paid generation, provider-backed generation-record restoration and artifact/Board projection after a complete application reopen.

## Quality And Residual Risk

- Focused package, Desktop headless, targeted Desktop, OpenSpec and architecture boundary checks passed. Full workspace `pnpm typecheck` passed.
- `pnpm check:no-internal-versioning` now passes its self-tests and repository audit with zero new occurrences; no Canvas sizing contract introduces an internal generation or alternate path.
- `pnpm check:unused` remains blocked by pre-existing exports in `DesktopShell.tsx` and `agent-contract.ts`; neither is introduced by this change.
- Pre-release rollback is valid only before user documents contain Generation Nodes. After such documents exist, recovery is fix-forward so an older build cannot silently discard the new canonical node.
- The remaining product risk is provider-backed behavior and the corresponding visible running/history/stale presentation. It must be closed with explicit provider/model selection and cost authorization before release acceptance.

### Follow-up: Generation Status And Grouped Image Results

- Canvas Node now projects the authoritative GenerationJob `createdAt` and `updatedAt` timestamps together with its existing phase and provider-derived progress. The strict Host decoder rejects missing timestamp pairs, non-finite values and reversed timestamp order at the current message boundary.
- Image outputs from one exact JobRef render as one compact result stack. The selected output remains the primary preview, the badge exposes the exact count and current index, and a transient two-column in-node comparison selects through the existing canonical output-selection intent without resizing the durable node or creating sibling Media/Group nodes.
- Active presentation derives preparation, queue, provider execution and commit labels from real projection facts, shows elapsed time and an available percentage, and uses the scan animation only as a non-measured activity cue. Terminal failure/cancellation preserves prior results and displays one Job-level diagnostic; no per-output failure slot or ETA is fabricated.
- Deterministic evidence passed: Canvas Node 4 files / 22 tests; Canvas Webview full run 63 files / 388 tests before the final additional grouped-failure assertion, then focused Generation Node 1 file / 8 tests and TypeScript build; strict OpenSpec; package/Webview/no-internal-versioning boundaries; repository OpenSpec validation; `git diff --check`.
- Visible Electron inspection used the running development Desktop and the real persisted `generation-2` Image node. At fit-to-content and selected-node views, the failed provider outcome stayed local to the node, the prior Canvas remained usable and the node exposed a compact `失败 · 5:01` status derived from projected timestamps. The selected composer remained anchored below the node.
- No existing persisted Job in the inspected Workspace contained two successful outputs, and no paid generation was authorized for this validation. Therefore the grouped success/active pixel review remains blocked; deterministic production-component coverage verifies the two-output stack, fixed `320×240` node size, comparison toggle, exact output selection and prior-group preservation. Implementation task `4.19` is complete; evidence task `7.19` remains open until a no-cost fixture or explicitly authorized provider run supplies visible active and multi-success states.

### Follow-up: Active Multi-Image Placeholder Surface

- The active multi-image placeholder no longer reuses the completed result group's stacked-card class. Pending requests retain the BaseNode-owned single white content surface and show only the requested output count, restrained scan cue and authoritative stage/progress pill; the bounded stack layers remain exclusive to two or more committed image outputs.
- Focused component coverage asserts that an active two-image request renders the pending presentation and does not render the completed `result-stack--multiple` presentation. Existing grouped-output coverage continues to assert the committed two-output stack, exact count/index, comparison toggle and canonical selection intent. Canvas Webview passed 63 files / 389 tests plus TypeScript build; strict OpenSpec validation, Webview boundaries, focused formatting and `git diff --check` passed.
- Direct visible inspection used the already-running OpenNeko Desktop and its existing `generation-2` two-image active Job, without starting another provider request. After HMR, the node retained its `2 张`, scan cue and `正在提交 · 0%` status while showing one BaseNode border; the duplicate right/bottom stack outlines from the reported defect were absent. Selecting the node kept the toolbar and composer attached without reintroducing the overlap.
- This is a browser-owned presentation correction with no Canvas Domain, GenerationJob, Host contract, provider or Agent routing change. Agent Evaluation remains excluded, and no paid generation is required for the deterministic regression.

### Follow-up: Ambiguous NewAPI Submission And Empty-State Alignment

- The configured NewAPI image path is the synchronous `POST /v1/images/generations` endpoint. A
  transport close after submission now retains one provider-neutral `outcomeUnknown` fact through AI
  SDK error normalization and Media execution, then terminates the canonical GenerationJob as
  `outcome-unknown` even when the provider returned no recoverable task identity. The coordinator does
  not invent a task, report success or automatically submit the paid request again.
- Existing persisted Job facts are not rewritten. The inspected `generation-2` record therefore keeps
  the ordinary `failed` phase authored before this correction; a future ambiguous submission follows
  the corrected classification. This preserves authoritative history instead of adding a legacy
  projection override.
- No-preview Image/Audio/Video nodes now always use one full-height result surface. The failed Image
  placeholder is centered independently from its lower-right terminal status, while pending multi-image
  styling and completed multi-output stack layers remain mutually exclusive.
- Deterministic evidence passed: AI SDK 3 files / 8 tests; Generation 29 files / 182 tests and
  typecheck; Canvas Webview 63 files / 390 tests and TypeScript build; strict OpenSpec validation and
  Webview boundaries. The added tests cover the NewAPI transport marker, nested wrapper preservation,
  executor conversion, coordinator classification without a provider task, zero automatic resubmission
  and the failed two-image placeholder surface.
- Visible validation reused the running development Desktop and the already persisted failed Image Job;
  it did not start another provider request. After HMR and node selection, the kind icon was centered in
  the full white card, the terminal pill stayed lower-right and the attached composer remained below the
  node without overlap. Evidence:
  `reports/desktop-functional/add-canvas-generation-recipe-nodes/unknown-outcome-icon/failed-image-icon-centered.jpeg`.
- The provider outcome itself remains unrecoverable because this endpoint returned no external task
  identity. Operational resolution requires the gateway owner to allow the request to finish or expose a
  recoverable task API; the Desktop cannot safely infer success or retry without risking duplicate charge.
- Final repository gates passed for OpenSpec (83 items), strict change validation, package boundaries,
  the canonical-path/internal-versioning audit and every touched package. The current full-workspace
  `pnpm typecheck` is independently blocked in `@neko/chara-webview` because two existing test fixtures
  omit the required `getConversationLaunchCatalog` port; neither fixture is in this change's dependency
  or modification set.
