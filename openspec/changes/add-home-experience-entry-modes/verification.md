## Verification

### Result

- Implementation and deterministic verification: passed.
- Visible Electron acceptance: partially passed, then infrastructure-blocked for the final fresh-window matrix.
- Real-provider Agent Evaluation: infrastructure-blocked because no explicit provider, model, and cost authorization was supplied.

### Deterministic evidence

- `pnpm --filter @neko/agent-webview build`: passed.
- `pnpm --filter @neko/agent-webview test`: 92 files and 724 tests passed.
- Focused Desktop launch, grant, and Renderer adapter tests: 3 files and 16 tests passed.
- `pnpm --filter @neko/app-desktop typecheck`: passed.
- Focused ESLint: 0 errors; existing warnings in touched large components remain unchanged in severity.
- Focused Prettier check: passed.
- `pnpm test:agent:eval`: 44 files and 294 tests passed; all-suite dry-run covered 24 suites and 64 cases, including `agent-runtime.launch-binding`.
- `openspec validate add-home-experience-entry-modes --strict`: passed.
- `pnpm check:openspec`: 72 OpenSpec items passed.
- `pnpm check:quality`: passed, including canonical-path, package, Agent, Webview, storage, strict-TypeScript, and test-orchestration gates.

The first concurrent Agent Evaluation attempt produced one transient isolated-worktree failure while a full Webview test run was competing for the same checkout. The exact isolated test passed when rerun alone, and the complete `pnpm test:agent:eval` command subsequently passed. No product fallback or compatibility path was added.

### UI evidence

Direct visual inspection confirmed the final Home selector as a top-centered, four-option segmented control with a muted rail, white selected surface, compact radius, and no overlap with the centered Home content. Earlier interaction in the same authoritative development runtime confirmed:

- Assistant does not show the Workspace chooser.
- Workspace shows the chooser and the visible missing-target reason.
- The Entry execution-mode selector remains visible.
- Blocking send does not disable text editing or the rest of the layout.

The final fresh-window interaction matrix could not be completed. Several local Electron applications share `com.github.Electron`; Computer Use resolved the development application ambiguously and then targeted Electron's default application window rather than the running OpenNeko window. The development build itself launched successfully, but further clicks would not have been authoritative evidence. Character, World, final narrow-layout interaction, reopen, Conversation switching, and background-task isolation therefore remain unchecked UI acceptance items.

### Quality review

- Ownership: experience mode is package-owned Webview presentation state; no cross-runtime contract or durable domain record was introduced.
- Dependency direction: the Webview uses existing host adapters and exact Draft binding projections; no Node or Electron dependency entered the Renderer package.
- Canonical path: all target changes use the existing `bindTarget` and `submitDraft` chain. Workspace validation requires exact workspace identity, grant, and current receipt; no active/current/recent Workspace inference exists.
- User data: invalid non-authoritative mode state is reset locally while valid unsent input remains intact.
- Fail-local behavior: Character and World are visibly unavailable and cannot submit through the generic Agent Draft path; stale bindings block only the current send.
- Accessibility: the selector has an accessible group label and selected state; the blocked-send reason is visible, announced as status, and reused as the send control label.

### Residual risk

The deterministic contract is covered, but the remaining visible Electron matrix and provider-backed Assistant/Workspace first-submit lanes must be run once a uniquely targetable OpenNeko runtime and explicit provider/model/cost authorization are available.
