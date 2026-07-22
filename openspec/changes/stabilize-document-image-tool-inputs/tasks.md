## 1. Tool Schema And Validation

- [x] 1.1 Add red tests for nested object/array/anyOf validation with indexed field diagnostics in the shared Agent schema validator.
- [x] 1.2 Implement the recursive JSON Schema subset once in the existing validator and prove unrelated Tool schemas retain their behavior.
- [x] 1.3 Replace ReadImage's broad resourceRef object schema with document-entry and managed ResourceRef branches, requiring non-empty document entry paths.
- [x] 1.4 Add deterministic ReadDocument-to-ReadImage batch tests that accept intact refs and reject one damaged ref without reconstructing it from duplicate metadata.
- [x] 1.5 Rebind public ReadDocument image refs to the stable workspace source while retaining resolved paths only inside ContentAccess loading.

## 2. Agent Runtime Evidence

- [x] 2.1 Audit and update Pi Tool schema projection/snapshots so the nested ReadImage contract reaches the configured provider unchanged.
- [x] 2.2 Add a committed synthetic EPUB fixture and focused Agent evaluation case for ReadDocument -> ReadImage -> native multimodal delivery, with whole-archive/fabricated-ref forbidden evidence.
- [x] 2.3 Run key-free Evaluation validation and the focused real Agent case; record target/model identity, path evidence, blockers, and residual risk.
- [x] 2.4 Project ReadImage image attachments through the Host-injected existing perception asset loader into Pi native image content, with fail-visible missing-loader and malformed-payload tests.

## 3. Verification And Documentation

- [x] 3.1 Update document format/tool contract documentation without moving runtime protocol into Skill content.
- [x] 3.2 Run focused neko-content, Agent schema/bridge, producer/consumer, build, test, check, and quality gates required by repository policy.

## 4. Batch Omission Follow-up

- [x] 4.1 Reproduce the real batch failure where same-item top-level entry paths survive but several nested document refs omit only `entryPath`.
- [x] 4.2 Update the Tool schema and ReadImage input boundary to normalize only that unambiguous shape and reject conflicting paths before ContentAccess.
- [x] 4.3 Update deterministic batch regressions, the focused real Agent case, documentation, and Evaluation ownership mapping.
