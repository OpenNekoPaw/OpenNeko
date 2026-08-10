# Agent Evaluation

Date: 2026-08-10

## Evaluation Scope

- Change/feature: Markdown file editing adds Milkdown Rich mode while native Agent file authoring
  remains unchanged. Streamdown was evaluated and rejected, so Agent production presentation does not
  change.
- Decision and owning suite: `excluded` for GFM parse, streaming presentation, round-trip and security
  correctness because these are deterministic renderer/parser behaviors. `reuse` the native
  content-file behavior owned by `add-ai-screenplay-authoring` for real Agent `.md` publication and
  editor external-change behavior.
- Why real Evaluation is or is not required: a model/provider cannot establish whether a DOM used one
  renderer, retained identity, sanitized HTML or round-tripped GFM. Deterministic fixtures and visible
  Electron evidence are authoritative for those facts. Real Evaluation remains required only for the
  separate user-visible Agent Tool selection and durable file artifact path.
- Canonical path and forbidden fallback: Timeline text block -> current package-local normalized
  renderer from partial to final; Agent file Tool -> Workspace `.md` -> file-change projection.
  Forbidden paths are a production Streamdown registration, static-only final renderer,
  Agent-to-Milkdown transaction, renderer-authored file, raw HTML, alternate parser/renderer and
  direct Evaluation runtime substitution.

### Agent turn presentation addendum

- Decision: reuse `agent-runtime.stream-delivery/tool-text-order-final-answer` for Desktop
  event-projection behavior. Do not add a renderer-quality Judge or a second suite.
- Runtime change: the Webview projects each durable assistant message once, then classifies its existing
  typed content blocks into answer, deliverable, actionable and activity roles. It does not change
  AgentSession, Timeline persistence, Tool routing or provider behavior.
- Canonical path: Desktop Timeline message -> one message-list row -> one turn presenter -> current
  normalized Markdown renderer and exact typed sibling presenters. The removed block-flattening and
  nested process-group components have no production registration or fallback.
- Evaluation requirement: real provider execution remains required because Desktop event projection
  changed, even though Markdown grammar and DOM styling remain deterministic concerns.

### Active output interaction addendum

- Decision: `excluded` for browser scheduling, composer enabled-state and Desktop pending-scope
  correctness; deterministic Webview/Desktop tests plus visible Electron interaction are authoritative.
  `reuse` `agent-runtime.stream-delivery/tool-text-order-final-answer` for the unchanged ordered
  Timeline event-projection path.
- Canonical path: ordered Desktop Timeline patches -> exact projection replica -> one package-owned
  Markdown presentation scheduler -> current normalized renderer. The scheduler may coalesce only
  append-only presentation work and must synchronously converge on completion.
- Forbidden fallback: dropping/reordering a patch, raw streaming text, a second renderer, static-final
  replacement, direct runtime injection, or deriving Desktop layout availability from Agent run state.
- User-visible evidence: while a real response streams, the user can focus/type/queue plain text,
  scroll, resize/toggle valid Workbench regions and switch presentation without cancelling or
  redirecting the exact Conversation task. Model configuration for the active Turn remains locked.

### Reopened turn projection addendum

- Decision: `reuse` `agent-runtime.workflow-controller/conversation-persistence-resume` for the real
  Desktop owner restart and Pi Session restoration path. Exact Pi-entry grouping and Webview hierarchy
  equivalence are `excluded` from model judgment and use deterministic projector/component tests plus
  visible Electron evidence.
- Canonical path: persisted Pi branch -> Agent runtime user-turn history projection -> one assistant
  `Message` with ordered typed blocks -> the same Webview turn presenter used by live Timeline output.
- Forbidden fallback: one product message per provider iteration, Webview adjacent-message grouping,
  Tool-name matching, timestamp-window merging, a reopen-only renderer or direct Evaluation turn
  injection.
- Foundational matrix impact: transcript restoration is affected; continuation, queue, configuration,
  context, artifact and cross-conversation isolation remain unchanged. The existing real case proves
  owner/session restoration but does not substitute for visible one-disclosure hierarchy evidence.

### Turn timing and document-evidence interaction addendum

- Decision: `excluded` from a new model Judge for elapsed-time arithmetic, disclosure hierarchy,
  exact activity order and thumbnail controls. Reuse
  `agent-runtime.stream-delivery/tool-text-order-final-answer` for ordered live events and
  `agent-runtime.workflow-controller/conversation-persistence-resume` for owner restart/history.
- Canonical path: earliest visible Timeline item `createdAt` plus terminal
  `completion.completedAt` -> `Message.turnTiming` -> one elapsed activity summary. The same exact
  timing pair is checkpointed as a Pi custom product projection between its user and assistant
  messages, then restored into the canonical history `Message`.
- Forbidden fallback: summing Tool durations, deriving completion from Webview mount time, inferring a
  restored Turn from timestamp windows, type-grouping activity, classifying ReadImage pages as generated
  deliverables, or exposing raw reference JSON as a primary thumbnail control.
- Coverage: deterministic Event/Timeline/history/Webview tests prove the exact timing pair, overlapping
  Tool independence, original sequence, failure visibility, live/reopen parity, ReadImage evidence
  nesting, open/copy-reference/Canvas actions and final-answer/deliverable placement. No Prompt, Skill,
  provider, model or Tool-routing behavior changed.

## Cases

- Excluded deterministic cases: official GFM/profile corpus; incomplete emphasis/link/fence/table/list;
  stable content-block and DOM identity; raw HTML/URL/CSP; resource/Mermaid/semantic extension;
  Milkdown round-trip; Rich/Source/Split synchronization; typed sibling isolation.
- Reused real case: native content file authoring creates/updates a durable Markdown/Fountain artifact
  through the core Workspace file path, with no Text Document session or renderer mutation path.
- Evidence and coverage: exact renderer registration, poisoned retired path, semantic fixture output,
  DOM identity, security result, session edit sequence, durable Workspace-relative artifact identity,
  freshness and external-change diagnostic.
- Missing observability: no new Agent runtime fact is required for rendering. The reused native-file
  suite still needs the complete-session facts recorded by `add-ai-screenplay-authoring/evaluation.md`.

## Verification

- Key-free validation: passed on 2026-08-10 with 44 files / 294 tests and all 24 indexed suites / 64
  cases; this remains authoring-readiness evidence only.
- Turn-timing rerun: the standard key-free command reached 42/44 files and 291/294 tests, while three
  repository/isolated-worktree tests exceeded their fixed five-second timeout under concurrent
  Electron/package load. The exact three tests pass 2 files / 9 tests with a 20-second test timeout,
  and the strict all-suite dry-run passes 24 suites / 64 cases. Focused dry-runs for
  `tool-text-order-final-answer` and `conversation-persistence-resume` each pass selection and schema
  validation. This remains harness evidence, not real Agent behavior acceptance.
- Deterministic/UI validation: focused Webview tests and the authoritative visible Electron Text Editor
  scenario pass. The scenario exposed and verified fixes for StrictMode Rich initialization, Vite
  first-import dependency reload and stale toolbar-index automation.
- Real cases and reports: reuse the provider-backed and visible Desktop cases from
  `add-ai-screenplay-authoring`; do not create a renderer-quality Judge or a second Agent suite.
- Deterministic results: `@neko/markdown` passes 45 tests, Text Editor passes 29 tests including
  StrictMode/CJK/CSP/outline/reference/long-document coverage, and Agent Webview passes 90 files / 698
  tests after the turn-level projection change.
  Text Editor also proves that an intermediate Rich acknowledgement cannot replace newer local input,
  one accepted trailing paragraph break remains visible after a single Enter, successive commands use
  the accepted edit sequence, rejection reconciles to accepted source, and Source receives the final
  accepted Rich content.
  The narrowed Streamdown 2.5.0 rerun passes base GFM/CJK, incomplete-suffix visibility, stable blocks
  and hostile input, but fails owner-aware Workspace resource projection, so no production replacement
  occurred.
- Active-output addendum: Agent Webview now passes 90 files / 704 tests. Scheduler tests prove the
  first source is parsed immediately, repeated append patches share one pending browser callback, every
  byte reaches the next normalized snapshot, finalization cancels that callback and converges
  synchronously, and authoritative removal cannot leave a callback alive. Composer tests prove focus,
  plain-text queue and Stop remain available during a run while unsupported queued attachments stay
  disabled with an explicit reason. Desktop focused tests pass 67 assertions and prove sidebar pending
  state does not change unrelated Workbench layout-control availability.
- Visible Desktop result: `desktop-text-editor` passed through Resource Browser open, Markdown
  Rich-by-default/Source/Split, source-backed outline, canonical save, JSON diagnostic/format,
  declared HTML and Fountain highlighting, Fountain outline/preview, dirty conflict and 960 x 640
  compact layout. Source, Rich and Split remained icon-only in the active Workbench tab row; Split
  kept editable CodeMirror on the left and read-only Milkdown on the right at both wide and compact
  widths. Standalone Rich input remained focused and editable without a page-sized focus frame, then
  projected the same accepted text into Source. Incomplete Markdown remained visible in both panes without a document-level failure.
  Contextual commands did not overlap Window controls. Dark-theme rendering and Chromium/Electron
  IME composition also passed with the saved UTF-8 bytes verified. The reviewed report is
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T04-53-06.920Z-desktop-text-editor-development/report.json`.
- Focused single-Enter evidence: a later visible Electron run used one native Enter key event after a
  clean Rich save, observed the next accepted dirty state, retained two ProseMirror paragraphs with an
  empty trailing paragraph and visible caret, and projected the accepted `\n\n` bytes into Source. The
  `markdown-rich-single-enter` checkpoint and screenshot are in
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T05-13-20.913Z-desktop-text-editor-development/report.json`. That full run remains failed because the
  later adjacent Project Resources region-control recovery did not become visible; two retries were
  additionally blocked before React Root mount while reusing the already-running canonical Vite server.
- Blocked or unexecuted cases: `~/.neko/config.toml` is readable, but
  `OPENNEKO_AGENT_EVAL_PROVIDER_ID`, `OPENNEKO_AGENT_EVAL_MODEL_ID` and
  `OPENNEKO_AGENT_EVAL_COST_APPROVED` are unset. The real-provider visible/hidden case is therefore
  `infrastructure-blocked` before Desktop/API execution. Visible Agent partial-to-final continuity is
  also blocked by stale adjacent Desktop functional assertions described in `validation.md`; no mock
  or direct runtime result is substituted. The native macOS IME candidate window was not manually
  exercised.
- The 2026-08-10 active-output visible attempt is fail-visible before the CDP target: the development
  launcher forwards `--openneko-functional-fixture` to a command that rejects it as an unknown option.
  The failed report is
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T19-32-31.061Z-desktop-conversation-navigation-development/report.json`; it contains no checkpoints or
  screenshots and is not counted as visual acceptance.

## Interpretation

- A Streamdown README claim, static screenshot or final answer cannot prove incomplete-stream behavior,
  unique renderer ownership, security or no-fallback behavior.
- A passing native-file Agent case proves Tool/path selection and durable artifact publication, not
  Milkdown or Streamdown rendering quality.

## Verification Commands

- `pnpm --filter @neko/markdown test`
- `pnpm --filter @neko/text-editor-webview test`
- `pnpm --filter @neko/text-editor-webview build`
- `pnpm --filter @neko/agent-webview test`
- `pnpm --filter @neko/agent-webview build`
- `pnpm --filter @neko/app-desktop test`
- `pnpm --filter @neko/app-desktop typecheck`
- `pnpm --dir apps/neko-desktop exec vite build --config vite.renderer.config.ts`
- `pnpm test:agent:eval`
- `pnpm test:local:ui --scenario desktop-text-editor`
- `pnpm check:quality`
- 2026-08-10 focused result: Agent Webview build and 90 files / 698 tests pass; Agent Evaluation
  key-free validation passes 44 files / 294 tests and all 24 suites / 64 cases.
- 2026-08-10 active-output result: Agent Webview build and 90 files / 704 tests pass; Desktop focused
  tests pass 67 assertions; Desktop and Agent Webview typechecks pass; Agent Evaluation again passes
  44 files / 294 tests and all 24 suites / 64 dry-run cases.
- 2026-08-10 reopened-turn result: the focused history projector passes 7 tests and Agent Webview
  passes 90 files / 705 tests. The projector reconstructs a persisted `ReadDocument` -> `ReadImage`
  -> terminal-answer turn as one ordered assistant message; Webview coverage proves one activity
  disclosure precedes the final answer and typed document thumbnails remain process evidence. The
  focused MCP client passes 4 tests; its cancellation case can exceed the fixed 2-second startup
  timeout only inside the 116-file Runtime run, where the other 1111 tests pass.
- 2026-08-10 Turn-timing result: Agent Contracts pass 42 files / 273 tests; Agent Runtime passes 116
  files / 1113 tests plus the added strict timing-parser/projector focus at 4 files / 29 tests; Agent
  Webview passes 90 files / 710 tests; all three affected typechecks pass.
  The runtime checkpoint test proves the timing custom entry is ordered after its exact user message
  and before assistant content without entering model context. Webview coverage proves `Processed 2m
  28s` is calculated from Turn timing even when two Tool durations overlap, secondary counts appear
  only after expansion, activity order is unchanged and ReadImage pages remain evidence.
- `pnpm check:agent-boundaries`, `pnpm check:application-boundaries`,
  `pnpm check:package-boundaries`, `pnpm check:webview-boundaries`, `pnpm check:strict-agent`,
  `pnpm check:legacy-debt` and strict OpenSpec validation pass. `pnpm check:unused` is currently blocked
  by the unrelated untracked `scripts/automation-runtime-cua-node-rebuilder.mjs` and the concurrently
  modified Canvas export `NODE_DEFAULT_SIZES`; 82 configuration hints remain non-blocking.
- `pnpm smoke:webview` is blocked by the existing smoke contract: it requires an Agent `dist`
  directory, while the canonical Agent Webview `build` script is `tsc --noEmit`. The direct Agent
  Webview build passes.
- The full Desktop suite currently has four unrelated failures in the in-progress Canvas generation
  model catalog/runtime and Settings copy assertions. The owning active-output Desktop files pass their
  focused 67-test run, and the Desktop typecheck passes.

## Residual Risk

- Production Agent code intentionally retains the package-local renderer. Streamdown is a dev-only
  rejected candidate and must not be described as delivered Agent UI.
- Milkdown deterministic and visible Desktop evidence passes in light and dark themes, including
  compact-window, Chromium/Electron IME composition and external-change interaction. The native macOS
  IME candidate window and real provider-backed Agent file-publication path remain unverified.
- Agent turn presentation is deterministically verified, but visible completed/expanded/dark/narrow
  transcript evidence remains blocked by stale adjacent Desktop functional assertions. This is a UI
  evidence gap, not a substituted pass.
- Active streaming focus, typing and simultaneous layout manipulation remain visually unverified because
  the current development launcher fails before Electron exposes its CDP target. Deterministic browser
  scheduling and DOM enabled-state tests are retained as lower-layer evidence only.
- Reopened-turn visible parity remains unverified for the same launcher defect. The latest attempt is
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T19-50-57.369Z-desktop-conversation-navigation-development/report.json`.
- Turn-timing and thumbnail visual acceptance remains blocked: the canonical development Desktop is
  currently owned by an active Electron session, and provider/model/cost authorization remains unset.
  Deterministic DOM checks are retained as lower-layer evidence and are not reported as visible
  Desktop acceptance.
- The affected Agent/Webview/OpenSpec/application/package boundary and strict TypeScript gates pass.
  Repository-wide unused-code acceptance remains blocked only by the unrelated Automation/Canvas
  findings recorded above; those files are outside this change and remain untouched.
