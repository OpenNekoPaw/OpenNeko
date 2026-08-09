## 0. Native File Authority Gate

- [x] 0.1 Audit the current Agent writer, protected-project policy, Text Editor external-change path and Agent Markdown parity baseline; record the gaps and owning change.
- [x] 0.2 Complete `add-ai-screenplay-authoring` tasks 1.1-1.3 and 3.1 so native content replacement uses freshness/CAS and generic file access rejects exact `.nkc`/`.otio` targets.
- [x] 0.3 Complete `add-ai-screenplay-authoring` task 2.3 with Host-driven file observation, clean-session reload and dirty-session conflict evidence.
- [x] 0.4 Prove the Phase 0 canonical paths and forbidden bypasses before registering a production Milkdown Rich mode or evaluating a Streamdown Agent renderer.

## 1. GFM Contract And Corpus

- [x] 1.1 Define `OpenNekoGfmProfile` in `@neko/markdown` from CommonMark and GFM 0.29-gfm, including one-/two-tilde strikethrough, tagfilter, raw HTML and URL policy.
- [x] 1.2 Separate Mermaid, Math, footnote, mention and Workspace resource syntax into explicit extension contracts with support and round-trip declarations.
- [x] 1.3 Build one conformance corpus covering representative GFM specification cases, OpenNeko extensions, source ranges, malformed input, CJK and hostile markup.
- [x] 1.4 Add path tests proving Milkdown and Streamdown spikes consume the package-owned corpus and no user-visible private Markdown format or alternate profile registry exists.

## 2. Milkdown Spike And Rich Editor

- [x] 2.1 Spike pinned Milkdown CommonMark/GFM presets against the corpus, IME, outline/reference ranges, 500-section CJK documents, theme/CSP and lazy bundle budgets before registering Rich.
- [x] 2.2 Define semantic GFM normalization and fail-visible source-preserving-extension behavior; poison semantic loss, raw-HTML execution and inline-style CSP paths.
- [x] 2.3 Add the package-owned lazy Milkdown adapter and `Rich | Source | Split` control while retaining CodeMirror as full Source/general text editor.
- [x] 2.4 Route Milkdown and CodeMirror changes through the same exact Text Document session/edit sequence and cover CJK composition, undo/redo, mode switching and split synchronization.
- [x] 2.5 Keep CodeMirror as the only complete Source editor; no Milkdown CodeMirror plugin or second full-source registration is present.
- [x] 2.6 Order icon-only Markdown controls as Source, Rich and Split; make Split an editable left Source plus read-only right Rich preview; keep incomplete CommonMark/GFM visible and restrict round-trip failures to Rich mutation instead of replacing the document presentation.
- [x] 2.7 Remove the page-sized Rich focus frame and prevent Host acknowledgements from replacing newer local Rich input or one accepted trailing paragraph break; prove rapid input ordering, single-Enter continuity, rejection recovery, CJK composition and Source consistency.

## 3. Streamdown Spike And Agent Renderer Replacement

- [x] 3.1 Spike pinned Streamdown against the smallest decisive parity set: completed/incomplete GFM, stable identity, hostile HTML/URL, resource references, creative tables, Mermaid and structured fences. Stop after deterministic hard-gate failures.
- [x] 3.2 Record the isolated candidate cost (507,659 bytes minified; 151,943 bytes gzip). Sustained-update and long-message acceptance were not run because correctness already rejected the candidate.
- [x] 3.3 Record the no-go decision: keep the current package-local renderer as the only production path; do not register Streamdown, a feature flag or a fallback.
- [x] 3.4 Keep Streamdown dev-only for the executable spike and prove production exports/registrations remain unchanged.

## 4. File And Semantic Projection Integration

- [x] 4.1 Derive editor outline, references, diagnostics and extension source ranges from `@neko/markdown`, not Milkdown or Agent renderer DOM.
- [x] 4.2 Preserve native Agent `.md` file authoring and clean/dirty external-change behavior without editor transaction injection.
- [x] 4.3 Verify Tool, Approval, Artifact, media and domain result blocks retain exact typed sibling presenters; the rejected candidate never receives them.
- [ ] 4.4 Verify Resource Browser reopen/reload projects authoritative file bytes after Agent publication and cannot promote chat DOM into an artifact.

## 5. Evaluation And User-Visible Validation

- [x] 5.1 Run deterministic GFM corpus, round-trip, renderer-path, security and package-boundary tests; this is the owning evidence for pure parsing/rendering behavior.
- [ ] 5.2 Run `neko-ui-validation` on the authoritative visible Desktop for Rich/Source/Split, CJK IME, outline navigation, long text/table/link fit, stream/final continuity, theme, keyboard and adjacent Workbench behavior. The Text Editor light/dark-theme, compact, conflict and Chromium/Electron IME composition inventory passes; visible Agent partial-to-final continuity remains unexecuted.
- [ ] 5.3 Reuse the native content-file Agent Evaluation owned by `add-ai-screenplay-authoring` to prove real `.md` file publication remains independent from editor/renderers; do not add a model Judge for deterministic rendering correctness.
- [x] 5.4 Run focused package tests/typechecks, Electron renderer validation, application/webview/dependency/OpenSpec gates and `neko-quality-review`; record exact blockers and residual risk.

## 6. Documentation And Completion

- [x] 6.1 Record the dated open-source comparison, source links, observed versions and uncertainty.
- [x] 6.2 Add OpenSpec proposal, five-layer design, requirements, tasks and Agent Evaluation disposition.
- [x] 6.3 Update the stable Markdown ADR, architecture navigation, document navigation and package-owned Markdown contract without claiming unimplemented dependencies are present.
- [ ] 6.4 After implementation evidence passes, archive the change and remove target/implementation-gap wording from stable documentation.
