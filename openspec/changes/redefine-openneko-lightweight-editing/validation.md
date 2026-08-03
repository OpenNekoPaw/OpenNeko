# Validation status

Updated: 2026-08-03

P0 and deterministic P1 implementation now use the canonical Desktop Main → `@neko/cut-node` →
`@neko/cut-domain` path. Desktop retains authorization, concrete file/process/resource adapters and
Workbench projection only. `CutApplicationRuntime` owns document/session/command, preview and ExportJob
lifecycle; OTIO persistence uses `NodeAuthorizedWorkspaceWriter`.

Fresh evidence:

- `pnpm --parallel --filter @neko/cut-domain --filter @neko/cut-node --filter @neko/preview-domain test`
  passed 50 + 11 + 24 tests.
- `pnpm --filter @neko/app-desktop test` passed 315 tests.
- `pnpm test:local:ui --scenario=cut-openneko-consumer --target=development` passed an isolated real
  Electron scenario covering new-target create, explicit-target append, manual mute/separate/unseparate,
  cross-Clip playback/seek, mixed audio, dirty immutable-revision export, later edit, save/reopen,
  multi-document isolation and old resource-generation release.
- `pnpm ci:local`, `pnpm check:legacy-debt`, `pnpm test:agent:eval` and strict OpenSpec passed.

The delayed-audio export defect found during acceptance is fixed by anchoring the mix to full-timeline
silence before two-pass loudness normalization. A Node regression test asserts the filter path; export
failure is also projected to the Host diagnostic sink while the renderer retains the stable typed
diagnostic code.

The change remains open for task 4.2 real-provider evidence (external authorization required) and task
5.2 P2 qualification for high-frequency playhead, theme, ExportJob restart/cancel and save-as/backup/revert.
