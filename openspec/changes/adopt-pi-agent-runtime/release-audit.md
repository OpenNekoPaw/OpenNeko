# Pi runtime release audit

Date: 2026-07-17

This release audit records the post-deletion production bundle and the remaining activation-time blocker. Task 5.5 remains open until a final real Extension Development Host activation measurement can be captured.

## Production Extension measurement

- Build command: `pnpm --dir packages/neko-agent run compile:extension`
- Build result: success; esbuild reported 440 ms and `/usr/bin/time` reported 0.92 s wall time.
- Current uncompressed `packages/neko-agent/dist/extension.js`: 14,348,925 bytes.
- Runtime host: VS Code 1.128.1 on macOS arm64, isolated empty workspace, separate user-data/extensions directories, real Extension Development Host with the declared Engine/Tools/Preview dependencies.
- VS Code `Developer: Show Running Extensions` reported `neko.neko-agent` activation at 167 ms. Engine, Tools, and Preview were activated as real dependency extensions. No browser/Vite surrogate was used.
- The current bundle still includes legacy deletion boundaries covered by tasks 4.1-4.5, so this number is a baseline, not the final acceptance measurement.

### Intermediate media-bridge deletion measurement

- After deleting the generic AI SDK `MediaAdapter` compatibility bridge and cross-extension `internalChat` path, `pnpm --dir packages/neko-agent run compile:extension` completed successfully in 521 ms.
- The uncompressed bundle is now 14,258,715 bytes, 90,210 bytes smaller than the 2026-07-16 baseline (about 0.63%).
- This was a build-size checkpoint only. At that checkpoint tasks 4.1-4.5 were still incomplete, so activation time was intentionally not remeasured.

### Intermediate flat-purpose completion measurement

- After extracting the exact-snapshot `completePiPurposeModel` primitive and registering the retained Canvas/Character/embedding purpose keys, `pnpm --dir packages/neko-agent run compile:extension` completed successfully in 502 ms.
- The uncompressed bundle is 14,259,550 bytes (SHA-256 `3cc7bce7f527e6c6ea5196aa422b8c5faf90bab62d3bbbcf8f75360fb71d1bb1`), 835 bytes above the media-bridge checkpoint and still 89,375 bytes below the 2026-07-16 baseline.
- This helper performs no provider/config lookup and adds no history, registry, credential owner, or fallback. Final activation measurement remains intentionally deferred until tasks 4.1-4.5 complete.

### Intermediate Canvas semantic-port measurement

- The earlier measurement placed Canvas prompt/judge adapters in the Agent extension and is no longer release evidence; the corrected boundary requires owning-domain/application composition outside Agent before final measurement.
- The uncompressed bundle is 14,263,550 bytes (SHA-256 `e7fa08cae180dbc98c0eb380936e16d68d3fcc73cb58fb20a46c624f6b250161`), 4,000 bytes above the prior purpose-helper checkpoint and still 85,375 bytes below the 2026-07-16 baseline.
- Canvas exposes only the semantic `CanvasPromptGenerator` port; provider/model resolution, credentials, Pi context, and token parameters remain outside Canvas but are owned by the neutral application model runtime, not Agent. Final activation measurement remains deferred.

### Intermediate Character and embedding semantic-port measurement

- After migrating Character dialogue/profile and `text.embed` away from Platform chat/service adapters, `pnpm --dir packages/neko-agent run compile:extension` completed successfully in 606 ms.
- The uncompressed bundle is 14,265,345 bytes (SHA-256 `065e54254ac89946ffb32af4e74c45ca4eec396b0d41bc3dbe8dc9434c373439`), 1,795 bytes above the Canvas checkpoint and still 83,580 bytes below the 2026-07-16 baseline.
- Character controllers consume only semantic ports; purpose/model/auth/Pi details remain in owning-domain/application assembly outside Agent. Embedding uses one exact `text.embed` binding and the shared CredentialStore through its domain runtime because Pi 0.80.7 has no embedding protocol. Final activation measurement remains deferred until boundary cleanup completes.

## License

- `@earendil-works/pi-agent-core@0.80.7`: MIT.
- `@earendil-works/pi-ai@0.80.7`: MIT.
- Both resolve from the compatible `^0.80.7` dependency range through the repository lockfile and identify the `earendil-works/pi` repository.

## Post-deletion production measurement

- Final build command: `/usr/bin/time -p pnpm --dir packages/neko-agent run compile:extension`.
- Build result after the workspace-state cleanup: success; esbuild reported 641 ms and `/usr/bin/time` reported 1.17 s wall time.
- Uncompressed `packages/neko-agent/dist/extension.js`: 12,012,505 bytes, SHA-256 `6a06a04bf3e2d6de918c54910fa7a5cebb9bace617c5cbcf9db09bc4c1a72b5e`.
- This is 2,336,420 bytes (about 16.3%) below the 14,348,925-byte baseline.
- Final activation preflight used the required VS Code Extension Debugger workflow. The initial run found no listener. On rerun, port 9222 was owned by a `Code` process, but the endpoint exposed no VS Code workbench `page` target and therefore failed the hard preflight as a non-verifiable VS Code CDP endpoint. The workflow forbids launching, restarting, or reconfiguring VS Code to repair that endpoint, so no browser/Vite surrogate or inferred timing was recorded.
- The earlier real Extension Development Host result of 167 ms remains a baseline only. A post-deletion activation time is the sole incomplete measurement for task 5.5.

### Post-correction provider dispatch measurement

- After correcting exact `topP` projection, registered-purpose filtering, Extension rejection projection, and per-API Pi provider dispatch, `pnpm --dir packages/neko-agent run compile` succeeded for the production Extension and Webview; esbuild reported 559 ms for the Extension bundle.
- Current uncompressed `packages/neko-agent/dist/extension.js`: 12,015,664 bytes, SHA-256 `a9db1ed2dfdf51fb406a57ae70590f58fe988caae8ee6a23664871dcae2c2e3c`.
- This is 3,159 bytes above the prior post-deletion checkpoint and remains 2,333,261 bytes (about 16.26%) below the 14,348,925-byte baseline. The added surface is the exact parameter/provider dispatch and regression handling, not a second provider path or compatibility fallback.
- `pnpm --dir apps/neko-tui build` produced a 4,129,964-byte `dist/main.js` (SHA-256 `e8be6656714fddb34169bab4234a6a2f087f2c777436115c90fc335ac3e02b65`). Running that production bundle with the configured NewAPI provider returned a normal streamed response to `你好` without the reported purpose token-limit, thinking-budget, capability, API-key, or `topP` errors.
- The VS Code debugger hard gate was rerun after this build. Port 9222 is reachable but still exposes no VS Code workbench `page`, so post-correction activation time and packaged Webview conversation remain unmeasured; task 5.5 stays open.
- A later generation-mode regression exposed the Webview still emitting the retired nested `mediaModels` shape. The shared `sendMessage` contract, Webview projection, and Extension router now use only flat purpose keys such as `image.generate`; the parser explicitly rejects both nested generation and understanding fields. Focused shared/Webview/Extension tests pass (32/69/84), and `pnpm --dir packages/neko-agent run compile` succeeds.
- The first real `skill.image` reruns exposed three separate pre-media/TUI Host defects: `read_skill` incorrectly required confirmation in `ask` mode, the non-interactive scenario omitted its supported `auto` setting, and terminal media results were not materialized/queued before idle. `read_skill` is now explicitly confirmation-free; the scenario records `executionMode: auto`; the TUI Host keeps result delivery non-idle, materializes stable output through `NodeMediaTaskDeliveryHost`, and queues one identity-bearing continuation. This remains outside Agent/Canvas and does not add a Skill activation lifecycle.
- The final real run `skill.image/generate-image/image-stable-ref-analysis-20260717` completed in 101,946 ms. `GenerateImage`, the `image_generation` Task, durable artifact `res_quqhzi`, task observation, continuation, Workspace projection, and `ReadImage` all succeeded with no runtime errors or SubAgent participation. The report is still `case-fail` solely because the existing Skill hard gate cannot observe the Pi `read_skill` receipt; this is an explicit Skill Host observability gap, not a generation-path failure. Pi provider idle timeout remains five minutes by default while domain media Tasks keep their separate long budget.
- Current rebuilt production sizes are 12,019,434 bytes for `packages/neko-agent/dist/extension.js` (SHA-256 `3cb883ff3ee9cf7e8db997fc0f48f5420930cd5c63ed657143565c141677ad4b`) and 4,157,502 bytes for `apps/neko-tui/dist/main.js` (SHA-256 `333fa995c0b1f6c1183e51d80aece4216370da90251c369101b5222392317a9b`). Post-deletion VS Code activation remains unmeasured because the required CDP workbench target is still absent.

## Post-deletion quality evidence

- Agent core: 119 files passed, 1 skipped; 1,307 tests passed, 1 skipped.
- Agent Extension: 81 files / 619 tests passed, with 6 intentional skips.
- Agent Webview: 95 files / 775 tests passed.
- Entity: 18 files / 86 tests passed. Canvas domain: 1 file / 16 tests passed. Canvas boundary/layout focused tests passed; the full Canvas Webview run has one unrelated panoramic preview expectation failure.
- `pnpm test:agent:eval`: 40 files / 277 tests passed and all 23 suites / 43 cases dry-ran successfully. This remains key-free evidence, not provider behavior acceptance.
- `openspec validate adopt-pi-agent-runtime --strict` and `pnpm check:agent-boundaries` pass. The Agent boundary scan reports no compatibility exceptions, LCD findings, or code findings.
- `pnpm check:legacy-debt` remains blocked by 194 repository-wide pre-existing findings. `pnpm check:unused` remains blocked by repository-wide unused exports; migration-specific unused/unlisted dependency findings were corrected by removing stale dependencies and declaring the Evaluation runner's Pi dependency at the root.
- Raw package `tsc` checks pass for Agent Webview, Canvas domain/Webview, and Entity. Agent/Extension checks still expose pre-existing stale test fixtures and unrelated production typing debt; the production Agent Extension bundle succeeds.
- Post-correction rerun: Agent core 119 files passed / 1 skipped with 1,308 tests passed / 1 skipped; Agent Extension 82 files passed with 622 tests passed / 6 skipped. Focused TUI config/policy tests pass 18/18 and the complete affected runtime-assembly test passes 9/9.
- Latest rerun: Agent core passes 119 files with 1 skipped and 1,312 tests with 1 skipped; the focused TUI result-delivery/runtime tests pass 31/31; `pnpm test:agent:eval` passes 40 files / 278 tests and all 23 suites / 44 cases dry-run; strict OpenSpec, the 1,304-file Agent boundary scan, production Extension/Webview compile, TUI build, and `git diff --check` pass.
- NewAPI tool-name correction rerun: Agent core passes 119 files / 1 skipped with 1,313 tests / 1 skipped; Agent Extension passes 82 files with 623 tests / 6 skipped; the production Extension/Webview and TUI bundles build, and the rebuilt TUI completes a real `nekoapi-chat/gpt-5.6-luna` `hi` turn. Domain tool names now remain internal identities while the single Pi bridge projects only incompatible names to stable OpenAI-compatible wire names and maps product events back. The trusted indexed runner remains credential-blocked, key-free Evaluation passes 40 files / 278 tests with 23 suites / 44 cases, and VS Code runtime acceptance remains blocked by the missing verified workbench CDP target.
- The complete TUI suite still has 17 unrelated failures. They are stale model/context snapshots, deleted `runtime-bootstrap.ts` and legacy presentation exports, direct-media test isolation, a marketplace command result, and an old workspace fixture without explicit Pi protocol/token facts. Raw TUI and Extension `tsc` are likewise blocked by existing unrelated type debt. Both production bundles succeed, and the real indexed image path now reaches stable delivery and visual analysis.

## Credential and OAuth boundary

- One program-level `OpenNekoCredentialStore` owns provider credentials. Persisted entries retain credential provenance; status/evaluation facts expose only type, provenance, timestamps, expiry, and a fingerprint.
- TUI/VS Code policy resolution supplies an exact provider credential. Generic CLI/environment credentials are scoped to `agent.main`; another purpose provider must own its credential. Conflicting same-provider credential projections fail visibly.
- Built-in OAuth login/refresh/logout delegates to the Pi Provider auth contract. VS Code `AuthInteraction` uses cancellable secret inputs, quick picks, external auth/device-code URLs, and removes/disposes cancellation listeners.
- Arbitrary custom OAuth endpoints remain intentionally unsupported in the first release. Callback server/port ownership, when a built-in provider needs it, remains inside Pi; OpenNeko does not create a second callback listener or port allocator.
- Residual OAuth acceptance risk: no live provider OAuth round trip was executed in this pass. Callback-port collision, browser return, refresh revocation, and network cancellation still require provider-backed release testing.

## Path and secret disclosure boundary

- Pi Session receives only the contained virtual workspace locator `/__neko_workspaces/<id>`; Evaluation hard gates reject traversal or a physical workspace path.
- Skill locators are process-local and fingerprint-addressed; containment tests reject `..` and symlink escape. They are not Evaluation or persisted product facts.
- Pi workspace and Skill locators are namespace identities, not derived-storage paths. Any ResourceCache implementation and materialized path remain private to the Host content/representation layer and are never substituted into either virtual namespace or projected to Pi.
- Extension document readers resolve ordinary workspace-relative paths, including `neko/assets/<libraryName>/...` links followed by the OS, only inside the Node `@neko/content` low-level boundary. Media-library `${VAR}` inputs are migration-only under `adopt-workspace-linked-media-libraries`; there is no Agent-visible target map or media-library resolver. The physical reader does not recognize Pi workspace locators or Skill locators.
- Effective TUI configuration and Pi runtime facts contain configured/wire model identities, protocol/auth mechanism, provenance, and digests, but no API key, authorization header, endpoint containing credentials, physical Skill path, or cache handle.
- The Extension runtime check used an isolated empty workspace. No screenshot or raw runtime report containing user configuration was retained.

## Legacy workspace-state cleanup

- A real VS Code workspace database reproduced the warning with a 5,210,809-byte `neko.neko-agent` memento. Its top-level `conversations` value alone occupied 5,207,035 bytes and contained the retired full-message projection; two consecutive read-only measurements produced the same result.
- Current production search found no writer or reader for that transcript value. `ConversationBridge` no longer receives `workspaceState`, and activation now deletes only the obsolete top-level `conversations` key under the accepted prelaunch discard policy. It does not inspect, import, migrate, or restore the discarded transcript and preserves current tab and per-conversation setting projections.
- The cleanup is idempotent and covered by a focused regression test. The complete Extension suite passes 81 files / 619 tests, and the Agent boundary scan passes 1,300 checked files with no compatibility, LCD, or code findings.
- A real post-fix activation is still required to prove the existing workspace memento is removed by the packaged Extension and to capture the activation time. The CDP hard gate currently reaches the `Code` listener on port 9222 but finds no VS Code workbench `page` target.

## Remaining final rerun

The post-deletion production bundle/build and the license, credential/OAuth, and path-disclosure audits are recorded above. Only the real post-deletion Extension Development Host activation measurement remains. Task 5.5 may close after an already-running VS Code instance exposes a verified workbench CDP endpoint on port 9222 and the activation measurement succeeds; the documented absence of a trusted provider credential environment remains the explicit blocker for live OAuth acceptance rather than a reason to invent fallback evidence.
