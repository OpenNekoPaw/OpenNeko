## Verification

Date: 2026-07-25

### Generated-output projection activation isolation

- Scenario: reload the staged `Debug Dev (All)` Extension Development Host against the synthetic
  `neko-test` workspace containing 24 rejected generated-output projection rows.
- Host result: Suite activation completed. VS Code displayed one aggregated migration warning and no
  new `Activating extension 'neko.neko-suite' failed` notification.
- Diagnostic result: the warning reported the rejected row count, showed at most three sample
  resource IDs, and stated that generated files were preserved.
- Embedded Agent result: the OpenNeko Agent Webview mounted with its mode, model, input, and approval
  controls. This proves the embedded feature reused the Host-owned generated-asset catalog instead of
  opening a second rejecting LocalMetadata binding.
- Canvas result: `NekoCanvas: New Canvas` opened a Canvas editor with the toolbar, empty state, and
  `0 nodes | 0 connections` projection in the same activation cycle.
- CDP result: target discovery found the Agent and Canvas Webview iframes. DOM snapshots confirmed
  both applications mounted. Their consoles contained only VS Code's known benign
  `local-network-access` container warning and no Neko activation, CSP, or resource error.
- User-data result: the representative generated PNG retained its pre-run byte length and SHA-256;
  the representative rejected SQLite row retained its pre-run JSON length and SHA3 digest. No
  generated file or rejected metadata row was rewritten.

Commands:

```bash
node --experimental-strip-types --test apps/neko-vscode/src/ai-host-runtime.test.ts
pnpm exec vitest run \
  packages/neko-agent/packages/platform/src/media/__tests__/generated-asset-index.test.ts \
  packages/neko-agent/packages/extension/src/host-generated-asset-catalog.test.ts
pnpm build:vscode:dev
pnpm smoke:vscode:targets -- --skill vscode-extension-debugger --require-webview
node .codex/skills/vscode-extension-debugger/scripts/cdp-client.js snapshot <agent-target>
node .codex/skills/vscode-extension-debugger/scripts/cdp-client.js snapshot <canvas-target>
node .codex/skills/vscode-extension-debugger/scripts/cdp-client.js console <agent-target>
node .codex/skills/vscode-extension-debugger/scripts/cdp-client.js console <canvas-target>
```

Focused results:

- Host composition and rejection-isolation tests: 5 passed.
- Projection-store and embedded-catalog tests: 13 passed.
- Staged Suite build: passed; 7 features staged.
- VS Code target discovery: 2 page targets, 2 Webview targets, and 1 worker target.

### Repository gates

Commands:

```bash
openspec validate unify-cross-package-content-locators --strict
node scripts/check-legacy-debt-surfaces.mjs --self-test
pnpm check:legacy-debt
pnpm check:legacy-debt:ledger
pnpm build
pnpm test
pnpm check
git diff --check
```

Results:

- OpenSpec strict validation: passed.
- Legacy-debt scanner self-test: 21 cases passed.
- Legacy-debt quality gate: passed with zero non-Agent blocking occurrences.
- Legacy-debt ledger validation: passed with one pre-existing missing-match warning for
  `REQ-LCDR-028`.
- Repository build: passed.
- Repository tests: 28/28 Turbo tasks passed.
- Repository check: passed with no dependency violations; Knip reported 95 existing configuration
  hints.
- Diff whitespace validation: passed.

### Workspace Board locator delivery

- Date: 2026-07-25
- Host: VS Code 1.130.0 arm64, composed `neko.neko-suite` development stage.
- Configuration: canonical `Debug Dev (All)` against the synthetic `neko-test` workspace.
- Lane: `vscode-extension-debugger` Host UI / black box through Computer Use. No ordinary browser,
  Vite, Chrome, or Playwright acceptance was used.
- The first focused run exposed that the initial Canvas load path normalized the same object later
  retained as the authoritative open-document snapshot. A subsequent Board delivery therefore
  observed panel-scoped runtime state instead of the durable locator-only document.
- The fix now retains the loaded and Host-applied `CanvasData` as the authoritative snapshot,
  projects a structured clone for each Webview panel, and waits for that display projection before
  the Host-applied update returns.
- The formal development acceptance command returned `status: projected`, writer epoch `5`, no
  diagnostics, and node `workspace-content-41dubd` for the generated-output locator.
- Without reopening the editor, the visible Board changed to six nodes. After Fit Content, the new
  node title `Locator immediate projection acceptance fixed` and an accessible `image preview`
  were both present.
- After closing and reopening `workspace.nkc`, a fresh Canvas Webview initially culled the
  off-screen nodes. Fit Content then exposed the same node and accessible image preview, proving a
  fresh Host projection rather than reuse of the previous panel URI.
- The persisted node contains one generated-output `contentLocator` with output ID, revision,
  digest, and `neko/generated/image/...` path. It contains no `runtimeAssetPath`,
  `runtimeThumbnailPath`, Webview/resource/data URI, or `resourceRef`.
- The latest Neko Canvas log contains no locator projection or Host-applied delivery warning. Its
  remaining preview warnings belong to three older fixture nodes that still carry pre-migration
  ResourceRefs and are not used as canonical-path evidence.

Commands:

```bash
pnpm --dir packages/neko-canvas exec vitest run \
  packages/extension/src/services/canvasProjectAuthoringService.test.ts \
  packages/extension/src/__tests__/protocol.test.ts
pnpm --dir packages/neko-canvas compile
pnpm smoke:webview:targets
git diff --check
```

Focused results:

- Canvas authoring/protocol regression tests: 86 passed.
- Canvas Extension and Webview compile: passed.
- Host UI immediate projection and close/reopen scenario: passed.
- The initial Webview target preflight was blocked with `ECONNREFUSED 127.0.0.1:9222`.
  A later isolated-profile Agent run supplied the verified CDP lane described below; the Board
  save/reopen result remains Host UI black-box evidence.

The canonical `.vscode/launch.json` remains unchanged. Its owning regression explicitly rejects
process-scoped `--remote-debugging-port` and `--user-data-dir` arguments on the window-scoped
`extensionHost` configuration. The later CDP-enabled run used a disposable VS Code profile and
explicit process launch outside the canonical development configuration.

### Configured-provider Agent locator handoff

- Task 6.3 is complete. The configured-provider
  `agent-runtime.workflow-controller/media-tool-terminal-result` run
  `p0-locator-handoff-pass-20260725` passed every hard gate. `GenerateImage` produced a valid
  generated-output ContentLocator, `ReadImage` consumed the same locator in the same turn, and the
  run reached terminal idle without ResourceRef, AssetLibrary, SubAgent, generic TaskManager, or
  task-continuation participation.
- The first focused diagnostic reproduced the prior timeout as a product defect rather than a
  provider or Job failure: the first approved `GenerateImage` wrote a valid generated output, but
  Pi attachment projection rejected the locator-only result with
  `Pi image Tool result requires a stable attachment assetRef.` The model then retried
  `GenerateImage`, entered a second approval wait, and never reached idle.
- Pi attachment projection now validates the canonical locator and derives only an operation-scoped
  Host loader input. A generated-output locator uses its existing `outputId` as semantic identity;
  the Host loader reads bytes through `contentLocator`, and no ResourceRef or generated-asset index
  fallback participates. The regression failed before this change and now passes.

Commands:

```bash
pnpm --dir packages/neko-agent/packages/agent exec vitest run \
  src/pi/__tests__/openneko-tool.test.ts
pnpm exec vitest run \
  scripts/agent-eval/suites/agent-runtime/workflow-controller/media-tool-terminal-result.test.mjs
node scripts/agent-eval/protocol-smoke.mjs \
  --suite agent-runtime.workflow-controller \
  --case media-tool-terminal-result \
  --run-id p0-locator-handoff-pass-20260725
pnpm --dir packages/neko-agent/packages/webview exec vitest run \
  src/components/ChatView/ToolCallDisplay/ToolCallDisplay.test.tsx \
  src/presenters/__tests__/tool-call-presenter.test.ts
pnpm build:vscode:dev
```

Focused results:

- Pi Tool projection: 22 passed.
- Evaluation scenario contract: 1 passed; focused dry-run passed.
- Real configured-provider Agent evaluation: passed, 13/13 hard gates, 3 successful Tool calls,
  zero Tool failures, generated-output and ReadImage artifacts validated.

### Agent Generation Webview card and result

- Date: 2026-07-25.
- Host: VS Code 1.130.0 arm64, composed `neko.neko-suite` development stage.
- Configuration: disposable VS Code profile and extension directory against the synthetic
  `neko-test` workspace. The repository `.vscode/launch.json` was not changed.
- Lane: `vscode-extension-debugger` CDP inspection of the real Extension Development Host Agent
  iframe. No ordinary browser, Vite, Chrome page, or Playwright acceptance was used.
- The first real card inspection exposed a presenter contract defect: one generated image
  `renderUri` was collected into the image, video, and audio arrays because all three URL validators
  accept authorized Webview URIs. The card therefore mounted one image, one empty video, and one
  empty audio element.
- The fix classifies the Generation Tool kind at the presenter boundary. `GenerateImage` can now
  populate only `imageUrls`; it does not rely on component-level MIME guessing, hidden controls, or
  fallback rendering. Presenter and component regressions reproduced the three-way projection
  before the fix and pass afterward.
- Real terminal Job `09ca8b72-6f33-4973-b3fe-3d275224e3b1` reached revision `r5`, phase
  `succeeded`, using model `nekoapi-media/gpt-image-2`.
- The final iframe contained exactly one Generation card, one image, zero video elements, zero
  audio elements, no approval buttons, and a completed state. The loaded image had intrinsic size
  `1827x861`.
- The React projection contained `toolName: GenerateImage`, one panel-scoped Webview URI in
  `imageUrls`, and empty `videoUrls` and `audioUrls`.
- The committed file is
  `neko/generated/image/09ca8b72-6f33-4973-b3fe-3d275224e3b1_0.png`, is a valid `1827x861` PNG,
  and has SHA-256
  `8ea134d406317c18ccf64e15647fd166041f604faed0de5e7baef8ede8145b65`.
- The card displayed the original Chinese prompt, Job revision, completed state, final image, and
  Board delivery status. Direct image mode invoked the configured image model without an approval
  card or repeated approval.
- The Agent iframe console contained only VS Code's known benign
  `Unrecognized feature: 'local-network-access'` warning. It contained no Agent CSP, resource,
  message, locator, or service-worker error.
- Sanitized screenshot evidence: `/tmp/openneko-agent-generation-p0-final.png`.

Commands:

```bash
pnpm --dir packages/neko-agent/packages/webview exec vitest run \
  src/components/ChatView/ToolCallDisplay/ToolCallDisplay.test.tsx \
  src/presenters/__tests__/tool-call-presenter.test.ts
pnpm build:vscode:dev
pnpm smoke:webview:targets
node .codex/skills/vscode-extension-debugger/scripts/cdp-client.js snapshot <agent-target>
node .codex/skills/vscode-extension-debugger/scripts/cdp-client.js console <agent-target>
```

Focused results:

- Generation card presenter/component: 16 passed.
- Composed staged Suite build: passed; 7 features staged.
- VS Code target discovery: passed with 1 page target and 2 Webview targets.
- Real Generation card/result DOM, React projection, media load, and iframe console assertions:
  passed.

### Residual risk

- Direct image-mode history entries show `0 messages` after an Extension Host restart and therefore
  cannot replay the completed card. This is a separate conversation-persistence gap; it does not
  invalidate the live locator projection or Task 6.4 and requires its own owner/change.
- The final card's Board delivery projection remained `queued` while the UI copy said
  `Saved locally and to Board`. Board immediate projection and save/reopen were independently
  accepted above; aligning queued-state copy and lifecycle semantics is separate from locator
  handoff.
- The VS Code page-level console included one URL-less 404 and unrelated Workbench/GitHub onboarding
  messages. The Agent iframe console was clean, so these are not attributed to the Agent Webview.
