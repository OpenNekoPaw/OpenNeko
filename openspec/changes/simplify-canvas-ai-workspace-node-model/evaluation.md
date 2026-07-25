# Agent Evaluation

## Authoring decision

Decision: `reuse`.

The downstream Agent-owned generation behavior remains owned by
`agent-runtime.creative-media-workflow/generated-output-workspace-board`. The
new Canvas surface only contributes explicit selected-node context and submits
an ordinary Agent message; it does not own provider selection, tool execution,
task lifecycle, generated-output delivery, or Workspace Board projection.

The VS Code-specific bridge is covered deterministically by:

- the Webview click test that emits `sendToAgent` with explicit node IDs,
  provenance prompt, and output modality;
- the Extension protocol path test that requires `neko.agent.sendContext`
  followed by `neko.ai.sendMessage`;
- poison assertions that reject the removed Canvas creative executor and
  `canvasCreativeAiAction` path.

No TUI-only case was added to imitate a VS Code Custom Editor click. The
indexed creative-media suite remains the canonical downstream behavior owner.

## Evidence

- `pnpm test:agent:eval` passed 39 test files / 281 tests and the all-suite
  dry-run passed 24 suites / 52 cases.
- The focused dry-run for
  `agent-runtime.creative-media-workflow/generated-output-workspace-board`
  passed its suite, fixture, assertion, and forbidden-fallback contracts.
- The real focused run
  `canvas-quick-generation-20260725` completed with `case-fail`, not an
  infrastructure classification. The configured
  `nekoapi-chat/gpt-5.6-luna` turn read the image Skill but reported that the
  runtime did not expose an executable image-generation capability. It did not
  call `GenerateImage`, create an `image_generation` task, publish a generated
  artifact, or project the Workspace Board. Runtime-error, terminal-idle, and
  forbidden-fallback gates passed.

The raw redacted report remains under the gitignored
`reports/agent-eval/agent-runtime.creative-media-workflow/generated-output-workspace-board/canvas-quick-generation-20260725/`
directory. This downstream capability/configuration failure is not treated as
Canvas bridge acceptance.

## Residual risk

The deterministic Canvas-to-Agent bridge is implemented, but a current
provider-backed evaluation has not proven that the selected Canvas context
reaches a successful Agent-owned generation task. Re-run the same indexed case
after the Evaluation runtime exposes the declared image-generation capability,
and separately complete the VS Code Custom Editor scenario in a verified,
isolated Extension Development Host.
