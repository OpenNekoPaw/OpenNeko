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

## Foundational Matrix

- Covered deterministically: basic and multi-turn Conversation behavior, queue/terminal convergence, Canvas run-intent persistence, uncertain submission recovery, exact Job reattachment, result apply after Recipe edits, renderer unmount/reopen, output preservation and Conversation/Workspace isolation through Agent Runtime, Canvas Domain/Node and Desktop headless tests.
- Unaffected and rechecked: compaction continuation, transcript restoration, Conversation switching and transcript/config/context isolation remain owned by the existing Agent Runtime suites, which passed in the full package run.
- Blocked as real-provider evidence: natural-language Agent generation, visible Canvas paid generation, provider-backed generation-record restoration and artifact/Board projection after a complete application reopen.

## Quality And Residual Risk

- Focused package, Desktop headless, targeted Desktop, OpenSpec and architecture boundary checks passed. Full workspace `pnpm typecheck` passed.
- `pnpm check:no-internal-versioning` remains blocked by unrelated in-progress AI SDK changes (`packages/ai/sdk/src/providers/newapi/index.ts`, `packages/ai/sdk/src/types.ts`) and stale allowances; the Generation prompt test introduced by this change no longer contributes a finding.
- `pnpm check:unused` remains blocked by pre-existing exports in `DesktopShell.tsx` and `agent-contract.ts`; neither is introduced by this change.
- Pre-release rollback is valid only before user documents contain Generation Nodes. After such documents exist, recovery is fix-forward so an older build cannot silently discard the new canonical node.
- The remaining product risk is provider-backed behavior and the corresponding visible running/history/stale presentation. It must be closed with explicit provider/model selection and cost authorization before release acceptance.
