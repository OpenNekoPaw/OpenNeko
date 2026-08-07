## Verification Summary

- Risk: L3, Agent workflow and user-global operational persistence.
- Result: implementation and direct lease evaluation passed. The renamed-field path is absent and no
  product migration, repair, table replacement, column dispatch, or alternate reader was introduced.
- UI validation applicability: visual validation is not applicable because no Renderer layout or
  interaction changed. A visible Electron first submit was still required and passed.

## Canonical Storage Evidence

- The focused regression failed before the implementation with
  `table pi_execution_leases has no column named lease_id` and passed after the implementation.
- The regression initializes only the established stable fields, writes a new lease/checkpoint through
  `NodePiConversationAuthority`, and proves an unrelated conversation, lease, and checkpoint row remain
  unchanged.
- Pi authority/runtime/catalog coverage: 3 files, 32 tests passed.
- Agent application and Desktop consumer coverage: 3 files, 79 tests passed.
- The test repositories use `mkdtemp` roots or injected mock ports; they do not open the user database.

## Runtime Evidence

Visible Electron acceptance used the native `~/.neko/config.toml` and the actual Entry composer with
`nekoapi-chat / gpt-5.6-luna`. Conversation
`conversation:07368b63-11c3-4c3c-8fdb-407090ecb37c` rendered the exact response, returned to zero pending
items, and persisted turn `turn:773472f4-0397-4483-83dc-84a593a2bd08` as `completed`. The lease and
checkpoint stored the same opaque integer identity. No SQLite, renderer, or provider error was logged.

Real-provider evaluation
`agent-runtime.workflow-controller/conversation-idle-continuation` passed after remaining idle for
35 seconds, longer than the 30-second lease TTL. Both turns retained conversation
`pt0q1ue3-01KZD66AZPGFKTM950MWC08NZV`; runtime, Pi runtime, order, terminal-idle, and final-answer hard
gates passed with zero runtime errors and zero retries. Local redacted reports are under
`reports/agent-eval/repair-canonical-pi-lease-idle-2026-08-07/`.

## Commands

- `pnpm --filter @neko/agent-runtime exec vitest run src/pi/__tests__/node-conversation-authority.test.ts src/pi/__tests__/conversation-runtime.test.ts src/pi/__tests__/node-conversation-catalog-reader.test.ts`
- `pnpm --filter @neko/agent-runtime typecheck`
- `pnpm --filter @neko/agent-runtime exec vitest run src/application/agent-app-host.test.ts src/application/agent-conversation-lifecycle-service.test.ts`
- `pnpm --dir apps/neko-desktop exec vitest run src/main/app-host.test.ts`
- `pnpm check:no-internal-versioning`
- `pnpm check:storage-authorities`
- `pnpm check:legacy-debt`
- `pnpm check:agent-boundaries`
- `pnpm check:openspec`
- `pnpm check:unused`
- `pnpm build`
- `pnpm test`
- `pnpm check`
- `git diff --check`

All commands passed. `check:unused` emitted 74 existing configuration hints and no blocking finding.

## Residual Risk

The broader `conversation-persistence-resume` evaluation completed its first durable turn but failed
after its owner restart because the resumed conversation was not reopened in the Workspace controller;
the second submit had no observed turn identity within 120 seconds. This is a separate controller
rebind defect: it did not emit a SQLite/lease failure, and the same-runtime cross-TTL lease case passed.
The failed local evidence remains under
`reports/agent-eval/repair-canonical-pi-lease-2026-08-07/` for follow-up.

Visible acceptance intentionally created one ordinary Assistant conversation and one checkpoint in the
user database. No pre-existing row was rewritten except ordinary lease expiry/renewal behavior, and no
conversation, project, media, configuration, or credential data was deleted.
