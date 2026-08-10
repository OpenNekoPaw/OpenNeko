## Risk And Architecture

- Risk: L1. The change is local to the Agent composer textarea measurement and presentation.
- Package role: `@neko/agent-webview` remains the L2 browser-only UI owner.
- Responsibility: the controlled draft remains authoritative; `InputArea` owns DOM measurement and CSS owns the responsive height budget.
- Dependency: no Desktop Main, preload, IPC, Agent runtime, persistence, or user-data boundary changed.
- Canonical path: direct input, paste, controlled restoration, deletion, send, and clear all use the existing `resizeTextarea` path.
- Coupling: no React/global state, observer, shared layout service, or second sizing path was added.

## UI Validation

- Scope: the Agent composer in the narrow Workspace Agent rail and the wider start-creation entry. Applicable.
- Runtime: the real visible Electron Desktop product, because it provides the authoritative Chromium textarea layout and scrollbar rendering used by the shipped UI.
- Inventory:
  - Enter a short draft: the textarea keeps its compact default height and no scrollbar is visible.
  - Enter eight lines in the narrow Agent rail: the textarea grows to reveal all lines without moving or overlapping composer controls.
  - Enter thirty lines: growth stops at the responsive maximum, a thin vertical scrollbar appears, and scrolling reaches later lines.
  - Replace the long draft with one line and then clear it: the textarea returns to its compact height and the scrollbar disappears.
  - Repeat long-content entry on the start-creation surface: the textarea grows, then scrolls, while model, approval, and send controls remain usable.
  - Adjacent risk: transcript space, bottom controls, and narrow-panel containment remain coherent throughout the cycle.
- Evidence: direct image-capable inspection of each visible Electron state plus user-operable typing, selection, and textarea scrolling. Test drafts were cleared without sending.
- Visual findings: the narrow rail showed eight lines without clipping; thirty lines capped at roughly twelve visible lines with a clear scrollbar; scrolling moved the visible range from lines 1-12 to lines 13-24; shrinking and clearing caused no overlap or layout jump. The start-creation surface retained aligned model, approval, and send controls.
- Result: passed for the requested light-theme Desktop path.
- Residual risk: dark-theme pixels were not independently reviewed. The scrollbar uses existing semantic Agent foreground tokens, but this remains unverified visually.

## Commands

- `pnpm --filter @neko/agent-webview exec vitest run src/components/ChatView/InputArea/InputArea.test.tsx`: 53 tests passed.
- `pnpm --filter @neko/agent-webview test`: 94 files, 735 tests passed.
- `pnpm --filter @neko/agent-webview build`: passed.
- `pnpm check:agent-boundaries`: passed.
- `pnpm check:legacy-debt`: passed.
- `openspec validate improve-agent-composer-autogrow --strict`: passed before final verification-document sync and rerun as the final gate.
- `git diff --check`: passed.
- `pnpm check:unused`: failed only on unrelated existing findings: undeclared `jsdom` in the Markdown package test and unused `NODE_DEFAULT_SIZES` in Canvas Webview.
