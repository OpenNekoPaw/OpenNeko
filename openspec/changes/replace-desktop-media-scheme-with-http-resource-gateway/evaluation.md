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
- Real case: run the same focused case through the Desktop-owned complete-session driver when it
  exists, with report under gitignored `reports/agent-eval/`.
- Current infrastructure blocker: repository documentation states that Desktop does not yet expose
  a complete-session Evaluation driver. Until that exists, the provider-backed case MUST be recorded
  as `infrastructure-blocked`; key-free validation, direct turn injection or mock output is not
  acceptance.
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
- Passed: `pnpm check`, `pnpm check:quality`, `pnpm check:legacy-debt`,
  `pnpm check:unused` and `pnpm test:agent:eval`. The Agent gate passed 35 files / 237 tests and
  all 22 suites / 51 key-free dry-run cases.
- Blocked outside this transport primitive: package-owned Cut/Canvas/Preview/Agent real Electron
  functional matrices have no current automated Desktop complete-session fixture. Generic native
  element qualification is not counted as those package-owned scenarios.
- Repository-wide `pnpm test` ran and failed only
  `apps/neko-desktop/src/renderer-styles.test.ts:119`, where the concurrent Global Library UI
  change removed the old header padding expected by the test. The media-focused Desktop matrix
  passed 12 files / 106 tests, and the full Desktop run passed the other 427 tests.
- The known repository-wide Desktop renderer-style failure concerns the concurrent Global Library
  header CSS working-tree change and is not counted as media evidence.

## Residual Risk

- Until a Desktop complete-session driver is available, real provider-backed Agent projection
  evidence remains blocked even if all deterministic and Electron media scenarios pass.
- Native Windows typecheck/package and graphical media/GPU qualification were not run on this
  `darwin-arm64` host. The workflow contract was validated, but Windows runtime behavior remains
  Phase 2.
- HDR display output and zero-copy remain respectively `not-qualified` and `not-measured`.
- Agent Bash remains outside ordinary product capability. Any future change that grants or reroutes
  shell execution requires its own Tool/permission Evaluation decision rather than reusing this
  display case.
