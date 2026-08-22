## Context

`@neko/agent-runtime` owns Pi conversation transcripts, operational leases, and turn checkpoints. The
shared user database already contains stable `pi_execution_leases` and `pi_turn_checkpoints` tables.
Their established integer lease columns were renamed in production source on 2026-08-06, so
`CREATE TABLE IF NOT EXISTS` leaves the existing tables intact while later writes address columns that
do not exist. The first Agent submit consequently fails before a conversation runtime can start.

The local-storage policy forbids product migrations, automatic repair/rebuild, table generations,
alternate readers, and destructive user-data rewrites. It also requires stable persisted field names.
The existing integer values are operational fencing identities, not user-managed content and not a
valid reason to invalidate conversation or checkpoint records.

### Five-layer analysis

- **Responsibility:** the package-owned Pi authority decides lease acquisition, fencing, and checkpoint
  identity. Desktop only invokes the package public application path.
- **Dependency:** the implementation depends on Node SQLite and process-local randomness, not Electron.
- **Interface:** the runtime continues to expose an exact opaque `leaseId`; physical SQLite field names
  remain repository-private.
- **Extension:** there is one stable repository shape and one lease algorithm. No release, schema, or
  old/new path selects behavior.
- **Testing:** isolated temporary databases prove the producer path; existing Desktop application tests
  and a real visible first submit prove the consumer path.

## Goals / Non-Goals

**Goals:**

- Make existing and newly created user databases use the same stable Pi lease/checkpoint tables.
- Preserve exact stale-writer rejection without exposing an ordered generation counter.
- Leave every existing row and all unrelated local authorities unchanged during initialization.
- Prove the Agent first-submit path no longer fails on the established table shape.

**Non-Goals:**

- No product migration, offline repair command, schema/table version, compatibility branch, or fallback.
- No deletion, table replacement, row conversion, or database reset.
- No change to Pi transcript, conversation, branch, project, media, configuration, or credential data.
- No Desktop-owned storage or Agent business logic.

## Decisions

### Preserve stable physical fields and expose an opaque lease identity

The repository will use the established integer fields in both tables. `ConversationExecutionLease`
continues to expose `leaseId: string`; the repository converts the stored safe integer to its canonical
decimal representation. The number is equality-only: it is never ordered, incremented, or used to
select a data/component implementation.

On a new claim or takeover, the owner generates a non-zero random safe integer distinct from the
immediately replaced claim. `BEGIN IMMEDIATE` remains the serialization boundary. Renewal keeps the
same token, and release/checkpoint operations compare the exact conversation, holder, and token.

Alternative: restore monotonic increments. Rejected because ordering is unnecessary and would retain a
writer-generation model. Alternative: keep the renamed string fields and rebuild or alter tables.
Rejected because it violates stable-shape and no-product-migration policies and would rewrite user
data. Alternative: support both layouts. Rejected because it creates schema dispatch and two success
paths.

### Keep the correction inside the package-owned Node repository

Canonical producer/path: `packages/agent/runtime/src/pi/node-conversation-authority.ts` through the
public `@neko/agent-runtime/pi` entry. Consumer: package-owned Agent application/runtime services,
wired by Desktop Main. Runtime boundary: Node SQLite plus Pi Session files.

The replaced path is the renamed-field SQL introduced by the internal-version cleanup. It is deleted
atomically; no alias, adapter, conditional query, or fallback remains. No production logic is added to
`apps/neko-desktop`, because lease semantics are host-neutral Agent business behavior and do not depend
on Electron objects or sender identity.

### Validate through isolated repositories and the real consumer path

Tests construct only temporary databases. One regression fixture uses the current stable table shape
and representative rows, then proves lease acquisition and checkpointing while sibling conversation
records remain byte-for-byte equivalent. Tests do not open `~/.neko/neko.db`, invoke a repair helper,
or retain an alternate schema fixture.

The Agent evaluation requirement is satisfied by reusing the existing basic real-conversation suite
and a visible Electron composer first submit with the user's native TOML configuration. Key-free tests
prove only harness/path readiness and are not reported as Agent behavior evidence.

## Risks / Trade-offs

- [A random token collides with the immediately replaced claim] -> Generate again inside the serialized
  owner boundary until the exact token differs.
- [A physical field name resembles forbidden internal generation state] -> Keep it repository-private,
  equality-only, and evidence-backed as a stable persisted field that cannot be renamed without a
  forbidden user-data rewrite.
- [Existing checkpoint records contain earlier sequential values] -> Equality semantics accepts their
  values unchanged; no ordering or conversion is required.
- [A broader database defect is hidden] -> Do not catch SQLite errors or synthesize empty success;
  non-target failures remain fail-visible.

## Migration Plan

There is no data migration. Deploy the source correction, open the existing shared database directly,
and let ordinary lease expiry/takeover update only the targeted canonical row. Source rollback is the
only rollback; no database rollback or rewrite is performed.

## Open Questions

None.
> **后继处置（2026-08-21）**：本文的 Pi execution lease 设计不再是当前实现约束，DSH Session 与 OpenNeko catalog/binding 的唯一权威见 `replace-pi-with-dsh-runtime-atomically`。
