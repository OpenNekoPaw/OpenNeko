# P0 Resource Ingest Validation

Date: 2026-08-20

## Deterministic Evidence

- Assets Node: 20 files / 99 tests passed, including exact membership, regular-file containment,
  no-overwrite copy and symlink rejection. Materialization is one request-scoped copy; there is no
  unconsumed cancellation or background-task lifecycle.
- Agent contracts: 41 files / 222 tests passed.
- Agent Webview: 3 files / 33 tests passed, including materialization pending state, editable draft,
  blocked submit, newer-draft preservation and Conversation isolation.
- Desktop: 99 files / 587 tests passed, including sender-bound Composer materialization, Session Host and
  preload bridge delegation.
- `@neko/assets-domain`, `@neko/assets-node`, `@neko/agent-contracts`, `@neko/agent-webview` and
  `@neko/app-desktop` typechecks passed.
- `pnpm check:agent-boundaries`, `pnpm check:legacy-debt`, focused ESLint, both strict OpenSpec validations
  and `git diff --check` passed. Focused ESLint reported only two existing non-null assertion warnings in
  `InputArea.tsx`.
- Full strict OpenSpec validation passed for 110 items.
- `pnpm check:deps` remains blocked by three pre-existing `agent-runtime-no-chara-domain` violations in
  `dsh-domain-tool-handlers.ts`, `dsh-acp-application-client.ts` and `character-host-adapter.ts`. None of
  those files changed in this resource-ingest work; the Character Tool dependency boundary remains an
  independent P1 architecture task rather than a reason to couple Chara into Assets.

## Visible Desktop Evidence

The current worktree was rebuilt and launched through `pnpm dev:desktop -- --remote-debugging-port=9333`.
Process inspection confirmed that Electron, Renderer and the DSH child all came from the current
`8ecc/OpenNeko` worktree; the DSH child used
`apps/neko-desktop/.dsh-development-runtime/darwin-arm64/payload`, not system Node or global DSH.

Computer Use opened the current `Blame` Workspace Composer and entered `@` through the user-visible input.
The authoritative menu showed one Workspace file and six linked Media documents. Direct pixel inspection of
[`authoritative-at-menu.png`](authoritative-at-menu.png) confirmed the existing menu component, source labels,
badges and Composer placement rendered without clipping or overlap. Search itself created no Workspace file.

The required Asset selection case is `infrastructure-blocked`:

- `~/.neko/assets` contains no selectable Asset membership fixture.
- The current Workspace and its linked Media are valid, but they cannot stand in for an Asset membership.
- Validation did not write a synthetic Asset into the user library or mutate durable metadata merely to
  obtain a passing result.

The visible selection, copied Workspace file, ACP resource link and real-provider response therefore remain
unverified. Deterministic tests prove the canonical implementation path but do not replace this Agent/UI
acceptance evidence.

An attempted keyboard selection during validation was interpreted as a submit by the automation layer and
started an unrelated turn. The turn was cancelled through the visible stop control and reached canonical
`aborted`; it is not counted as Agent behavior evidence. Existing duplicate React-key warnings from replayed
historical Tool events were also observed and remain outside this resource-ingest change.
