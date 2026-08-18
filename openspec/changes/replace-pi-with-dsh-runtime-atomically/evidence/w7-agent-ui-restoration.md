# W7 Agent UI Restoration Evidence

Date: 2026-08-19

## Scope

- Preserve the accepted Electron Agent presentation while replacing the runtime authority with DSH.
- Keep `@neko/agent-webview` as the owner of the `agent-*` DOM and CSS contract.
- Keep the accepted model selector, execution-mode selector, exact Workspace/Canvas context rail, attachment control, and authoritative reference tokens as OpenNeko content-creation capabilities.
- Keep `@neko/host/settings` authoritative for model catalog/selection and execution mode; keep Shell/domain projections authoritative for Workspace/Canvas/reference context; keep Desktop Renderer limited to typed projection orchestration.
- Do not submit a real provider request during this development step.

## Implementation Evidence

- `packages/agent/webview/src/index.css` is byte-identical to `HEAD`; the accepted style sheet was not rewritten.
- `DshAgentView` now mounts the existing `InputArea`, `InputAreaProvider`, `ModelSelector`/configuration menu, `ModeSelector`, `WorkspaceCanvasContextBar`, reference-token and attachment presentation files restored from the accepted UI source. DSH configuration is mapped into the existing component context; no parallel selector or composer implementation remains.
- Desktop no longer declares a parallel `.desktop-dsh-agent*` style surface.
- Tool projection retains bounded JSON `rawInput` and `rawOutput` for expandable details. An invalid payload produces `ACP_TOOL_PAYLOAD_INVALID` for that item while sibling events remain available.
- An unbound Draft keeps the same composer visible. Its first submitted message creates an exact Conversation and prompts only the returned Conversation identity.
- Retired Pi adapters, Host message handlers, Skill/MCP/Plugin handlers, and protocol fallback paths were not restored.

## Authoritative Desktop UI Evidence

Runtime: the real development Electron product at `http://localhost:5173/`, backed by the verified local DSH development closure.

Observed through normal user-visible Desktop controls:

- Workspace Agent Draft: localized centered title, accepted composer shell, circular send control, and no protocol-debug empty state.
- Personal Assistant Draft: the same presentation renders in the full Agent scene without a separate UI implementation.
- Standard maximized window: the title and composer remain centered, readable, and free of clipping or overlap.
- Narrow dock: the title wraps and the composer contracts without horizontal overflow or overlap.
- Composer interaction: entering a draft enables Send; clearing it disables Send again. No message was submitted.
- Existing Pi-only records remain visible and locally disabled with their binding diagnostic; they do not prevent valid DSH sibling records or Draft scenes from opening.

The current local DSH records contain no transcript events, Tool events, or pending approval. Therefore real Electron pixels for populated Markdown, expandable Tool details, approval, and runtime-error states remain blocked rather than inferred from component tests.

## Deterministic Verification

- `pnpm --filter @neko/agent-contracts exec vitest run src/dsh-session-host.test.ts`: 1 file / 9 tests passed. The contract tests cover bounded Tool payload decode and exact canonical event shape.
- `pnpm --filter @neko/agent-runtime exec vitest run src/acp/dsh-acp-projection.test.ts`: 1 file / 15 tests passed. The projection tests cover Tool input/output accumulation and sibling event preservation.
- Focused Desktop Renderer, Main Host, Application, Shell, and Vite configuration run: 5 files / 118 tests passed. These tests cover exact Conversation refresh, Markdown rendering, Tool detail expansion, Generation/Canvas approval identity, Draft creation, cancel, stale projection rejection, and the accepted Shell composition.
- Focused Desktop DSH runtime, bootstrap, and preload bridge run: 4 files / 18 tests passed.
- `pnpm --filter @neko/agent-webview test -- src/dsh-session/root.test.tsx`: 2 files / 8 tests passed.
- `@neko/agent-contracts`, `@neko/agent-webview`, `@neko/agent-runtime`, and `@neko/app-desktop` typechecks passed.
- `pnpm check:agent-boundaries`, `pnpm check:application-boundaries`, `pnpm check:package-boundaries`, and `pnpm check:legacy-debt` passed.
- `pnpm exec openspec validate replace-pi-with-dsh-runtime-atomically --strict` passed.
- The Vite renderer dependency list no longer requests retired `@tanstack/react-virtual`, `mermaid`, or `prism-react-renderer` packages.

## Result And Remaining Risk

Overall UI validation is `blocked`, not passed. Deterministic component/Desktop tests now cover the restored controls and DSH adapter, but populated transcript, Tool, approval, error states and real Electron pixels still require the authoritative runtime lane. Task 7.7 remains open until that evidence is captured.

The DSH Web review session also failed before execution with `QUOTA: Insufficient Balance`; it produced no repository changes and does not count as implementation evidence.

`pnpm check:unused` remains blocked at the previously recorded migration baseline of seven unused files and 157 unused exports. This does not establish a new UI regression, but it continues to block final release readiness.
