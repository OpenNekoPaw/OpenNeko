## Verification

### Result

- Implementation and deterministic contract verification: passed.
- Visible Electron acceptance for the entry navigation change: passed.
- Real-provider Assistant/Workspace first submit: infrastructure-blocked because no explicit
  provider, model, and cost authorization was supplied.

### Deterministic evidence

- Agent Webview focused tests: 4 files, 114 tests passed.
- Desktop Scene/navigation/Host adapter tests: 5 files, 92 tests passed.
- Host Scene contract/service tests: 2 files, 59 tests passed.
- Agent launch contract/adapter tests: 2 files, 14 tests passed.
- Shared segmented-control tests: 1 file, 8 tests passed.
- Desktop, Agent Webview, and Agent contracts `tsc --noEmit`: passed.
- Focused ESLint for the new Desktop/shared controls: passed with no errors. Focused Agent Webview
  lint retained only pre-existing warnings in the touched large components.
- Focused Prettier and `git diff --check`: passed.
- `pnpm test:agent:eval`: 44 files and 294 tests passed; all-suite dry-run covered 24 suites and
  64 cases, including `agent-runtime.launch-binding`.
- `openspec validate add-home-experience-entry-modes --strict`: passed.
- `pnpm check:openspec`: 72 OpenSpec items passed.

The full `@neko/ui` typecheck remains blocked by unrelated uncommitted errors in
`src/workbench/editor-workbench.test.tsx` at lines 481-482. The changed SegmentedControl source and
its eight focused tests pass; this change did not modify the blocking file.

### UI evidence

The authoritative local Electron development runtime was exercised through normal visible controls
and its current screenshots were inspected directly:

- Assistant Entry showed the neutral four-item selector at the top, selected Assistant, and kept the
  composer and model controls independent of navigation.
- Workspace click opened Project Management, selected Workspace, and exposed the explicit
  “Open directory” authorization action plus existing Projects.
- Character click opened Character Management and selected Character.
- World remained visibly disabled and clicking it did not change the selected Scene.
- Left-arrow navigation moved Character to Workspace and skipped disabled World.
- At a narrower window width the selector remained centered, readable, and unclipped without
  overlapping Project Management controls.
- Double-clicking an explicit Project entered its real Workspace; the entry selector unmounted and
  the Workspace title/region controls remained in their owning title area.
- The application was returned to Assistant Entry and its original window width after validation.

A stale local Desktop settings record produced an owner-qualified, fail-local banner on initial load;
the Shell and all navigation remained usable. This diagnostic predates and is independent of the
entry navigation implementation.

### Quality review

- **Risk:** L2 because the change updates shared UI plus Renderer/preload/Main and public launch
  contracts, while leaving provider execution and durable domain facts unchanged.
- **Ownership:** the selector is Desktop Window Scene presentation. Agent Draft owns only input,
  references, configuration, and canonical first submit.
- **Canonical path:** enabled modes emit exact Scene intents; Project/directory authority is granted
  only from Project Management; first submit remains the only Conversation-creation transaction.
- **Deleted paths:** Webview mode snapshot/presenter/selector, mode-click Draft binding,
  `start-chat | roleplay` Home dispatch, `bind-agent-assistant`, and `bind-assistant` cannot return
  success. Parser rejection and source poison tests cover both removed contract paths.
- **Fail-local/user data:** directory cancellation changes no Scene; invalid configuration blocks only
  Send while preserving Draft text; navigation does not delete or retarget Conversations, Projects,
  Characters, or background runtime ownership.
- **Accessibility:** the selector has a labeled tablist, selected/disabled state, disabled World
  description, focus styling, and arrow/Home/End keyboard navigation.

No blocking code-quality findings remain for the scoped change.

### Residual risk

Provider-backed Assistant and Workspace first-submit acceptance remains blocked until explicit
provider/model/cost authorization is available. The full shared-UI typecheck must be rerun after the
unrelated `editor-workbench.test.tsx` errors are resolved.
