# Agent Evaluation Disposition

## Scope

- Change: explicit Workspace Board/Canvas turn target propagation, exact Draft-to-Tab selection handoff, stable Canvas catalog loading, deterministic Canvas index order and exact Turn-bound Canvas query schemas.
- Decision: `reuse` `agent-runtime.creative-media-workflow/workspace-board-material-analysis` and `agent-runtime.screenplay-authoring/reject-protected-project-raw-access`. These cases own Workspace Board context and denial of raw `.nkc`/`.otio` access. Real Desktop/provider evidence is required for release acceptance because the effective Turn context and Tool routing visible to the model change; it was not run without explicit provider/model/cost authorization.
- Canonical path: explicit selected Board/Canvas -> Draft submit/queued message -> controller `resolveTurnContext` -> frozen Turn context -> exact `canvas_list_nodes.document_path` schema and prompt -> Canvas capability provider.
- Forbidden paths: Board as `undefined`/no-target, active/current/recent fallback, exact selection lost on Draft->Tab, stale target binding on a later Turn, catalog reload on streaming render, non-deterministic Canvas order, model-visible absolute host paths, generic `Read` for `.nkc`, and non-local absolute-path failures.

## Cases

- Board producer/controller/prompt: deterministic Webview and Runtime tests prove a Board selection submits `canvasTurnTarget`, the controller resolves Board context, and the prompt emits the canonical Board section.
- Turn-bound capability contract: Runtime tests prove Board and exact Canvas Turns expose `canvas_list_nodes` with a one-value `document_path` enum matching the frozen target, name the same operation and argument in the prompt, keep `Read` for ordinary text while excluding `.nkc`/`.otio`, and do not reuse an enum without Canvas context.
- Exact Canvas queue/continuation: existing queue tests preserve `canvasTurnTarget`; Webview tests prove exact Draft-to-Tab selection handoff and no fallback.
- Streaming rerender: ChatWorkspace tests prove a new projection object with the same Workspace identity does not clear or reload the Canvas catalog.
- Deterministic order: Canvas Domain tests prove catalog options are stable independent of input order.
- Protected project boundary: Agent Runtime tests prove `.nkc` is not raw-readable and Canvas query capability remains the canonical path.

## Verification

- Deterministic tests: focused Vitest in `@neko/agent-webview`, `@neko/canvas-domain`, and `@neko/agent-runtime`.
- Typecheck: `pnpm --dir packages/agent/webview run typecheck`, `pnpm --dir packages/canvas/domain run typecheck`, `pnpm --dir packages/agent/runtime run typecheck`.
- OpenSpec: `pnpm check:openspec`.
- Agent Evaluation: key-free `pnpm test:agent:eval` validates suite/index/runner readiness only. No real provider/model/cost authorization was supplied, so no visible or headless complete-Desktop real case was run and no model-behavior acceptance is claimed.
- UI visual validation is not applicable: this change has no visual appearance or interaction design difference.

## Interpretation

- Deterministic success proves the exact selected Canvas target reaches every Turn layer and constrains the provider-facing query contract.
- Existing Evaluation suites remain the behavioral owner for model compliance with Canvas-first routing and file-tool usage. Deterministic tests prove the wiring contract, but this change remains behavior-unverified until an authorized complete-Desktop provider case proves the selected target, effective prompt/capability facts, relative tool arguments, and absence of raw `.nkc` fallback.

## Residual Risk

- Real-provider behavior with the Board prompt and relative path rules remains unverified without explicit authorized Evaluation runs.
- If a new DesktopShell projection changes the Workspace identity for the same physical workspace, the catalog will reload; this is a correct identity change, not a fallback.
