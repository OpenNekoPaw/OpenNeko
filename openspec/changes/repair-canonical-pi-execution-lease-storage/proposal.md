## Why

The Pi conversation runtime renamed stable SQLite lease and checkpoint columns from `epoch` fields to
`lease_id` fields. Existing user databases therefore fail on the first Agent submit even though their
conversation transcripts and operational records remain valid.

## What Changes

- Restore the single Pi lease/checkpoint repository path to the stable persisted column names without
  schema dispatch, migration, repair, table replacement, or dual read/write behavior.
- Treat the persisted integer lease value as an opaque exact lease token; code must not compare its
  order, increment it as a generation, or use it as a schema/component version.
- Keep the public runtime contract identity-based while preserving existing lease and checkpoint rows
  unchanged.
- Add isolated SQLite regression coverage proving an existing canonical database can acquire a lease,
  submit/checkpoint a turn, and preserve sibling conversation data.
- Verify the real Desktop first-submit path and the repository's no-internal-versioning, storage,
  legacy-debt, and OpenSpec gates.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-storage-authority`: Clarify that exact request-owned lease fencing preserves the established
  stable SQLite fields while exposing opaque identity semantics instead of writer-generation semantics.

## Impact

- Owning responsibility: Pi conversation operational state and concurrency fencing owned by
  `@neko/agent-runtime`.
- Affected package role: `packages/agent/runtime` Node runtime repository and its producer tests;
  `apps/neko-desktop` remains the thin consumer/composition root and requires no business logic.
- Public behavior: existing local conversations can start and checkpoint Agent turns again; unrelated
  invalid records remain isolated and fail visibly at their owning identity.
- User data: no product migration, automatic repair, table rebuild, row rewrite, or database reset.
  Existing transcript, conversation, branch, checkpoint, project, media, and configuration data stays
  untouched.
- Dependencies: no new runtime dependency or alternate storage path.
