## Verification

### Passed

- `pnpm exec openspec validate align-light-theme-semantic-contrast --strict`
- `pnpm --filter @neko/ui test -- src/primitives/button.test.tsx`
- `pnpm --filter @neko/chara-webview test -- src/architecture-boundary.test.ts`
- `pnpm --filter @neko/world-webview test -- src/management-theme.test.ts`
- `pnpm --filter @neko/agent-webview test -- src/components/ChatView/InputArea/DropdownOverlayContract.test.tsx`
- Full package tests: Character 27, World 11 and Agent 59 tests passed.
- `@neko/ui` full package run passed 225 of 226 tests; the only failure is the unrelated pre-existing Agent critical-file inventory assertion.
- Character, World and Agent typechecks passed.
- `pnpm check:webview-boundaries`
- Prettier check for every changed source, test and OpenSpec file.

### Baseline blockers

- `@neko/ui` typecheck remains blocked by existing errors in `src/workbench/editor-workbench.test.tsx` around `parentElement` and `closest`; neither file nor contract is touched by this change.
- `pnpm check:package-boundaries` reaches the repository checker but fails on the concurrent, unrelated undeclared `@neko/ai-contracts` import in `apps/neko-desktop/src/renderer/DesktopSettingsSurface.tsx`.

The focused tests, affected package suites and Webview boundary check provide direct coverage for this presentation-only change. No user data, IPC, package dependency or runtime lifecycle contract changed.
