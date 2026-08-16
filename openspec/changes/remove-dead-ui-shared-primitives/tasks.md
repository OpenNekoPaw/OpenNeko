## 1. Delete dead shared-primitives

- [x] 1.1 Delete `Toolbar.tsx`, `CollapsibleSection.tsx`, `Panel.tsx`, `ContextMenu.tsx`, `TimelineRuler.tsx`, `ProgressBar.tsx`, `MacButton.tsx`, `MacIconButton.tsx`, `MacSlider.tsx`, `MacTabs.tsx` from `packages/ui/src/shared-primitives/`.

## 2. Trim the barrel and subpath

- [x] 2.1 Rewrite `shared-primitives/index.ts` to re-export only the live resize/drag/drop primitives and their types.
- [x] 2.2 Remove the `./shared-primitives` subpath from `packages/ui/package.json` `exports`.

## 3. Verification

- [x] 3.1 `@neko/ui` typecheck/build and tests; `preview-webview` typecheck/build and tests.
- [x] 3.2 `pnpm check:shared-exports`, `check:unused`, `check:openspec`, `check:webview-boundaries`.
- [x] 3.3 Desktop typecheck (UI consumers).
