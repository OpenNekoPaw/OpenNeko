# W2 First Vertical Domain Tool Slice Freeze

## Canonical Path

DSH official Tool registration (`ctx.tools.register` on `ctx.tools` ToolRuntime) → `ctx.opennekoHostTools.execute` → ACP reverse `openneko/domain-tool/execute` → explicit Host adapter in `@neko/agent-runtime/acp` → owning domain application service. There is no MCP wrapper, generic Host tool registry, wildcard dispatch, Desktop business validation, private DSH API, embedded Cordis production path, or restored Pi/Skill/MCP/Plugin/tool-registry path.

## Exact Generation Operations

Tool name: `openneko.generation`

| Operation | Input | Output |
| --- | --- | --- |
| `submit` | `{ purpose, generationType, lifecycleMode, request }` | bounded durable Job facts: `jobId`, `kind`, `phase`, `stage`, `lifecycleMode`, `generationType`, `createdAt`, `updatedAt`, optional `failure` |
| `describe` | `{ jobId }` | same bounded durable Job facts |

Generation owns contract/schema/semantic validation/routing/durable Job. The Host adapter uses `PurposeGenerationJobPort.submitGeneration` and `describeGeneration` only. It never waits synchronously for a provider result and never returns provider payloads, request text, result locators, or provider task identity in the DSH result.

## Exact Canvas Operations

Tool name: `openneko.canvas`

| Operation | Input | Output |
| --- | --- | --- |
| `query` | `{ documentPath }` | bounded facts: `documentPath`, `fingerprint`, `nodeCount`, `connectionCount` |
| `create-node` | `{ documentPath, expectedFingerprint, node }` | bounded mutation facts: `documentPath`, `fingerprint`, `nodeId`, `nodeType`, `nodePosition`, optional `parentId` |

Canvas owns contract/schema/exact document and node identity/freshness/mutation. The Host adapter uses `CanvasProjectAuthoringService.query` and `createNode` only. `documentPath` is a normalized workspace-relative `.nkc` path. `expectedFingerprint` is required for mutation and stale fingerprints fail locally without mutation.

## Package-Owned Public Surfaces

- `@neko/generation` exports `dsh-tool` constants, strict decoder, and bounded Job fact projection.
- `@neko/canvas-domain` exports `dsh-tool` constants, strict decoder, and bounded query/mutation fact projections.
- Both owning packages export their exact model-facing parameter schema. Their DSH plugins pass that schema directly to official `defineTool`; they do not replace operation input with unconstrained JSON.
- `@neko/agent-runtime/acp` exports `GenerationDshHostAdapter` and `CanvasDshHostAdapter`, plus the ACP application client with exact `executeGenerationTool` and `executeCanvasTool` handler slots.
- `@neko/generation-dsh-plugin` is Generation's first-party DSH Tool contribution.
- `@neko/canvas-dsh-plugin` is Canvas's first-party DSH Tool contribution.
- `@neko/dsh-bridge` only provides `ctx.opennekoHostTools.execute`; it does not register domain Tools.

## Correlation And Failure

- The reverse ACP request preserves `sessionId`, `turn`, `toolCallId`, exact `tool`, `operation`, and lossless JSON `input`.
- A successful long-running Generation response returns the owning-domain `jobId`; DSH call identity references but does not replace that Job identity.
- A Canvas mutation response returns the exact `fingerprint` and node identity for the written document.
- Semantic negatives, stale fingerprints, invalid paths, and unknown tool names fail locally as typed failure diagnostics; they do not switch to MCP, another provider, another Tool handler, or Desktop logic.

The model-facing schemas expose the same canonical shape that the Host decoders enforce. Canvas `query` advertises only `documentPath`; `create-node` advertises `documentPath`, `expectedFingerprint`, and `node`. Generation `submit` advertises the purpose-bound envelope and generationType-specific request, including canonical `negativePrompt` and `aspectRatio`; `describe` advertises only `jobId`. Nested operation inputs are closed. The retired/incorrect `include`, `negative_prompt`, and `aspect_ratio` fields are neither advertised nor accepted, and no compatibility mapping was added.

## Test Evidence

Focused tests added:

- `packages/generation/src/dsh-tool.test.ts`
- `packages/canvas/domain/src/dsh-tool.test.ts`
- `packages/agent/runtime/src/acp/domain-tool-host-adapters.test.ts`
- `packages/agent/runtime/src/acp/dsh-acp-application-client.test.ts`
- `packages/generation/dsh-plugin/src/index.test.ts`
- `packages/canvas/dsh-plugin/src/index.test.ts`
- `packages/generation/src/job/__tests__/generation-application-runtime.test.ts`
- `packages/generation/src/job/__tests__/coordinator.test.ts`
- `packages/canvas/webview/src/host-runtime/canvas-webview-host.test.ts`
- `packages/canvas/webview/src/components/selection/SelectionGenerationInputPanel.test.tsx`
- `apps/neko-desktop/src/main/desktop-canvas-runtime.test.ts`
- `apps/neko-desktop/src/renderer/DesktopAgentSurface.test.tsx`
- `apps/neko-desktop/src/architecture-boundary.test.ts`
- `scripts/dsh-q0/src/qualify.mjs` loads both real plugins in an isolated DSH profile.

Generation and Canvas use the shared ACP permission owner/UI; they do not duplicate a domain permission runtime. The UI acceptance cases preserve exact Conversation, DSH Session, turn and Tool call identity for both first-party Tools. Domain authorization remains inside the owning Host-side service: Generation resolves an exact Conversation context and Workspace grant before selecting its owner/model binding, while Canvas validates input before resolving the exact Workspace grant and enforces document freshness before mutation.

Direct Canvas Generation uses the native Canvas Webview, typed Canvas Host runtime and package-owned Generation runtime. Architecture poison tests reject an Agent prompt or DSH Tool shortcut from this direct path. Generation Job recovery/cancel and Canvas document/Generation projection restart behavior are covered by owning-package and Desktop runtime tests.

Tasks 5.3 and 5.6 are deterministically complete. The two complete Desktop vertical slices in task 5.8, visible UI acceptance and real provider validation remain incomplete and are not release evidence.

## Model-facing schema correction verification

Evaluation disposition: `update`, owned by `agent-runtime.creative-media-workflow`. The change can affect model Tool argument selection, so deterministic schema tests are necessary but do not replace a real Desktop/provider run. The current W7 suite still contains retired Pi Tool identities and cannot prove the DSH `openneko.generation`/`openneko.canvas` call path until task 10.7 migrates its Tool facts and assertions; that real Evaluation remains `infrastructure-blocked` rather than falling back to a direct runtime runner.

Focused deterministic evidence added on 2026-08-20:

- `@neko/canvas-domain`: package-owned schema contains the exact two operation inputs and does not advertise `include`.
- `@neko/canvas-dsh-plugin`: canonical query reaches the Host port; the screenshot's `include` input fails DSH argument validation before Host dispatch.
- `@neko/generation`: package-owned schema advertises the purpose/lifecycle envelope and camelCase request fields, without snake_case aliases.
- `@neko/generation-dsh-plugin`: canonical image submit reaches the Host port; the screenshot's flattened snake_case input fails DSH argument validation before Host dispatch.
