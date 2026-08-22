# Validation Evidence

## Deterministic and build gates

- Agent contracts: `32 files / 179 tests` passed; focused DSH ACP codecs: `10 tests` passed.
- DSH bridge: `4 files / 30 tests` passed; focused profile/registration coverage: `19 tests` passed.
- Agent runtime: `52 files / 354 tests` passed; binding/archive/stale-cleanup focused coverage: `30 tests` passed.
- Host: `38 files / 324 tests` passed.
- Project Webview: `2 files / 13 tests` passed.
- Desktop: `102 files / 609 tests` passed; sender-bound archive IPC poison coverage: `2 tests` passed.
- Typecheck passed for `@neko/agent-contracts`, `@neko/dsh-bridge`, `@neko/agent-runtime`, `@neko/project-webview` and `@neko/app-desktop`. Host is compiled through the Desktop consumer and has no package-local typecheck script.
- Focused ESLint and Prettier checks passed.
- Desktop Vite Main/Renderer build passed (`1354 modules transformed`).
- DSH development runtime closure rebuilt successfully for `darwin-arm64`.
- Runtime-closure, development-runtime and Desktop functional-runner orchestration contracts passed (`21 tests`).
- Application, Agent and Webview boundary gates passed.
- Storage authority and canonical legacy-debt gates passed.
- `openspec validate --all --strict` passed (`116 items`).

The stale-record regression path additionally proves that a user archive request removes the exact
catalog/context/binding tuple only after a complete DSH `session/list` establishes that the bound
Session no longer exists. A valid Session still invokes only DSH archive and retains local records;
an exact-binding race or a later missing owned record rolls the SQLite transaction back, while sibling
records remain unchanged.

## Real DSH profile

`pnpm --dir scripts/dsh-q0 qualify` reached and passed the new assertions that:

1. archive the exact live Session through `openneko/session/archive`;
2. repeat the command without adding a duplicate;
3. restart the DSH process; and
4. recover the same exact archive set through `openneko/session/archive/read`.

The broader Q0 run later failed at its pre-existing `session/load` committed-history replay assertion: `OpenNeko DSH bridge did not replay committed history through session/update`. This occurs after archive persistence/restart validation and is not reported as an archive pass for the full Q0 suite.

## Repository-wide blockers outside this archive path

- `check:no-internal-versioning` remains blocked by the existing dirty-worktree baseline: 16 stale allowances and 77 new occurrences across unrelated DSH cutover/content/fixture work. The archive contracts add no generation/version discriminator.
- `check:deps` remains blocked by three existing `agent-runtime-no-chara-domain` imports in Character Host adapter work. The archive application and Host/Desktop route add no Character-domain dependency.

## Retired path audit

Production Agent/Desktop/Host/Project Webview and functional-scenario sources contain no retired Conversation delete channel, contract, method, UI label or compatibility alias. Poison assertions retain the old channel literals only as negative test inputs, and OpenSpec names the retired symbols only as replacement evidence.
