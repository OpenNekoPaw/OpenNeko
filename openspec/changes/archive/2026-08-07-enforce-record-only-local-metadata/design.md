## Context

`@neko/local-metadata` owns the shared `~/.neko/neko.db` contract and Node adapter, but its current public SQL binding includes `Uint8Array`, its JSON serializer only rejects secret-like keys, and its additive table initializer does not verify column affinities. Most repositories use that serializer, while Pi branch metadata writes through direct `node:sqlite`. These gaps permit application bytes to enter SQLite as native BLOB values, data/blob URLs, Base64 strings, serialized typed arrays, or unbounded JSON.

Search currently projects each extracted text segment into `SemanticEvidenceProjection`, then `@neko/local-metadata` stores the complete object in `semantic_evidence`. The analyzer creates an evidence object for every segment, including segments without an Entity mention. Before cleanup, 20,319 evidence rows occupied about 44.35 MiB including indexes; current production consumers only compare source fingerprints, enumerate source descriptors, and read separately-owned Entity projections.

The authoritative source remains the Workspace/project file. Semantic SQLite data is rebuildable cache. Existing cache rows must remain untouched rather than being migrated or interpreted by a compatibility reader.

## Goals / Non-Goals

**Goals:**

- Make `@neko/local-metadata` the single application-record admission boundary for every JSON write that can reach the shared store.
- Reject native binary values, binary-bearing URLs/encodings, serialized binary containers, and unbounded JSON before executing SQLite writes.
- Reject application-owned BLOB-capable schemas while preserving the exact FTS5 engine-owned implementation tables.
- Store one compact semantic source/index record plus current Entity projections, without one durable record per source text segment.
- Keep invalid input fail-visible and local to the attempted record or table initialization.
- Prove the canonical path with focused unit, repository, and schema tests.

**Non-Goals:**

- Removing SQLite FTS5 or treating SQLite's internal page/index encoding as domain binary content.
- Migrating, exporting, dropping, vacuuming, or repairing existing user databases.
- Changing semantic extraction, Entity analysis, project facts, or generated/media file storage.
- Adding a generic storage framework, codec registry, compatibility reader, or alternate database path.

## Decisions

### 1. Local Metadata owns record admission

The canonical public path remains `@neko/local-metadata` via `serializeLocalMetadataJson`, `LocalMetadataSqlBindingValue`, and `initializeLocalMetadataTables`. The JSON serializer recursively rejects `ArrayBuffer` views (including Buffer and typed arrays), ArrayBuffer values, data/blob URLs, canonical long Base64 strings, serialized Buffer/typed-array shapes, large byte-like numeric arrays, and serialized documents above a bounded byte limit. Secret rejection remains part of the same traversal.

Raw SQL bindings become scalar-only (`string | number | bigint | null`). This removes the normal typed path for BLOB insertion. Table initialization queries SQLite's own schema metadata after applying additive statements and rejects BLOB or untyped columns for application tables. Only the exact `search_documents_fts` virtual/shadow table family is excluded because those rows are SQLite engine implementation details.

Alternative considered: rely on domain codecs alone. Rejected because generic metadata fields and future owning packages can bypass domain intent, and a shared trust boundary needs one fail-closed invariant.

### 2. Direct Pi metadata reuses record admission

`@neko/agent-runtime` remains the owner of Pi conversation/session lifecycle and direct transaction ordering. Its branch metadata serialization calls the Local Metadata public JSON admission function before binding a string. No Pi business behavior moves into Local Metadata, and no Desktop/Application logic is added.

Alternative considered: duplicate a Pi-local binary scanner. Rejected because it creates divergent policy and tests.

### 3. Semantic source records contain the compact index directly

`SemanticProjectionRecord` no longer carries full per-segment `evidence`. The source row stores the complete `CompactMediaSemanticIndex` in `index_json`, including the small mention/tag/perception reference collections that belong to that compact index. `semantic_evidence` is removed from current schema initialization, reads, writes, and public reconstruction.

Producer: `@neko/search-domain` continues to analyze transient `SemanticTextSegment[]`. Adapter: `@neko/search-local-metadata` projects the result to a compact Local Metadata source record and separately commits Entity occurrence/candidate records. Consumers: Semantic Source reconciliation uses source identity/fingerprint/descriptor; Entity surfaces use `entity_asset_projections`.

Alternative considered: retain a minimal evidence table. Rejected because no current production consumer reads segment evidence. Introducing a new minimal schema for a hypothetical consumer would preserve the same unnecessary owner and lifecycle.

### 4. Existing evidence rows are ignored, not migrated

Fresh databases no longer create `semantic_evidence`. Existing databases may retain the old table and rows physically, but the canonical runtime never reads, writes, repairs, drops, or falls back to them. Since the data is rebuildable cache and not authoritative content, explicit user/offline maintenance may reclaim it separately.

Rollback consists of reverting the code before release; there is no data conversion to reverse. Reverting against a fresh database would require rebuilding the semantic cache from authoritative project files, not reading a retired table through a compatibility path.

## Risks / Trade-offs

- [Risk] A legitimate very large structured record or long Base64-like user string is rejected. → Use a documented Local Metadata ceiling sized above current records and keep large/user content in its owning file authority.
- [Risk] Existing `semantic_evidence` pages remain in old database files. → Keep runtime non-destructive; report explicit maintenance separately and verify fresh databases omit the table.
- [Risk] A future semantic feature needs segment evidence. → Add a requirement with a real consumer and define the minimal owner/contract then; do not retain the current unused table.
- [Risk] FTS5 shadow tables contain BLOB/untyped columns. → Exempt only the exact canonical FTS table family and test that no application table receives the exemption.
- [Risk] Public contract removal breaks fixtures or indirect consumers. → Update all in-repository producers/consumers atomically and run package type/tests plus legacy-debt and unused checks.

## Migration Plan

1. Add admission and schema contract tests, then implement the Local Metadata boundary.
2. Route existing direct JSON writers through the boundary and remove binary SQL binding support.
3. Atomically remove `SemanticProjectionRecord.evidence` and the `semantic_evidence` current read/write/schema path.
4. Update Search adapter and repository fixtures; verify fresh-database schema and compact round trips.
5. Leave existing user database tables untouched and record residual disk reclamation as explicit maintenance, not product migration.

## Agent Evaluation Decision

- Disposition: `excluded` from real provider/Desktop Agent Evaluation.
- Affected path: Pi branch metadata calls the canonical deterministic Local Metadata JSON admission function before its existing SQLite insert.
- Canonical evidence: the delegation test rejects binary metadata with the Local Metadata diagnostic, while the complete Agent Runtime test suite and type check cover unchanged valid conversation, branch, transcript, lease, checkpoint, compaction, portability, and reopen behavior.
- Forbidden fallback: direct `JSON.stringify` no longer exists on the Pi branch metadata write path.
- Rationale: the change does not alter prompt composition, provider/model selection, Tool routing, queue/turn state, transcript projection, or valid AgentSession behavior; real model output cannot add evidence beyond the deterministic storage-boundary checks.

## Open Questions

None for the current consumer set.
