## Risk And Architecture

- Risk: L2. The change spans Agent Webview presentation and the Electron Main permission boundary.
- Responsibility: `@neko/agent-webview` owns visible message and copy-text projection; Desktop Main owns the exact renderer permission decision.
- Dependency: the Webview remains browser-only and uses `navigator.clipboard`; Main does not import Webview or React code.
- Interface: no IPC, public contract, transcript persistence, or user-data shape changed.
- Canonical path: `MessageActions -> projectMessageCopyText -> navigator.clipboard.writeText`; no clipboard IPC or fallback copy path was added.
- Testing: pure presenter, component, Desktop security, package build, architecture-boundary, and real Electron evidence cover the affected path.

## UI Validation

- Scope: user prompt bubble, unframed Agent answer, inline error diagnostic, and message Copy feedback. Applicable.
- Runtime: the running Electron Desktop product at `localhost:5173`; this crosses the real Chromium clipboard permission boundary.
- Inventory:
  - Open a saved conversation with a long user prompt and Agent answer: the user prompt is right-aligned on a borderless neutral background; Agent output remains unframed; avatars, names, and timestamps remain present.
  - Open a saved failed conversation: the complete provider error appears as a compact inline red diagnostic with no bordered error card.
  - Activate Copy, observe `已复制`, paste into the composer, confirm the exact visible message text, then clear the draft without sending.
  - Reject the clipboard write: the action exposes `复制失败` and the transcript remains usable.
  - Inspect the Workspace Agent rail at its narrow width: prompt, avatar, reply, error, and composer do not overlap or clip.
- Evidence: direct image-capable review of the Electron captures for the normal narrow transcript and the saved provider-error transcript; accessibility state confirmed localized Copy outcomes and the exact pasted value.
- Visual findings: the borderless neutral prompt remains distinguishable from the white transcript; Agent Markdown preserves document hierarchy; the inline error stays readable without dominating the rail; no text or controls overlap in the inspected widths.
- Result: passed for the requested light-theme Desktop path.
- Residual risk: dark theme was not switched during this validation; the changed styles use existing semantic theme tokens, but dark-theme pixels were not independently reviewed.

## Commands

- `pnpm --filter @neko/agent-webview test`: 94 files, 734 tests passed.
- `pnpm --filter @neko/agent-webview build`: passed.
- `pnpm --dir apps/neko-desktop exec vitest run src/main/security.test.ts`: 8 tests passed.
- `pnpm --dir apps/neko-desktop run typecheck`: passed.
- `pnpm check:agent-boundaries`: passed.
- `pnpm check:application-boundaries`: passed.
- `pnpm check:legacy-debt`: passed.
- `openspec validate refine-agent-conversation-presentation --strict`: passed before final documentation sync and rerun as the final gate.
- `pnpm check:unused`: failed on unrelated existing findings: unlisted `jsdom` in the Markdown package test and unused `NODE_DEFAULT_SIZES` in Canvas Webview.
