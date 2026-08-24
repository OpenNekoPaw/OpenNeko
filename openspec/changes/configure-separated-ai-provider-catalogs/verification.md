## Verification results

### Passed

- `pnpm --dir packages/host test -- ai-model-settings-contract.test.ts ai-model-settings-service.test.ts settings/__tests__/workspace-config-manager-authority.test.ts`
  - Host package ran its full suite: 40 files, 366 tests passed.
- `pnpm exec vitest run src/renderer/DesktopSettingsSurface.test.tsx` from `apps/neko-desktop`
  - 1 file, 12 tests passed.
- Focused ESLint over the changed Host and Desktop Settings files passed.
- Host and Desktop TypeScript typechecks passed.
- `pnpm test:agent:eval`
  - 45 files, 314 tests passed; all-suite key-free dry run covered 27 suites and 84 cases.
- Strict OpenSpec validation passed for `configure-separated-ai-provider-catalogs`.

### Repository-state blockers

- The full Desktop test run reached 108 passing files / 695 passing tests, but failed in unrelated dirty files:
  renderer style ownership, two renderer tests importing `node:`, DSH preload hook timing, and two Agent surface
  expectations.
- `pnpm check:legacy-debt` is blocked by unrelated DSH image-preview `shim` matches in Main/preload code.
- `pnpm check:unused` is blocked by pre-existing/worktree-wide Knip debt (unused files, dependencies and exports).
  The scoped change introduces no unused file or dependency; redundant preset helper re-exports were removed.

## UI validation

- Acceptance inventory: separate dialogue/generation add actions; family-specific preset choices; official default
  URL/type/protocol; credential behavior; MiniMax H3/Seedance model templates; save/reopen persistence; adjacent
  dialogue-provider regression.
- Authoritative command:
  `node scripts/run-desktop-ui-functional.mjs --scenario desktop-ai-model-settings --target development`.
- Result: `blocked` before the scenario because an existing development process (PID 29004) owned the Vite bundle.
  It was not terminated because it belongs to the user.
- Report:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-24T20-52-26.788Z-desktop-ai-model-settings-development/report.json`.
- Supplementary visible inspection in that existing Electron process confirmed a readable MiniMax form with exact
  type, suggested ID/name and `https://api.minimaxi.com/v2`, without clipping or overlap. The stale Main process
  rejected the hot-reloaded Renderer payload (`provider.type is invalid`), so this is supporting layout evidence only,
  not clean persistence/runtime acceptance. The form was cancelled without saving and Settings was closed.
- Screenshot:
  `${TMPDIR}/com.openai.sky.CUAService/Electron Screenshot 2026-08-25 at 4.55.29 AM.jpeg`.

## Provider documentation check

- MiniMax H3 uses the official `POST https://api.minimaxi.com/v2/video_generation` contract and model identity
  `MiniMax-H3`.
- Seedance uses the official Ark API base `https://ark.cn-beijing.volces.com/api/v3` and the supported model identity
  `doubao-seedance-2-0-260128`.
- Online account model discovery and real paid generation remain out of scope for this change.
