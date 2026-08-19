# W7 Agent UI Restoration Evidence

Date: 2026-08-19

## Scope

- Preserve the accepted Electron Agent presentation while replacing the runtime authority with DSH.
- Keep `@neko/agent-webview` as the owner of the `agent-*` DOM and CSS contract.
- Keep the accepted model selector, execution-mode selector, exact Workspace/Canvas context rail, attachment control, and authoritative reference tokens as OpenNeko content-creation capabilities.
- Keep `@neko/host/settings` authoritative for model catalog/selection and execution mode; keep Shell/domain projections authoritative for Workspace/Canvas/reference context; keep Desktop Renderer limited to typed projection orchestration.
- Do not submit a real provider request during this development step.

## Implementation Evidence

- `packages/agent/webview/src/index.css` continues to own the accepted component hierarchy and semantic
  tokens. The DSH projection did not introduce a parallel component or Desktop-owned Agent style system.
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
- Invalid retained records fail locally. One legacy publication without a DSH binding is disabled in the sidebar; stale DSH Sessions produce their exact diagnostic without stopping the runtime or sibling navigation.

### Entry And Workspace Binding Correction

The Desktop was rebuilt and restarted through `pnpm dev:desktop`, which prepared and injected the verified absolute development DSH runtime root before Forge launched Electron. Through the normal visible controls:

- Switching the unbound Entry from Conversation to Authoring kept the same Entry scene and replaced Character/World actions with Project selection.
- The Authoring Project selector opens by default. Its heading and content are unframed; the Project cards
  retain their accepted unselected and selected presentation.
- Before a Project was selected, the retained Project action remained visible and send stayed disabled,
  while the composer did not repeat `开始创作前请选择项目。` inside the input area.
- Selecting `Blame` rendered the retained Project token; entering a Draft enabled send without navigating to Assistant or Workspace. The Draft was cleared without submitting a provider request.
- Reopening both retained `Blame` Conversations after a fresh Desktop process restored the exact Workspace scene, Canvas and project browser. Neither path emitted the former `Desktop Workspace grant ... is not present` failure.
- Both retained bindings reference DSH Sessions from retired presets. After Workspace grant restoration they failed locally with their original `DSH_SESSION_STALE` identities. No compatibility preset, rebind or replacement Session participated.

The visible Entry mode, Project cards, selected token, blocked/enabled composer states and reopened Workspace surfaces were inspected directly in Electron. The current full-window screenshots settled correctly; provider-backed post-submit navigation and response pixels remain intentionally unexecuted.

### Composer Input Trigger Correction

- The retained `InputArea`, `SlashCommandMenu`, `SkillInvocationMenu`, and `MentionMenu` are the only Composer presentation path; no DSH-specific replacement component was added.
- A visible exact Workspace Conversation projected `/compact`, `/feedback`, `/goal`, `/permission`, and `/plan` from the loaded DSH Session. Submitting an argument-free `/goal` produced one completed Command activity, cleared the draft, preserved the existing transcript, and did not create a model turn.
- The final visible verification executed `/goal clear` through the same Composer path to remove the temporary Goal created during command testing. It produced one completed DSH Command activity and left the Composer empty.
- DSH `command/run.args` is now decoded as a string rather than an identity, so the legal empty string emitted by an argument-free command survives Host projection. Non-string values remain rejected.
- Desktop resolves the packaged first-party Skill resource and passes it only as `DSH_BUNDLED_SKILL_DIR` to the DSH subprocess. After a fresh runtime start, the exact DSH Session advertised 15 user-invocable Skills, including `$image`, `$storyboard`, and `$world-creator`; DSH still owns discovery, parsing, catalog validation, injection, and execution.
- Typing `@` in the same visible Workspace Conversation projected only the Host-authorized `test.nkc` `ContentLocator`. The retained menu displayed localized hint, section, source, and media labels; no raw `chat.input.mentionHint` key remained.
- Provider-backed Skill and mention submission was intentionally not executed. Deterministic Webview, bridge, Main, preload and contract tests prove the strict submit path and no-Prompt fallback; this evidence does not claim real model behavior acceptance.

#### Complete Host Mention Projection

- The existing `MentionMenu` remains the only `@` presentation. No DSH-specific menu, Pi file search, raw filesystem query or Renderer-owned catalog was introduced.
- The sender-bound Host search now combines the canonical Resource Browser `files`, `media`, and `assets` sources with the exact Workspace Project Entity document. Files and media retain `ContentLocator` receipts; available Assets and active Project Entities use strict `AgentContextPayload` receipts. Character and Scene entities preserve their existing menu kinds; other Project Entity kinds use the existing generic Entity section.
- Selecting a locator-backed item still produces the retained file-reference token and submits one ACP resource link. Selecting an Asset/Entity receipt produces the retained context chip and sends that bounded receipt through typed IPC; Desktop appends it as untrusted, exact user-selected data to the current DSH turn context before prompting. Commands and Skills reject either receipt type instead of silently treating it as a Prompt.
- Strict decoding rejects a candidate carrying both receipt types, a resource kind that disagrees with its receipt, duplicate context identities, non-JSON context data, unexpected fields, stale/unknown raw `@name` input and context attached to Command/Skill execution.
- The visible Electron Workspace Conversation was restarted on the current Main bundle. Entering one `@` displayed the retained localized menu and the Host-authorized `test.nkc` with `文件`, `工作区`, and `文本` labels. The local Blame dataset has no available Asset or active Project Entity record, so those populated sections have deterministic component/Host coverage but no current real pixels.
- Computer Use exposed the popup as a macOS accessibility menu but its AX click and Return action did not select the row. The selected-token and provider-backed mention submission lane is therefore `blocked`, not passed. No direct IPC, synthetic database record or alternate Agent runner was used as a substitute.
- Canvas node mentions remain an explicit gap. The Canvas owner currently exposes exact Canvas document indexing and DSH query/create operations, but no sender-bound, read-only node search catalog. The implementation does not read `.nkc` files through a new Desktop path or mislabel a Canvas document as a node.

### Light Theme Surface Correction

The accepted components were retained. The existing Desktop theme and Agent semantic tokens were adjusted so
the light appearance follows a white-canvas hierarchy while dark appearance continues to use the existing
default token path.

### Entry Target Selector Presentation

- Project, Character and World continue to use the retained `HomeExperienceQuickActions` and existing resource cards; no replacement selector or card was introduced.
- The shared quick-action presentation now has one unframed style path: no outer border, rounded container background or detail divider. Character/World cards and version controls retain their prior styling.
- A visible Electron Entry verified Character is expanded on first render, World remains expanded after the context action changes the target catalog, Authoring Project remains unframed, and returning to Conversation expands Character again. The header can still be collapsed and reopened.

- The native window, Shell chrome, Main and ordinary surface tokens resolve to white in light appearance.
  Muted surface, hover, pressed, disabled and selected tokens remain neutral fills so interaction state stays
  visible.
- The Agent Entry canvas, composer, context rail, assistant surface and model overlay resolve to white. Borders
  and reduced shadows preserve separation without restoring broad gray panels.
- Model configuration keeps its white overlay while category tabs, secondary tabs and model rows use the
  existing accent/hover semantic colors plus bounded shadows to distinguish selected, hovered and idle states.
- The Entry/Workspace context rail retains its accepted dimensions, spacing, borderless shape, neutral fill
  and shadow. The white-canvas correction does not override this component or the Character, World and
  Project selector/card styling.
- The light-only `desktop-dock` override is attached to the actual Agent presentation root. This closes the
  inherited sidebar-background path that previously kept the Entry canvas gray even after body-level light
  tokens changed. The default/dark `desktop-dock` rule is unchanged.
- Visible Electron review covered the unbound Entry, an existing Workspace Conversation, its exact
  Workspace/Canvas context rail and the model configuration overlay. The canvas and containers were white;
  selected navigation, model rows, disabled controls and overlay boundaries remained visible; no overlap or
  clipping was observed at the running 1395 x 768 viewport.

The current Computer Use screenshot stream can lag the Electron accessibility tree by one compositor frame after mode and overlay changes. Repeated accessibility reads proved the current selected mode and menu contents, while the corresponding narrow-window pixels remained stale. Narrow-window visual settlement is therefore `blocked`, not failed or passed.

No safe populated DSH transcript fixture exists in the retained local catalog: available records are empty, missing a DSH binding, or reference a stale DSH Session. Real provider submission is intentionally skipped. Populated Markdown, expandable Tool details, approval and active runtime-error pixels therefore remain blocked; deterministic component/Desktop tests are supporting evidence only.

## Deterministic Verification

- Mention-completion focused verification passed: Agent contracts 1 file / 17 tests, Agent runtime turn-context 1 file / 3 tests, Agent Webview DSH composer 1 file / 13 tests, and Desktop composer/session/preload/Renderer 4 files / 42 tests. The Webview regression also proves selected context presentation is discarded when the exact Conversation identity changes.
- `@neko/agent-contracts`, `@neko/agent-runtime`, `@neko/agent-webview`, and `@neko/app-desktop` typechecks passed with the locator/context receipt union and Project Entity source.
- `pnpm check:agent-boundaries`, strict OpenSpec validation, Prettier check for all touched mention files, and `git diff --check` passed.

- Final focused verification passed: Agent contracts 41 files / 221 tests, Agent runtime 47 files / 368 tests, Agent Webview 4 files / 34 tests, DSH bridge 2 files / 20 tests, Desktop 11 files / 165 tests, and Assets resource browser 1 file / 16 tests.
- `@neko/agent-contracts`, `@neko/agent-runtime`, `@neko/agent-webview`, `@neko/dsh-bridge`, `@neko/app-desktop`, and `@neko/assets-node` typechecks passed after the command contract, bundled Skill root, authorized mention projection and resource-browser binding changes.

- `pnpm --filter @neko/agent-contracts exec vitest run src/dsh-session-host.test.ts`: 1 file / 9 tests passed. The contract tests cover bounded Tool payload decode and exact canonical event shape.
- `pnpm --filter @neko/agent-runtime exec vitest run src/acp/dsh-acp-projection.test.ts`: 1 file / 15 tests passed. The projection tests cover Tool input/output accumulation and sibling event preservation.
- Focused Desktop Renderer, Main Host, Application, Shell, runtime and preload run with one worker: 7 files / 136 tests passed. These tests cover exact Conversation refresh, Markdown rendering, Tool detail expansion, Generation/Canvas approval identity, Draft creation, cancel, stale projection rejection, model/media filtering, DSH permission presets and the accepted Shell composition.
- The current Desktop suite passes 100 files / 571 tests. New path-level coverage proves stable Project choice propagation through Webview, Renderer, preload and Main, exact Project-to-Workspace grant signing, persisted grant restoration, rejection of Surface rebinding/cross-Workspace authority, and first-prompt routing through only the returned Conversation identity.
- `pnpm --filter @neko/agent-contracts test`: 41 files / 217 tests passed.
- `pnpm --filter @neko/agent-runtime test`: 47 files / 362 tests passed.
- `pnpm --filter @neko/dsh-bridge test`: 2 files / 18 tests passed.
- `pnpm --filter @neko/agent-webview test`: 4 files / 30 tests passed, including the restored
  `WorkspaceCanvasContextBar` and `DropdownOverlayContract` presentation tests for the accepted model,
  execution-mode, Workspace/Canvas rail, light-only white surface contract and overlay CSS.
- `pnpm --filter @neko/app-desktop test`: 101 files / 577 tests passed, including the white light-theme
  projection and native Electron background contract.
- `@neko/agent-contracts`, `@neko/agent-webview`, `@neko/agent-runtime`, `@neko/dsh-bridge`, and `@neko/app-desktop` typechecks passed.
- `pnpm check:agent-boundaries`, `pnpm check:application-boundaries`, `pnpm check:package-boundaries`, and `pnpm check:storage-authorities` passed.
- `pnpm exec openspec validate replace-pi-with-dsh-runtime-atomically --strict` passed.
- The Vite renderer dependency list no longer requests retired `@tanstack/react-virtual`, `mermaid`, or `prism-react-renderer` packages.
- `pnpm check:no-internal-versioning` now excludes the ignored staged `.dsh-development-runtime` third-party closure, but remains blocked by four stale allowance entries and 70 unbaselined occurrences across the wider uncommitted DSH cutover, including retained third-party model/API versions and legacy-data protection fixtures. No baseline was regenerated and no scanner rule was relaxed for those occurrences.
- `pnpm check:agent-boundaries`, strict OpenSpec validation, and `git diff --check` passed in the final verification.

## Result And Remaining Risk

Overall UI validation is `blocked`, not passed. The authoritative Desktop lane now passes the empty Entry Draft, localized old composer, model/media filtering, DSH permission modes, Character/World/Project selection cycles, Entry Project binding states and persisted Workspace grant restoration. Narrow-window settled pixels and populated transcript/Tool/approval/error states remain blocked. Character/World reference selection also does not by itself prove that the later DSH domain-Tool workstream consumed those references; that behavior remains part of W6/W7 rather than this presentation result. Task 7.7 stays open.

The DSH Web review session also failed before execution with `QUOTA: Insufficient Balance`; it produced no repository changes and does not count as implementation evidence.

`pnpm check:unused` remains blocked at the current migration baseline of six unused files and 182 unused exports.
The removed unused InputArea barrel is no longer reported, and the restored presentation tests keep the accepted
model/mode/context components on an intentional test surface. The remaining findings do not establish a new UI
regression, but they continue to block final release readiness.
