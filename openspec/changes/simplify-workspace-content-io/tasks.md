Execution rule: run this change after `internalize-derived-content-storage`. Existing locator, `ContentReadService`, and authorized writer scaffolding does not complete the consumer migration while the old ContentAccess/ContentIngest matrix remains active or exported. Do not mark migration or cleanup tasks complete until canonical consumers use the narrow ports and the old intent/materialization/provider path is poisoned and deleted.

## 1. Preconditions And Contracts

- [x] 1.1 Verify `adopt-workspace-linked-media-libraries` and `internalize-derived-content-storage` canonical paths are complete; poison media-library source kind and product ResourceCache dependencies in this change's fixtures.
- [x] 1.2 Audit all ContentAccess/ContentIngest types, validators, providers, exports, producers, consumers, ProjectFileStore, domain writers, and runtime projections.
- [x] 1.3 Freeze stable locator, bounded stat/read, discriminated projection, authorized writer, and safe diagnostic contracts; choose one final projection port shape.

## 2. New Content I/O Path

- [x] 2.1 Implement explicit locator handlers and stat/read operations with range, maxBytes, cancellation, fingerprint preconditions, and fail-visible unknown-operation behavior.
- [x] 2.2 Implement capability-scoped Webview/Engine/processor projection adapters and remove public localPath/raw error/provider identity.
- [x] 2.3 Implement authorized atomic workspace writer primitives without generic ownership/destination selection.
- [x] 2.4 Migrate DocumentAccess to the narrow read port while preserving format, manifest, range, locator, cursor, and Preview Node transport behavior.

## 3. Producer And Consumer Migration

- [x] 3.1 Migrate Engine/Webview/processor/package/export source projections and reads to the new content ports.
- [x] 3.2 Migrate Agent, Media Library, Canvas, Cut, Preview, and Tools callers to stable locators, discriminated results, and existing ContentRepresentationService.
- [x] 3.3 Migrate ProjectFileStore, Media Library copy, generated output, package, and export owners to the authorized writer primitive without changing domain ownership.

## 4. Remove The Old Matrix

- [x] 4.1 Poison then delete ContentAccess intent/target/materialization/quality/caller matrix, first-supports routing, public localPath, cache statuses, validators, exports, aliases, and compatibility tests.
- [x] 4.2 Poison then delete broad ContentIngest modes/destinations including cache-artifact, pathVariable, mediaLibraryId, allowAbsolutePath, provider competition, and fallback adapters.

## 5. Documentation And Verification

- [x] 5.1 Synchronize architecture/package/domain documentation with narrow content ports, domain-owned writes, and safe diagnostics.
- [x] 5.2 Run focused contract/producer/consumer/document/projection/writer tests and affected builds, then `pnpm build`, `pnpm test`, and `pnpm check`.
- [x] 5.3 Run legacy/unused/dependency gates and isolated Extension scenarios proving new handlers are hit, old paths are poisoned, and no physical path leaks.
