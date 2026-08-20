# W1 Conversation Publication Evidence

Date: 2026-08-19

## Scope

- Native Desktop creation starts from the exact sender-bound Agent Surface.
- DSH remains the only Session and transcript authority.
- Host metadata owns only Conversation catalog/context and exact Conversation-to-DSH-Session binding.
- Real provider/API prompting was intentionally not executed for this development step.

## Canonical Path

1. Reserve Host Conversation catalog metadata and exact domain context in one SQLite transaction.
2. Call public ACP `session/new`.
3. Call public ACP `session/close` to flush the provisional Session.
4. Call public ACP `session/resume` to prove the Session can reopen.
5. Scan the complete bounded ACP `session/list` catalog and reject missing, duplicate, or cyclic results.
6. Persist the unique Conversation-to-DSH-Session binding.
7. Attach the exact draft scene only after durable publication.
8. After a DSH process restart, load the exact bound Session once through the package-owned activation owner before projecting it.

There is no Pi, SDK, Remote API, active/recent Session, provider, cwd, or Renderer-supplied domain-authority fallback.

## Deterministic Verification

- `pnpm --filter @neko/agent-contracts typecheck`
- `pnpm --filter @neko/agent-contracts test`: 41 files, 213 tests passed.
- `pnpm --filter @neko/agent-runtime typecheck`
- `pnpm --filter @neko/agent-runtime test`: 46 files, 358 tests passed.
- `pnpm --filter @neko/app-desktop typecheck`
- `pnpm --filter @neko/app-desktop test`: 98 files, 556 tests passed.
- `pnpm check:agent-boundaries`
- `pnpm check:application-boundaries`
- `pnpm check:package-boundaries`
- `pnpm check:storage-authorities`
- `pnpm check:legacy-debt`
- `pnpm exec openspec validate replace-pi-with-dsh-runtime-atomically --strict`
- `pnpm check:openspec`: 106 items passed.
- `pnpm test:agent:eval`: 45 files, 314 tests and 26 suites / 65 cases dry-run passed.

Focused tests cover catalog reopen/rollback/invalid sibling isolation, Home bound/unpublished/invalid records, publication order and failure retention, activation concurrency/reset/retry, strict create contract, preload sender injection, Main sender mismatch, and Renderer creation.

## Desktop UI Evidence

Authoritative runtime: the real development Electron product with the verified local DSH closure.

- Initial Agent Surface exposed the localized `New conversation` / `新建会话` control.
- Normal user click increased the durable Conversation catalog from three unavailable records to four records.
- The new record was enabled and the Agent Surface changed to the empty DSH composer.
- Multiple Main/DSH development restarts completed; reopening the enabled record restored the empty composer without runtime diagnostics.
- Existing failed records stayed visible with local `Conversation publication has no DSH Session binding` diagnostics and did not block the valid sibling.
- No provider prompt was submitted.

Functional accessibility evidence passed. Direct Computer Use screenshot pixels remained on the prior unbound frame while the same capture's accessibility tree showed the composer, so post-create visual evidence is classified as blocked rather than passed. The initial 1228x768 empty state showed no clipping, overlap, or button text overflow.

## Remaining Blockers And Risk

- DSH rc.7 has no public `session/delete`; exact provisional cleanup after pre-publication failure remains blocked. `session/close` is used only for flush and is not treated as deletion.
- Scene-attach failure preserves the durable catalog by ordering, but a dedicated Desktop integration assertion remains to be added.
- Real provider turn, transcript content replay, permission, cancellation, inbox, and Tool behavior were not executed in this step.
- `pnpm check:no-internal-versioning` remains blocked by generated development-runtime third-party version inventories, existing legacy-data fixtures, and stale allowances; no new finding points to this implementation.
- `pnpm check:unused` reports six unused files and 182 unused exports; none of the new Conversation publication files are reported. The remaining findings are repository-wide public-surface/debt items, not this publication slice.
