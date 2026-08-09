# Evaluation

## Deterministic validation

Date: 2026-08-09

| Boundary                       | Command                                                                                                                                                                                                                 | Result                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Markdown parser and round-trip | `pnpm --filter @neko/markdown test`                                                                                                                                                                                     | Passed, 74 tests                             |
| Text Editor Domain             | `pnpm --filter @neko/text-editor-domain test`                                                                                                                                                                           | Passed, 55 tests                             |
| Text Editor Node               | `pnpm --filter @neko/text-editor-node test`                                                                                                                                                                             | Passed, 10 tests                             |
| Text Editor Webview            | `pnpm --filter @neko/text-editor-webview test`                                                                                                                                                                          | Passed, 47 tests                             |
| Desktop delegation             | `pnpm --dir apps/neko-desktop exec vitest run src/main/desktop-text-editor-runtime.test.ts src/renderer/desktop-text-editor-media-host-runtime.test.ts src/renderer/desktop-text-editor-reference-host-runtime.test.ts` | Passed, 12 tests                             |
| Package typechecks             | `pnpm exec tsc -p packages/markdown/tsconfig.json --noEmit && pnpm exec tsc -p packages/text-editor/domain/tsconfig.json --noEmit && pnpm exec tsc -p packages/text-editor/node/tsconfig.json --noEmit`                 | Passed                                       |
| Webview typecheck              | `pnpm --filter @neko/text-editor-webview build`                                                                                                                                                                         | Passed                                       |
| Desktop typecheck              | `pnpm --dir apps/neko-desktop typecheck`                                                                                                                                                                                | Passed                                       |
| Application boundaries         | `pnpm check:application-boundaries`                                                                                                                                                                                     | Passed, 1,498 files                          |
| Package boundaries             | `pnpm check:package-boundaries`                                                                                                                                                                                         | Passed                                       |
| Webview boundary               | `pnpm check:webview-boundaries`                                                                                                                                                                                         | Passed                                       |
| Workspace dependencies         | `pnpm check:deps`                                                                                                                                                                                                       | Passed, 1,478 modules and 5,054 dependencies |
| Canonical-path debt            | `pnpm check:legacy-debt`                                                                                                                                                                                                | Passed, zero blocking production matches     |
| Unused code                    | `pnpm check:unused`                                                                                                                                                                                                     | Blocked by two unrelated Desktop exports     |
| OpenSpec                       | `openspec validate add-markdown-workspace-references-and-media-embeds --strict`                                                                                                                                         | Passed                                       |

The Webview suite emits the existing jsdom `Window.scrollBy()` not-implemented warning. It does not
correspond to a failed assertion.

The first dependency run failed because the package role catalog omitted the already-created
`packages/text-editor/node` package. The catalog now declares the package as the Text Editor family's
Node runtime, and the exact dependency command passed on rerun.

## Poison evidence

The production Text Editor Webview source has zero matches for Node/Electron imports, filesystem
read/write calls, `file:` URLs, `openneko:` URLs, loopback URLs or localhost literals. Media source
targets are converted into strict document-qualified prepare requests; only the Host-projected URI is
assigned to an image, audio or video element. Milkdown uses one package-owned GFM/extension
projection and does not define a private Markdown profile or alternate resource catalog.

## Visible Electron UI validation

- **Scope:** Markdown Source completion, Rich/Split authorized image/audio/video presentation,
  missing-media recovery, light/dark themes, CJK IME and adjacent Workbench/Resource Browser
  controls. UI validation is applicable because the change adds visible authoring and media states.
- **Runtime:** visible macOS Electron 43.2.0 Desktop using the production Renderer, preload/Main IPC,
  Workspace catalog and canonical `openneko://resource/<opaque-token>` transport. This is the
  narrowest runtime that covers sender authorization, resource leases and document switching.
- **Inventory:** opened `media.md` from Resource Browser; inspected light Rich then Source-left/Rich-
  right Split; exercised missing-media Source reveal; switched to `input.md` and proved all prior
  leases rejected; requested `![[bo` completion with the keyboard and accepted `board.png`; composed
  CJK input; switched to dark theme, returned to the same project and inspected compact Split with
  adjacent tabs and Workbench controls.
- **Functional evidence:** `pnpm test:local:ui --scenario desktop-markdown-media` passed. The final
  report is
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T08-07-36.566Z-desktop-markdown-media-development/report.json`.
  It records two decoded images, native paused audio/video controls with metadata preload, an exact
  missing-resource diagnostic, unchanged authoritative Markdown bytes, four rejected released URLs,
  portable `![[board.png]]` insertion, CJK IME continuity, 20 opaque resource requests, expected MIME
  types, and zero poisoned requests, console errors, warnings or exceptions.
- **Visual findings:** directly inspected all four final artifacts. `01-markdown-media-rich-light.png`
  shows bounded full-width images, readable captions and the read-only recovery notice;
  `02-markdown-media-split-light.png` shows a coherent narrow Source/preview split with ellipsized
  media captions and single-line Source actions; `03-markdown-workspace-completion-keyboard.png`
  shows the exact `board.png` candidate at the incomplete token; and
  `04-markdown-media-split-dark-compact.png` shows readable contrast, stable 50/50 columns and bounded
  media at 960 x 640. No overlap, clipping, blank media or state mismatch was observed.
- **Result:** passed.
- **Residual risk:** native control appearance is Chromium/macOS-specific, and this focused scenario
  does not exercise long candidate labels in every locale or real playback/seek interaction.

### List-presentation regression

The 2026-08-09 rerun extended the visible `desktop-markdown-media` scenario with canonical GFM task
items, a plain unordered item, an ordered list and malformed `[-]` / standalone `[x]` text. The
development Electron report is
`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T09-50-47.829Z-desktop-markdown-media-development/report.json`.
It proves `disc` and `decimal` marker restoration after the Desktop Tailwind reset, distinct checked
and unchecked task presentation, unchanged malformed text, exact source bytes, bounded Split layout
and zero console errors or exceptions. Direct pixel inspection of
`03-markdown-lists-split-light.png` and `06-markdown-lists-split-dark-compact.png` confirmed readable
markers and checkboxes without clipping or overlap in both themes. The regression result is passed.

### Reference-completion refinement

The final visible Electron rerun is recorded at
`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T10-43-12.819Z-desktop-markdown-media-development/report.json`.
One scenario proved the three distinct source semantics: `@` returned only the active Project entity;
`[[` grouped one Workspace file and one Project-linked Media Library item; `![[` retained only the
embeddable linked image; and malformed `![[[` left source unchanged with no completion catalog. The
same run accepted a portable Workspace image entirely by keyboard, preserved both completion fixture
files byte-for-byte, rejected released media leases, and recorded zero poisoned requests, console
errors, warnings or exceptions.

Direct inspection of `04-markdown-entity-mention-completion-light.png`,
`05-markdown-reference-groups-light.png`, `06-markdown-media-embed-completion-light.png` and
`08-markdown-reference-groups-dark-compact.png` confirmed localized source headings, distinct entity,
file and media icons, selected-row contrast, portable locator details and independent ellipsis for
long labels/details. The menu remained inside the viewport at 1800 x 1000 and 960 x 640 without
overlap. Global Asset Library and unlinked Media Library records remain outside the Markdown catalog;
only an explicit Project link creates the portable `neko/assets/<library>/...` target consumed here.

## Quality review

- **Risk:** L3. The implementation crosses public Domain contracts, Node Workspace/resource access,
  Electron authorization and browser media lifecycle, while preserving one Text Document and one
  opaque resource path.
- **Findings:** no blocking or advisory code findings remain. Markdown owns syntax/caret projection;
  Text Editor Domain owns request, catalog and media lifecycle contracts; Text Editor Node owns
  Workspace-qualified candidate/media production; Desktop owns only sender/path authorization and
  resource publication; Webview owns disposable completion and presentation state.
- **Canonical-path evidence:** application, package and Webview boundary checks passed; dependency
  analysis found no violations across 1,478 modules and 5,054 dependencies; debt scanning reported
  zero blocking production matches. Poison tests and the visible Desktop report prove no raw path,
  cache, Agent catalog or alternate media source can produce success.
- **Documentation:** synchronized the unified Markdown resource ADR, package-boundary catalog and
  Text Editor Domain/Node/Webview READMEs with the canonical catalog, media projection and lease
  lifecycle.
- **Residual risk:** `pnpm check:unused` remains blocked by two unrelated existing/parallel Desktop
  exports: `activateWorkbenchMainView` in `DesktopShell.tsx` and
  `parseDesktopAgentConnectionIdentity` in `agent-contract.ts`. Native media-control visuals are
  Chromium/macOS-specific, and the focused scenario does not perform playback seeking.

All implementation and validation tasks are complete. The change is ready for archival after the
independently reviewable delivery commits are retained.
