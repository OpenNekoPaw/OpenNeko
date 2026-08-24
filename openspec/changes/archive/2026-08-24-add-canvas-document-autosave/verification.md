## Implementation result

- Canvas Host runtime session now owns one 800 ms trailing document autosave scheduler and serializes it with existing Host intents.
- `replace-document` atomically carries current removed-node evidence; `save` is a parameter-free immediate flush of the same pending state.
- Automatic and explicit save clear dirty state and deletion evidence only after successful persistence. Background failure remains local, dirty and visible through a Canvas save diagnostic.
- Drag preview and presentation-only changes remain outside durable document mutation; gesture end and authoritative node/content changes enter the scheduler.

## Verification

Passed:

- `pnpm --dir packages/canvas/domain test` — 38 files, 317 tests.
- `pnpm --dir packages/canvas/domain typecheck`.
- `pnpm --dir packages/canvas/webview exec vitest run src/host-runtime/contract.test.ts src/host-runtime/canvas-webview-host.test.ts src/hooks/useCanvasHostMessages.test.tsx src/components/InfiniteCanvas.multi-selection.test.tsx` — 4 files, 44 tests.
- `pnpm --dir packages/canvas/webview exec vitest run src/host-runtime/canvas-webview-host.test.ts src/hooks/useCanvasHostMessages.test.tsx src/components/InfiniteCanvas.multi-selection.test.tsx` — 3 files, 37 tests after the duplicate-success-notification review fix.
- `pnpm --dir packages/canvas/webview test` — 70 files, 444 tests.
- `pnpm --dir packages/canvas/webview build`.
- `pnpm --dir apps/neko-desktop exec vitest run src/main/desktop-canvas-runtime.test.ts` — 29 tests.
- `pnpm --dir apps/neko-desktop typecheck`.
- `pnpm exec openspec validate add-canvas-document-autosave --strict`.
- `pnpm check:openspec` — 142 items passed.
- `pnpm check:webview-boundaries`.
- `pnpm check:application-boundaries`.
- Scoped Prettier check for the OpenSpec and touched Canvas/Desktop files.
- An isolated worktree created from the staged Git tree passed the focused Domain tests (29), Webview tests (44), Desktop tests (29), all three affected package typechecks, and strict validation of this OpenSpec change. Its workspace dependencies were linked independently with an offline frozen-lockfile install so unstaged DSH/Agent changes could not participate.

Repository-wide `pnpm check:no-internal-versioning` did not pass because the shared dirty worktree contains 81 unrelated DSH/Agent findings and stale allowlist entries. The output did not identify this autosave change's scoped Canvas files. Those unrelated changes were preserved and not repaired from this change.

## UI validation

- **Scope:** applicable. User-visible behavior includes Markdown/node edits becoming durable, drag finalization, viewport-only interaction remaining document-clean, and a non-blocking save-failure alert.
- **Runtime:** the authoritative runtime is the isolated Electron Desktop scenario because durable save crosses Webview, Canvas Host session and Desktop file authorization/atomic replacement.
- **Inventory:** continuous Markdown edits should coalesce to the latest save; pointer movement should remain preview-only and pointer release should commit; pan/zoom should not invoke NKC save; save failure should leave the loaded Canvas usable and show an alert; a later successful save should clear the alert. Existing Canvas loading, Markdown preview and node interaction are adjacent behavior at risk.
- **Functional evidence:** domain fake-timer tests passed for coalescing, explicit flush, failure/retry, presentation exclusion and disposal; Webview Host/hook tests passed for canonical message flow and failure/recovery feedback; multi-selection interaction test passed and proves pointer movement does not call the commit callback before pointer release; Desktop runtime tests passed for authorized NKC persistence, conflict rejection and atomic temporary-file replacement.
- **Visual evidence:** unavailable. `pnpm test:local:ui --scenario canvas-openneko-consumer` was blocked before scenario execution because an existing Desktop process already owned this checkout's Vite bundle. The runner therefore could not create current screenshots or exercise the save-failure visual state. Failure evidence: `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-22T08-59-58.489Z-canvas-openneko-consumer-development/report.json`.
- **Visual findings:** none can be claimed because no current pixels were produced. The alert's DOM, theme tokens, localized title and state transitions are covered structurally and by hook tests only.
- **Result:** blocked (advisory); the required Desktop visual/runtime evidence was not produced.
- **Residual risk:** the alert's actual placement/readability and end-to-end timer-to-disk behavior remain unobserved in a live Desktop run. Re-run the scenario after the existing development Desktop process releases the checkout bundle, and add a dedicated autosave failure fixture if release acceptance requires pixel evidence for the alert.

## Quality review

- **Risk:** L2. The change modifies a package-owned cross-runtime contract and user-data persistence policy across Canvas domain, Webview and Desktop tests.
- **Architecture:** the domain session remains the single save-policy owner; Webview projects edits and deletion evidence; Desktop remains the only authorized file-I/O adapter. No Node/Electron import was added to the Webview and no second save implementation was introduced.
- **Contract:** producer, parser, consumer and fixtures use one canonical `replace-document.removedNodeIds` plus parameter-free `save` shape. NKC persisted data shape is unchanged.
- **Async and user data:** timer work enters the existing per-session operation queue; later mutations reset the pending timer; persistence is atomic at the Desktop adapter; failure keeps dirty state and deletion proof. Review found and fixed a duplicate explicit-save success notification.
- **Findings:** no remaining blocking or scoped suggestion after the duplicate-notification fix.
- **Residual risk:** separate sessions editing the same document still lack full shared-owner/CAS coordination, and abnormal exit inside the 800 ms interval is not crash-journaled. Normal View-close flush is also outside this change's lifecycle contract.
