## Quality Review

- Risk: L2. The change crosses Canvas Webview, preload, sender-bound Main IPC and Node content access.
- Architecture: the Canvas domain owns eligibility, strict parsing and the request/result contract; Canvas Node owns bounded reads through `ContentReadService`; Desktop owns authorization and wiring; Webview owns disposable presentation state.
- Canonical path: `FileCanvasNode.contentLocator -> CanvasWebviewHostPort -> preload -> Main IPC -> DesktopCanvasRuntime -> CanvasHostRuntimeSession -> CanvasTextFilePreviewService -> ContentReadService`.
- No new production `any`, raw-path projection, package-local file reader, cache, contract version, broad renderer fallback or durable preview field was found.

## Verification

Passed:

- Canvas domain: 34 files, 277 tests.
- Canvas Node: 4 files, 22 tests.
- Canvas Webview: 63 files, 379 tests.
- Desktop focused runtime/IPC/preload: 3 files, 27 tests.
- Canvas domain and Node typechecks; Canvas Webview build.
- Focused Prettier, ESLint, JavaScript syntax, `git diff --check`, `check:unused` and strict OpenSpec validation.
- Isolated visible Electron scenario `canvas-text-file-preview` through production IPC and authorized content access.

Broader gate results unrelated to this change:

- Desktop typecheck is blocked by the Project catalog `unavailable` shape conflict at `apps/neko-desktop/src/main/index.ts`.
- `check:package-boundaries` passes its boundary audit, then fails because new Project packages are production-reachable while declared inactive.
- `check:no-internal-versioning` reports new Agent, Character, World and Project occurrences only.
- `check:legacy-debt` reports the new Character legacy authoring transfer only.

## UI Validation

- Scope: JSON, referenced Markdown, plain text, empty, invalid JSON, unsupported binary, selected and minimum-width Canvas File-node states.
- Runtime: isolated visible Electron with a temporary workspace and `userData`, crossing renderer/preload/Main/Node boundaries.
- Functional evidence: formatted JSON, read-only Markdown, preserved plain-text line breaks, visible empty/error states, generic unsupported icon, exact selected node and zero out-of-viewport nodes at 1440x900 and 960x700.
- Visual evidence: `reports/desktop-functional/preview-text-files-on-canvas/text-file-preview/screenshots/01-canvas-text-file-preview-desktop-selected.png` and `02-canvas-text-file-preview-narrow.png` were inspected directly. Nodes use white surfaces without nested backgrounds; selected state uses a 2px outline and elevated shadow; stable states remain readable and non-overlapping.
- Result: blocked only for stable loading-state pixels. The loading component state is covered by Webview tests, but authorized local reads finish too quickly for deterministic Desktop capture, so browser/component evidence was not promoted to Desktop visual success. All other inventory items passed.
- Adjacent observation: the wide screenshot contains an unrelated Project authoring-navigation error from the parallel worktree; it did not prevent the focused Canvas scenario from passing and is recorded above as residual risk.
