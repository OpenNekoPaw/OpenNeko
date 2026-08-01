## Evaluation Scope

- Change/feature: Agent Tool result/attachment 的 `ContentLocator` 到 Desktop Webview 临时
  `openneko://resource` `renderUri` 投影，以及该投影不得替代 locator 或回流 Pi、provider、
  后续 Tool 文件参数。
- Decision and owning suite: `update` `agent-runtime.stream-delivery`。该 suite 已拥有 Pi Tool
  result、shared Timeline projection、conversation projection store 与终态 Webview delivery；
  不新增第二个 Agent/resource suite。
- Why real Evaluation is required: 生产变更会触及 Desktop Agent event/display projection。最终
  DOM 播放只能由真实 Electron 功能场景验收，但 provider-backed case 仍需证明真实 Tool result
  的 locator continuity 未被临时 URL 或 representation/domain identity 替换，并且 legacy
  event projector 未参与。
- Canonical path: Desktop Agent input queue → Pi locator-backed Tool result → shared
  Timeline/conversation projection → message resource display projector → owning Host adapter
  resolves and authorizes bytes → Desktop exact-resource registry / OpenNeko handler →
  package-owned Agent audio/video
  card。
- Forbidden fallback: `file:`、`neko-media:`、absolute-path-only attachment、recent resource
  fallback、`ResourceRef`、path-to-locator inference、persisted runtime URL、provider fetching
  OpenNeko/loopback display URL、loopback HTTP、direct Pi conversation mutation 和 legacy Agent
  event projector。

## Cases

- Update/create one focused regression case inside `agent-runtime.stream-delivery` using an isolated
  synthetic workspace media attachment. The positive case SHALL observe the validated Tool result
  `ContentLocator`, completed Timeline projection, redacted `openneko-resource` display projection fact
  and terminal idle state.
- Add one boundary/failure case only if the existing scenario contract can express a denied display
  projection without weakening strict schemas. It SHALL preserve the locator-backed Tool diagnostic
  while proving that no `file:`, `neko-media:`, inferred-path or unrelated fallback URL is emitted.
- Deterministic producer/consumer tests remain authoritative for URL/token non-persistence,
  PathAccessPolicy, provider materialization, native media-card `src`, CORS and DOM/network details.
  A model final answer cannot prove those transport invariants.
- Minimal missing observability: the current runtime facts do not expose a redacted distinction
  between validated `ContentLocator` identity and ephemeral Desktop display transport.
  Implementation MAY add one neutral bounded fact containing projection kind/status and locator
  kind, while representation/domain identity remains in its owning field; the fact MUST NOT expose
  the URL, port, token, suite/case or pass/fail state.

## Verification

- Key-free validation: run `pnpm test:agent:eval` and the focused indexed case dry-run after updating
  the suite/coverage index.
- Real case: run the same focused case through the Desktop-owned complete-session driver with report
  under gitignored `reports/agent-eval/` after an operator explicitly approves the exact provider,
  model, credential environment and cost.
- Current infrastructure blocker: the fixture-only sender-bound complete-session driver and the
  `locator-backed-display-projection` Electron sample path now exist, but this run has no explicit
  provider/model/credential-environment/cost authorization. The focused command therefore returns
  `infrastructure-blocked` before Desktop launch; key-free validation, direct turn injection or mock
  output is not acceptance.
- Real Electron media-card rendering, Range request and legacy-path poison evidence belongs to the
  isolated Desktop functional scenario, not to a Judge.

## Historical HTTP Spike (Non-Canonical)

以下 2026-08-01 结果只证明当时 Electron/Chromium 对 loopback HTTP 的媒体、Range、Canvas
和 WebGL 可行性。production HTTP launcher、server、CSP/CORS/PNA 和 URL contract 已删除；
这些报告不能证明当前 OpenNeko handler、sender binding、resource lifecycle 或 package-owned
consumer 已通过，也不能作为恢复 HTTP fallback 的依据。

- Scenario: `desktop-http-media-qualification`
- Command: `pnpm test:local:media-http`
- Target: `darwin-arm64`, Electron `43.2.0`, Chromium `150.0.7871.129`
- Result: passed on 2026-08-01. The synthetic H.264 fixture reported 3.0 s metadata, 35 ms seek,
  changing non-tainted Canvas pixels and changing first/repeated WebGL2 texture pixels. Native WAV
  playback advanced after seek. A direct request returned exact SHA-256, a byte Range returned
  `206` plus exposed `Content-Range`/`Accept-Ranges`, and the 32 MiB read measured 260.6 MiB/s.
- Lifecycle: all four exact-resource URLs returned `404` after release; renderer console was empty.
- Color interpretation: Main10 HEVC BT.2020/PQ transport, changing-frame decode and changing texture
  pixels were measured separately. Display output remains `not-qualified`, zero-copy remains
  `not-measured`, and the report does not claim either from HTTP/media/texture success.
- Raw report: gitignored
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-01T03-30-47-700Z-development/report.json`.
- Packaged `darwin-arm64`: `pnpm package:desktop` and
  `pnpm test:local:media-http:packaged` passed on 2026-08-01 with
  `runtime.packaged=true`. The packaged report recorded 30.8 ms H.264 seek, 477.6 MiB/s for the
  32 MiB read, exact `206` Range headers, four post-release `404` responses and no renderer console
  messages. Raw report:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-01T03-36-13-828Z-packaged/report.json`.
- Windows: the native `win32-x64` workflow remains the build/typecheck/package baseline. Graphical
  Windows HTTP/CSP/PNA, media, GPU, texture and display qualification remains Phase 2 and cannot be
  inferred from this macOS report or a cross-platform workflow definition.
- This historical scenario qualified only the then-current HTTP transport/browser/GPU primitive.
  It does not replace the current OpenNeko or package-owned Cut, Canvas, Preview and Agent matrices.

## Path-Only Canvas Degradation Evidence

- Current-version NKC codec and validator regressions prove that normalized workspace-relative
  path-only Media/File nodes remain unchanged, retain their connections, emit a missing-locator
  warning and do not produce a migration result or inferred `ContentLocator`.
- Desktop Canvas runtime regression uses an isolated synthetic workspace to prove the document
  opens, material actions remain empty, Preview authorization is never called and a normal save
  preserves the missing locator rather than migrating it.
- Canvas Webview regression and a local read-only development Electron observation prove the editor
  surface renders the explicit `内容失效` state instead of the document-level
  `canvas-runtime-effect-failed` surface. No user workspace content or screenshot is retained as
  qualification evidence; release-level Canvas media playback remains owned by task 5.5.
- A concurrent-resolution regression advances the Host revision by moving a selected path-only
  media node while its prior material-action request is in flight. The Webview Host retries once
  against the latest snapshot, returns no content actions and emits no `canvas.loadFailed`.
- Local development Electron verification moved the visible content-unavailable node after the
  fix: Undo became available while the Canvas and node-level diagnostic remained mounted. The
  document file modification time remained unchanged because the verification did not save.

## Interpretation

- Passing current deterministic and Electron tests proves OpenNeko transport correctness; passing
  the real Agent case proves the locator-backed Tool/Timeline projection path survived the display
  change without URL identity, `ResourceRef` or path inference.
- No Judge, baseline or output-quality score applies. This is a deterministic identity, routing and
  no-fallback behavior.

## Current OpenNeko Verification

- Passed: strict OpenSpec validation.
- Passed: focused Desktop protocol, exact-resource registry, CSP, Canvas, Preview and Agent display
  projection tests; Desktop typecheck.
- Passed: `@neko/media` 61 tests/typecheck, Cut Node typecheck, Preview contract tests/typecheck,
  Assets quick-preview contract/root tests/typecheck, Agent URL-policy tests/typecheck and focused
  Canvas/Shared persistence tests.
- Passed: `pnpm test:local:media-openneko` on 2026-08-01 using Electron `43.2.0`, Chromium
  `150.0.7871.129`, Node `24.18.0`, FFmpeg `8.1.2`, `darwin-arm64`, `runtime.packaged=false`.
  The isolated synthetic scenario observed:
  - native H.264 and WAV duration `2 s`, advancing playback clocks and exact seeks to `1.2 s` /
    `1.0 s`;
  - changing Canvas hashes and changing first/repeated WebGL2 texture hashes;
  - exact H.264 SHA-256 and `206 bytes 0-63/18287` with `Accept-Ranges: bytes`;
  - PNG pixels, `%PDF-`, GLB `glTF` header and frozen external glTF dependency `01020304`;
  - denial when a second WebContents copied the URL;
  - exactly one producer termination for both PCM client cancellation and owner cancellation;
  - stale URL denial after Renderer reload and `404` after Window close.
- Passed: launcher contract and local-only orchestration tests prove the qualification uses an
  isolated temporary root and is unreachable from remote CI gates.
- Raw OpenNeko report: gitignored
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-01T09-30-36.286Z-openneko/report.json`.
- Passed: `pnpm build` and explicit `pnpm package:desktop` generated the
  `OpenNeko-darwin-arm64/OpenNeko.app` package. The Desktop platform contract keeps native
  `darwin-arm64` and `win32-x64` typecheck/package jobs and rejects unsupported targets; the
  Windows package itself was not executable on this macOS host.
- Final stable-worktree reruns passed `pnpm build`, `pnpm test`, `pnpm check`,
  `pnpm check:quality`, `pnpm check:legacy-debt`, `pnpm check:unused` and
  `pnpm test:agent:eval`. Agent Evaluation reported 37 files / 245 tests and all 22 suites / 51
  key-free dry-run cases. The repository-wide Desktop result was 77 files / 454 tests.
- The previously failing Global Library style assertion was a stale compact-layout expectation from
  before the package-owned aligned management layout. Its test now protects the current width,
  spacing, control size and loading-state contract; the focused regression and final full test pass.
- Passed: package-owned Cut, Canvas and Preview real Electron matrices in both development and the
  freshly rebuilt `darwin-arm64` package. The Agent fixture-only complete-session path is implemented;
  the provider-backed execution remains blocked only on explicit provider/model/credential/cost
  authorization. Generic native-element qualification and direct turn injection are not counted as
  Agent acceptance.
- The final `darwin-arm64` package exposed a sandbox-preload regression before acceptance: the new
  Agent facts result parser imported host-only `node:crypto`, so Electron could not project
  `window.openNekoDesktop` and the renderer failed while reading `bootstrap`. The facts contract now
  performs a pure structural parse in preload while Main retains authoritative SHA-256 validation;
  the preload build fails if any `require("node:*")` appears. The rebuilt package and all three
  package-owned matrices pass.

## Residual Risk

- Until the exact provider, model, credential environment and cost are explicitly authorized, real
  provider-backed Agent projection evidence remains blocked even though the complete-session driver
  and package-owned scenario path are available.
- The separate Desktop Agent evaluation-matrix change still owns reload/reconnect, application
  restart, multi-worker isolation and full repeated-matrix orchestration. Those broader driver
  controls are not claimed by this single authorized Tool-result display scenario.
- Native Windows typecheck/package and graphical media/GPU qualification were not run on this
  `darwin-arm64` host. The workflow contract was validated, but Windows runtime behavior remains
  Phase 2.
- HDR display output and zero-copy remain respectively `not-qualified` and `not-measured`.
- Preview matrices can still record two non-fatal Agent handler warnings for broadcast
  `document:statusUpdate` / `document:saveState` messages. They produced no console error, Renderer
  exception, fallback request or media failure, but the Agent message-routing owner should remove
  this warning noise independently of the media change.
- Agent Bash remains outside ordinary product capability. Any future change that grants or reroutes
  shell execution requires its own Tool/permission Evaluation decision rather than reusing this
  display case.

## Package-Owned Desktop Functional Verification (2026-08-01)

- The shared isolated Desktop runner now owns CDP control, trusted pointer actions, console/network
  capture, abortable bounded operations, revoked-exception reconciliation, checkpoints, legacy and
  loopback request poison, redacted reports, process-group cleanup with TERM/KILL escalation, and
  development/packaged launch. Package scenarios continue to own fixtures, user operations and
  domain assertions.
- The final development matrix passed:
  - `cut-openneko-consumer`: 4 OpenNeko requests, 1 PCM response, advancing decoded video and mixed
    PCM, trusted playback/ruler operations, seek across clips, generation replacement and stale URL
    rejection.
  - `canvas-openneko-consumer`: 5 OpenNeko requests, 0 PCM responses, two real Canvas Roots with
    isolated locator-backed native video/audio playback and Host-authoritative View teardown.
  - `preview-openneko-consumer`: 16 OpenNeko requests across image/audio/video/PDF/GLB/glTF; the
    external glTF dependency was requested separately and every Preview session was released.
- The final rebuilt `darwin-arm64` package passed the same Cut/Canvas/Preview matrix with 4, 4 and
  15 OpenNeko requests respectively. All six final reports recorded zero poisoned requests, console
  errors and renderer exceptions. The final packaged reports were written at
  `2026-08-01T15-47-50.476Z`, `2026-08-01T15-47-55.405Z` and
  `2026-08-01T15-47-58.175Z`; raw reports remain gitignored under
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/`.
- The final aggregation re-read the latest passed report for each scenario/target pair and rejected
  missing OpenNeko handler requests, any poisoned request, console error or renderer exception. The
  development counts were Cut `4` / Canvas `5` / Preview `16`; packaged counts were Cut `4` /
  Canvas `4` / Preview `15`. Cut alone recorded the expected one-shot PCM response in each target.
  The Agent entry is the separately retained exact authorization blocker above, not a fabricated
  consumer success.
- The packaged Preview matrix exposed and fixed two production-only defects: the Desktop Preview
  surface had no Workbench height contract, and the OpenNeko desktop asset handler returned the
  pdf.js `.mjs` worker with an invalid binary MIME type. CSP now permits only same-origin workers.
- The Canvas matrix exposed and fixed missing Host reconciliation for removed Canvas Views. AppHost
  now reconciles Canvas alongside Preview and Cut, and Canvas media cleanup remains keyed by exact
  Window/View identity.
- The final development Cut teardown exposed a Main-process crash when a normal resource release
  aborted an active FFmpeg PCM stream. The registry cancellation was correct; the Cut PCM framing
  path had not consumed the source stdout error produced by the aborted process. The Cut adapter now
  follows the existing media-runtime contract: cancellation ends the framed stream, non-cancellation
  errors propagate explicitly and the aborted completion settles without an uncaught exception. A
  focused regression, the rebuilt package matrix and the development matrix all passed afterward.
- Cut's native-video regression also protects element ownership: a superseded client cannot clear a
  newer client's source on the same `<video>` element. The functional scenario samples both
  double-buffer slots by actual playback/generation identity rather than presentation timing.
- Agent remains provider-unqualified. The fixture-only driver now launches the real Desktop, creates
  the conversation through the public renderer/preload bridge, submits through the sender-bound
  controller, waits for terminal idle, reads bounded product facts, asserts the package-owned Agent
  card/OpenNeko request and closes with disposal facts. This run has no explicit provider/model/
  credential-environment/cost authorization, so no Desktop or provider was launched. No credential
  discovery, direct turn injection, fabricated Tool result or mock final answer was used.
- Focused blocker command:
  `node scripts/agent-eval/local-run.mjs --mode focused --suite agent-runtime.stream-delivery --case locator-backed-display-projection --report-root reports/agent-eval/media-agent-6.4.4`.
  It returned `infrastructure-blocked`: `Real Desktop Agent evaluation requires explicit provider,
model, credential environment and cost authorization.` Raw summary remains gitignored at
  `reports/agent-eval/media-agent-6.4.4/local-run-summary.json`.
- Final high-risk quality review classified the change as Desktop IPC/preload, media-runtime and
  release-path risk. It found no remaining actionable defect after the PCM cancellation,
  sandbox-preload and stale Global Library assertion fixes. Deterministic tests, architecture gates,
  the final native package and applicable Electron matrices pass; only the explicitly documented
  provider authorization and platform/measurement residual risks remain.
