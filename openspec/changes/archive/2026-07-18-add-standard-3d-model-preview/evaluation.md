# Evaluation Plan

## Evaluation Scope

- **Change/feature:** Standard 3D model preview evidence delivered from the `neko-preview` VS Code Webview to Agent.
- **Decision and owning suite:** `excluded` from a real TUI suite for the initial change because the originating panel session, `webview.asWebviewUri()` mapping, bounded canvas capture, and `neko.agent.sendContext` command are VS Code host-private inputs that the canonical TUI controller cannot create without adding a second or Evaluation-only product path.
- **Why real Evaluation is not initially required:** The change does not alter Prompt content, Skill selection, Tool/capability registration, provider/model selection, task workflow, continuation, or TUI projection. Agent changes are limited to strict schema parsing and deterministic projection of one new host context type through the existing context path.
- **Canonical path and forbidden fallback:** Preview model panel → live identity/revision validation → derived preview `ResourceRef` → `model-preview` `AgentContextPayload` → Agent context parser/presenter/multimodal projection. Engine Model/Scene groups, `model-scene`, generic text attachment reading, external Viewer dispatch, direct provider upload, active-panel fallback, and source-only success are forbidden.

## Cases

- **Excluded behavior:** Model Preview context schema, parser, presenter, image/source projection, and legacy rejection use deterministic shared/Agent tests because they contain no model decision.
- **Real host coverage:** A focused `neko-preview` Extension Development Host scenario opens a synthetic model, stages camera/lights, captures, sends to Agent, and observes the canonical context projection with no CSP/runtime/Engine errors.
- **Coverage escalation:** If implementation adds Agent reasoning instructions, Tool/capability routing, provider selection, or TUI-observable behavior, change the disposition to `update` or `create` under the exact mapped owner, starting with one canonical and one failure case; do not assign the change to a convenient suite without selector evidence.
- **Missing observability:** None is required for the deterministic initial boundary. A future real Agent case would require a canonical TUI-supported way to introduce equivalent stable model source, preview image, and staging context without simulating a VS Code Webview.

## Verification

- **Key-free validation:** `pnpm test:agent:eval` passed on 2026-07-18 (39 files, 277 tests; 23 suites and 47 cases discovered by the all-suite dry-run). This validates harness integrity only and is not Model Preview behavior acceptance.
- **Deterministic Agent validation:** Run focused shared context, Agent protocol/parser, presenter/reference-token, multimodal attachment projection, and no-fallback tests for `model-preview` and rejected `model-scene`.
- **Real VS Code validation:** Run the focused synthetic Model Preview Webview functional scenario in an Extension Development Host and retain the sanitized report location.
- **Blocked or unexecuted cases:** If the verified VS Code CDP target, Agent extension, WebGL, or functional fixture environment is unavailable, record the exact blocker and keep runtime projection unaccepted rather than substituting browser/Vite or TUI dry-run evidence.

## Interpretation

- Passing deterministic tests proves schema, identity, projection, and legacy-path rejection.
- Passing the VS Code scenario proves the real host path from authorized model load through capture and Agent context projection.
- Neither result proves a configured AI video provider natively consumes 3D binaries or that a model will choose a particular generation action; those behaviors are outside this change.
- The implementation was revisited after runtime debugging and still adds no Agent reasoning instructions, Tool/capability routing, provider selection, or new TUI behavior. The `excluded` disposition therefore remains valid and `agent-runtime.creative-media-workflow` is unchanged.

## Residual Risk

- Subjective usefulness of the staged view for a particular AI video model remains provider- and prompt-dependent.
- If later code changes Agent decisions or media routing based on this context, the exclusion becomes invalid and focused real TUI Evaluation is required before release readiness.
