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
- `DshAgentView` now mounts the existing `InputArea`, `InputAreaProvider`, `ComposerConfigMenu`, `ModeSelector`, `WorkspaceCanvasContextBar`, reference-token and attachment presentation files restored from the accepted UI source. DSH configuration is mapped into the existing component context; the standalone legacy `ModelSelector` remains covered by its presentation contract test, and no parallel selector or composer implementation remains.
- Desktop no longer declares a parallel `.desktop-dsh-agent*` style surface.
- Tool projection retains bounded JSON `rawInput` and `rawOutput` for expandable details. An invalid payload produces `ACP_TOOL_PAYLOAD_INVALID` for that item while sibling events remain available.
- An unbound Draft keeps the same composer visible. Its first submitted message creates an exact Conversation and prompts only the returned Conversation identity.
- Retired Pi adapters, Host message handlers, Skill/MCP/Plugin handlers, and protocol fallback paths were not restored.

## Authoritative Desktop UI Evidence

The Desktop was restarted from the product entry with its verified development DSH closure. The replacement process tree used Electron plus the staged product Node/DSH runtime; the stale pre-restart Main bundle was terminated before review. Normal user-visible controls then established the following:

- The Entry Draft renders the accepted localized composer with no raw `chat.*` keys. The selected chat model is `GPT 5.6 Luna`.
- The chat-model panel contains only LLM choices. The image panel contains `GPT Image 2` and does not contain an LLM choice.
- The runtime mode menu is sourced from DSH and exposes `Read Only`, `Workspace Write`, and `Full access`. Switching to `Read Only` and back to `Workspace Write` updates the exact Draft configuration without creating a Session.
- Conversation mode loads the Character and World catalogs through the product Host. Selecting one exact Character version and one exact World version produces the existing reference-token presentation; clearing each token returns to the empty context rail.
- Authoring mode replaces Character/World actions with Project selection. Selecting `Blame` produces the existing Project token, clearing it succeeds, and returning to Conversation mode does not retain the Project token.
- The standard 960 x 680 Electron window shows the accepted entry composition, model control, runtime-mode control, context rail and quick-action panel without raw protocol UI, clipping or overlap.
- Invalid retained records fail locally. One legacy publication without a DSH binding is disabled in the sidebar; stale DSH Session and expired Workspace-grant records produce their exact diagnostic without stopping the runtime or sibling navigation.

The current Computer Use screenshot stream can lag the Electron accessibility tree by one compositor frame after mode and overlay changes. Repeated accessibility reads proved the current selected mode and menu contents, while the corresponding narrow-window pixels remained stale. Narrow-window visual settlement is therefore `blocked`, not failed or passed.

No safe populated DSH transcript fixture exists in the retained local catalog: available records are empty, missing a DSH binding, reference a stale DSH Session, or reference an expired Workspace grant. Real provider submission is intentionally skipped. Populated Markdown, expandable Tool details, approval and active runtime-error pixels therefore remain blocked; deterministic component/Desktop tests are supporting evidence only.

## Deterministic Verification

- `pnpm --filter @neko/agent-contracts exec vitest run src/dsh-session-host.test.ts`: 1 file / 9 tests passed. The contract tests cover bounded Tool payload decode and exact canonical event shape.
- `pnpm --filter @neko/agent-runtime exec vitest run src/acp/dsh-acp-projection.test.ts`: 1 file / 15 tests passed. The projection tests cover Tool input/output accumulation and sibling event preservation.
- Focused Desktop Renderer, Main Host, Application, Shell, runtime and preload run with one worker: 7 files / 136 tests passed. These tests cover exact Conversation refresh, Markdown rendering, Tool detail expansion, Generation/Canvas approval identity, Draft creation, cancel, stale projection rejection, model/media filtering, DSH permission presets and the accepted Shell composition.
- `pnpm --filter @neko/agent-contracts test`: 41 files / 217 tests passed.
- `pnpm --filter @neko/agent-runtime test`: 47 files / 362 tests passed.
- `pnpm --filter @neko/dsh-bridge test`: 2 files / 18 tests passed.
- `pnpm --filter @neko/agent-webview test`: 4 files / 26 tests passed, including the restored
  `WorkspaceCanvasContextBar` and `DropdownOverlayContract` presentation tests for the accepted model,
  execution-mode, Workspace/Canvas rail and overlay CSS.
- `@neko/agent-contracts`, `@neko/agent-webview`, `@neko/agent-runtime`, `@neko/dsh-bridge`, and `@neko/app-desktop` typechecks passed.
- `pnpm check:agent-boundaries`, `pnpm check:application-boundaries`, `pnpm check:package-boundaries`, and `pnpm check:storage-authorities` passed.
- `pnpm exec openspec validate replace-pi-with-dsh-runtime-atomically --strict` passed.
- The Vite renderer dependency list no longer requests retired `@tanstack/react-virtual`, `mermaid`, or `prism-react-renderer` packages.
- `pnpm check:no-internal-versioning` remains blocked by the repository baseline: the scanner traverses the ignored staged `.dsh-development-runtime` third-party closure, four allowance entries are stale, and retained third-party/user-domain version names are reported. No generated runtime file is tracked by Git.

## Result And Remaining Risk

Overall UI validation is `blocked`, not passed. The authoritative Desktop lane now passes the empty Entry Draft, localized old composer, model/media filtering, DSH permission modes, and Character/World/Project selection cycles. Narrow-window settled pixels and populated transcript/Tool/approval/error states remain blocked. Character/World reference selection also does not by itself prove that the later DSH domain-Tool workstream consumed those references; that behavior remains part of W6/W7 rather than this presentation result. Task 7.7 stays open.

The DSH Web review session also failed before execution with `QUOTA: Insufficient Balance`; it produced no repository changes and does not count as implementation evidence.

`pnpm check:unused` remains blocked at the current migration baseline of six unused files and 182 unused exports.
The removed unused InputArea barrel is no longer reported, and the restored presentation tests keep the accepted
model/mode/context components on an intentional test surface. The remaining findings do not establish a new UI
regression, but they continue to block final release readiness.
