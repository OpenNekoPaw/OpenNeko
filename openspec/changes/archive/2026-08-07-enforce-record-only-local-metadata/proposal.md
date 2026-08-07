## Why

The shared SQLite store currently has no enforceable boundary between structured records and binary-bearing payloads: raw bindings accept `Uint8Array`, JSON persistence accepts inline bytes and unbounded payloads, and table initialization can introduce binary columns. The semantic projection cache also persists one verbose evidence record per extracted text segment even though current consumers only need source identity, freshness, compact index metadata, and entity projections.

## What Changes

- **BREAKING** Remove binary binding values from the Local Metadata SQL contract and reject binary-bearing or oversized JSON records before SQLite writes.
- Reject application-owned SQLite schemas that declare `BLOB` or untyped columns while explicitly excluding the exact FTS5 engine-owned shadow tables from the application-record policy.
- Route direct Pi Session metadata serialization through the canonical Local Metadata JSON admission boundary.
- **BREAKING** Remove full text-segment evidence from the durable semantic projection record and stop creating, reading, or writing `semantic_evidence` for the canonical Search projection path.
- Persist the compact semantic index directly with the source record so current source/fingerprint and Entity projection consumers retain their required behavior without segment-level read or write amplification.
- Add contract and repository tests proving binary rejection, schema rejection, compact semantic round trips, and absence of the retired evidence path.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-storage-authority-policy`: Require SQLite admission to accept only bounded structured records, reject application binary representations and binary-capable schemas, and keep rebuildable semantic projections limited to current consumer requirements.

## Impact

- Owning responsibility: `@neko/local-metadata` remains the sole shared SQLite contract, admission, schema initialization, and concrete Node adapter owner.
- Search role: `@neko/search-local-metadata` continues to adapt Search domain results to Local Metadata but no longer persists or reloads unused per-segment evidence.
- Agent role: `@neko/agent-runtime` retains Pi conversation ownership while delegating JSON record admission to the Local Metadata public boundary.
- Public contracts affected: `LocalMetadataSqlBindingValue` and `SemanticProjectionRecord` change atomically with all in-repository producers, consumers, fixtures, and tests.
- User data: `semantic_evidence` is rebuildable cache data, not authoritative project content. Existing tables/rows are ignored by the new canonical path and remain untouched; fresh databases no longer create the table. No migration, compatibility reader, automatic repair, or data export path is introduced.
- Runtime boundary: media/artifact bytes remain in owning file, artifact, or cache stores; SQLite retains only locators, hashes, metadata, status, and compact projections.
