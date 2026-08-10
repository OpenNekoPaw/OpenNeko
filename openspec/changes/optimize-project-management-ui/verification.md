# Verification

Date: 2026-08-10

## Quality Review

- Risk: L1 Renderer presentation and interaction change.
- Finding: no blocking or suggested code findings in the scoped Project Management diff.
- Ownership: Desktop Renderer still owns only the current Window presentation and exact scene intent. `@neko/host` still owns Project registration removal and Workspace resolution; `@neko/agent-runtime` still owns Conversation deletion.
- Canonical path: an available Project has one native-button `onOpen(projectId)` path. The removed selection helpers, selected-row state, batch toolbar, double-click path and selection i18n/CSS are absent. Grid/list `aria-pressed` state is limited to the view controls.
- User data: no contract, IPC, filesystem operation, Project fact or Conversation lifecycle implementation changed. Project removal preserves Conversations and files; Conversation cleanup preserves the Project registration and files. No combined lifecycle operation was added.

## Static And Focused Evidence

- `pnpm exec prettier --check <scoped files>`: passed.
- `pnpm exec eslint <scoped files>`: passed after removing one stale test helper left by the deleted selection tests.
- `pnpm --filter @neko/app-desktop exec vitest run src/renderer/DesktopProjectManagementSurface.test.tsx src/renderer/DesktopApplication.test.tsx src/renderer-styles.test.ts`: passed, 3 files and 77 tests.
- `pnpm --filter @neko/app-desktop typecheck`: passed.
- Isolated `vite build --config vite.renderer.config.ts --outDir /tmp/openneko-project-ui-renderer.70LKWj/out`: passed without writing the active `.vite` bundle. Existing browser-external and chunk-size warnings remain outside this Project Management change.
- `pnpm check:openspec`: passed, 75 items.
- `pnpm check:legacy-debt`: passed with zero blocking debt surfaces.
- `git diff --check`: passed.
- `pnpm check:unused`: failed on unrelated existing workspace findings: unlisted `jsdom` in `packages/markdown/src/browser/milkdown-rich-surface.test.tsx` and unused `NODE_DEFAULT_SIZES` in `packages/canvas/webview/src/utils/nodeFactory.ts`.

The full `pnpm --filter @neko/app-desktop build` was not run because development process `37957` owns the checkout's `.vite` bundle. Stopping that user-owned process or overwriting its bundle was intentionally avoided.

## Advisory UI Validation

- Scope: applicable to Project Management navigation, view controls, Project cards, unavailable diagnostics and item-level lifecycle confirmations.
- Authoritative runtime: the required isolated Electron development scenario was attempted but blocked before CDP startup because process `37957` already owns the development bundle. The existing real Electron development app was then exercised through normal user-operable controls as supplemental runtime evidence; destructive confirmations were cancelled.

| Inventory item                       | Observable evidence                                                                                                                    | Result                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Fresh Project Management entry       | Grid view reports pressed; no selection or batch toolbar appears                                                                       | Passed in running Electron |
| Available Project activation         | One click on `neko-test` opens its exact Workspace; returning remounts the grid                                                        | Passed in running Electron |
| Explicit list switch                 | Same two Project records remain; no open, selection or mutation occurs                                                                 | Passed in running Electron |
| Unavailable Project                  | Record and diagnostic remain visible; open and Conversation cleanup are disabled; removal remains reachable                            | Passed in running Electron |
| Project removal semantics            | Confirmation states that Conversations and Project files are preserved; operation cancelled                                            | Passed in running Electron |
| Conversation cleanup semantics       | Confirmation states that 34 Workspace Conversations are permanently deleted while Project and files are preserved; operation cancelled | Passed in running Electron |
| Wide and compact layout              | Cards, diagnostics, controls and item actions remain readable and reachable without overlap at wide and 800 px windows                 | Passed in running Electron |
| Isolated automated Electron scenario | Development target could not start beside PID `37957`; packaged artifact did not expose a CDP target                                   | Blocked                    |

### Visual Evidence

- `evidence/project-grid-wide.jpg`: wide fresh grid without action-area dividers, with unavailable diagnostic containment and both item actions.
- `evidence/project-list-wide.jpg`: explicit list state with aligned rows and reachable actions.
- `evidence/project-grid-compact.jpg`: 800 px window with contained cards, diagnostics and actions.
- `evidence/project-remove-confirmation.jpg`: distinct Project removal confirmation preserving Conversations and files.

Direct pixel review found no overlap, clipping, unstable card sizing, unreadable controls or hidden item actions. The grid card action area uses whitespace without a horizontal divider, while the actions remain aligned at the lower right. The long unavailable diagnostic is truncated inside its card instead of resizing or covering adjacent content. The active app also displayed an unrelated fail-visible settings reset banner after a later window resize; it did not obscure Project controls.

## Result And Residual Risk

- Code quality review: passed for the scoped L1 change.
- Advisory UI validation: blocked overall because the required isolated Electron scenario could not run, despite the supplemental real Electron functional and visual checks passing.
- Residual risk: isolated scenario assertions and a full Desktop package build remain unexecuted until the existing development bundle owner exits. The packaged attempt reports are:
  - `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-10T10-44-36.471Z-no-active-project-catalogs-development/report.json`
  - `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-10T10-55-43.658Z-no-active-project-catalogs-packaged/report.json`
