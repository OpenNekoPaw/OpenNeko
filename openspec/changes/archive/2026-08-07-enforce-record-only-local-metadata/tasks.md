## 1. Local Metadata record admission

- [x] 1.1 Add focused tests for scalar-only SQL bindings and rejection of native binary containers, binary URLs/encodings, serialized byte containers, byte-like arrays, and oversized JSON before a repository write.
- [x] 1.2 Implement the canonical bounded structured-record admission in `@neko/local-metadata` and remove `Uint8Array` from the public SQL binding contract.
- [x] 1.3 Add schema initialization tests for rejecting application BLOB/untyped columns while accepting only the exact Search FTS5 engine-owned table family.
- [x] 1.4 Implement transactional schema auditing in the Local Metadata table initializer with operation-qualified fail-visible diagnostics.

## 2. Canonical JSON writers

- [x] 2.1 Route Pi conversation branch metadata serialization through `serializeLocalMetadataJson` and add a delegation test proving binary metadata cannot reach its direct SQLite write.
- [x] 2.2 Audit remaining shared-database JSON writers and update any bypasses to use the Local Metadata admission boundary without adding compatibility or fallback paths.

## 3. Compact semantic projection

- [x] 3.1 Remove `SemanticProjectionRecord.evidence` and update Search producers, consumers, fixtures, and public contract tests to use the complete compact index stored with the source record.
- [x] 3.2 Remove `semantic_evidence` from fresh schema creation and from all current read/write/reconstruction paths without dropping, migrating, repairing, or reading an existing retired table.
- [x] 3.3 Add repository tests proving compact semantic source/index round trips, fresh databases omit `semantic_evidence`, and a poisoned existing retired table cannot participate in canonical reads or writes.
- [x] 3.4 Verify Entity occurrence/candidate projections and source fingerprint reconciliation continue through their single current owners without segment-evidence fallback.

## 4. Verification and review

- [x] 4.1 Run focused Local Metadata, Search Local Metadata, Search Domain, and Agent Runtime tests and type checks; record any unrun runtime coverage as residual risk.
- [x] 4.2 Run `pnpm check:legacy-debt` and `pnpm check:unused`, inspect the scoped diff under the L3 quality checklist, and document validation results plus residual disk-reclamation risk.
