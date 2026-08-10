## Verification

### Result

- Corrected Agent Entry configuration semantics: passed.
- Focused deterministic tests, Agent Webview build, Desktop typecheck, and OpenSpec validation:
  passed.
- Visible Electron acceptance through the isolated development runtime: passed for the scoped
  entry-mode behavior.
- Provider-backed first submit: not run because the isolated fixture had no configured provider or
  model and no cost authorization was supplied.

### Deterministic evidence

- Agent Entry presenter, selector, InputArea, and ConversationController: 4 files, 109 tests passed.
- Agent Entry snapshot codec and adjacent extension root: 2 files, 18 tests passed.
- Desktop Shell, Agent Surface, and Desktop Application: 3 files, 84 tests passed.
- Shared neutral SegmentedControl: 1 file, 8 tests passed.
- `@neko/agent-webview` build / `tsc --noEmit`: passed.
- `@neko/app-desktop` `tsc --noEmit`: passed.
- Focused ESLint: 0 errors; 8 pre-existing warnings remain in the large InputArea and
  ConversationController components.
- `git diff --check`: passed.
- `openspec validate add-home-experience-entry-modes --strict`: passed.
- `pnpm check:openspec`: 72 OpenSpec items passed.

The full `@neko/ui` typecheck remains blocked by unrelated uncommitted errors in
`src/workbench/editor-workbench.test.tsx` at lines 481-482. The focused SegmentedControl test passes.
The package-wide UI test command also reports unrelated boundary failures from concurrent
`theme/tailwind-preset.test.ts` and `packages/markdown/src/browser/*` changes; the focused UI test
passes independently.

### UI evidence

The isolated visible Electron development runtime was operated through normal accessibility-backed
controls and current screenshots were inspected directly:

- Agent Entry displayed the top-centered, neutral `助手 | 工作区 | 角色 | 世界` pill with no outer
  border; selected mode uses a white pill and soft shadow.
- Mouse/assistive selection no longer paints the keyboard focus inset. Keyboard focus remains
  available through `:focus-visible` and is covered by the shared component test.
- Switching Assistant to Workspace stayed in the same Agent Entry composition. No Project
  Management Scene was opened and no Conversation was created.
- An unsent Chinese draft remained unchanged while switching Workspace to Character.
- Workspace showed a local “select a Project or authorized directory” diagnostic, exposed the
  Project chooser, and kept only Send disabled. Its chooser exposed the Host-owned system-directory
  authorization action.
- Character remained selectable but displayed an owner-qualified unavailable diagnostic and kept
  the draft editable.
- World was visibly disabled; attempted activation left Character selected.
- Navigating through the ordinary sidebar to Character Management unmounted the Agent Entry mode
  selector, proving the selector is not management navigation or a stable Desktop title control.

### Quality review

- **Risk:** L2. The change crosses shared React UI, Agent Webview presentation/snapshot state, and
  Desktop-to-Host Workspace grant wiring, but does not change preload/Main contracts or durable
  domain facts.
- **Responsibility:** Agent Webview owns entry presentation and validation; Desktop owns only the
  authorized Project/directory adapter; Agent Draft binding and receipt remain execution authority.
- **Dependency:** Renderer/Webview code uses typed public ports and opaque Workspace identities; it
  does not import Electron, Node, raw paths, or management implementations.
- **Canonical path:** mode selection calls the existing `bindTarget`; first submit remains the only
  Conversation creation transaction. Workspace validation requires the selected target and exact
  binding receipt to match.
- **Fail-local/user data:** invalid mode snapshot resets only that Draft field with a diagnostic;
  target or binding failure leaves input editable and unrelated Scenes, Conversations, and tasks
  usable. Authority changes clear only authority-scoped references, not user text.
- **Deleted path:** the Desktop Scene-to-mode presenter and management title selector are removed;
  source poison tests assert mode selection cannot call management navigation or `newConversation`.

No blocking scoped code-quality findings remain.

### Residual risk

- The isolated fixture had no Project records, so exact Project selection was proven by Desktop and
  controller tests rather than a live Project click; the live directory authorization action was
  inspected without granting a real user directory.
- A real Assistant/Workspace first submit still requires explicit provider/model/cost authorization.
- The full shared-UI typecheck and package-wide UI suite should be rerun after the unrelated
  concurrent worktree failures are resolved.
