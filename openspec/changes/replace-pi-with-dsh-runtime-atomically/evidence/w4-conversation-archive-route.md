# W4 Conversation Archive Route Evidence

## Evaluation Scope

- Change/feature: replace the unsupported Conversation delete route with DSH Workspace archival while preserving the OpenNeko UI composition.
- Decision: lifecycle/projection acceptance requires a focused visible Desktop run; deterministic coverage is recorded below and the real-UI disposition is tracked by `archive-dsh-conversations`.
- Canonical path: OpenNeko archive control -> typed preload request -> registered Main handler -> Desktop sender/Window resolution -> Host authoritative Agent Home navigation validation -> package-owned Conversation archive application -> strict OpenNeko ACP extension -> official DSH `workspaceRegistry.archiveSession`.
- Forbidden fallback: raw DSH Session files, private DSH APIs, `session/close` as archive, OpenNeko metadata-only hiding, Pi runtime, retained delete channels or destructive SQLite/catalog mutation.

## Deterministic Coverage

- Host service tests prove the complete navigation set is revalidated before archive authority is invoked and no invocation occurs after validation failure.
- Shell service tests prove owner-qualified Conversation identities resolve only from the authoritative Agent Home projection.
- Desktop IPC test proves the exact `openneko:desktop:home:conversation:archive` channel is always registered, preserves sender identity and is removed during teardown; poison assertions reject both retired delete channels.
- Agent runtime tests prove exact DSH Session binding, idempotent DSH archive projection, Home filtering and retention of the OpenNeko catalog record.
- DSH bridge tests prove storage/workspace composition is mandatory and no `session/delete` extension is registered.

## Verification

- `pnpm --dir packages/host exec vitest run src/desktop-project-registration-service.test.ts src/desktop-shell-service.test.ts`
- `pnpm --dir apps/neko-desktop exec vitest run src/main/ipc-conversation-archive.test.ts`
- `pnpm --dir packages/agent/runtime exec vitest run src/application/dsh-domain-conversation-service.test.ts`
- `pnpm typecheck:desktop`
- `pnpm --dir apps/neko-desktop exec vite build --config vite.main.config.ts --ssr src/main/index.ts --outDir .vite/build`
- `pnpm exec openspec validate replace-pi-with-dsh-runtime-atomically --strict`
- `pnpm check:openspec`

The broader package runs passed with Host `38 files / 324 tests`, Agent runtime `51 files / 350 tests`, and Desktop `102 files / 608 tests`. The archive-specific Desktop Main build and profile-closure results are recorded by `archive-dsh-conversations`.

## Residual Risk

Unarchive remains unavailable in the locked DSH public surface. Permanent deletion is intentionally absent: catalog, binding, Session, transcript and artifact data remain intact, while archived Conversations are omitted from Agent Home based on DSH archive authority.
