Execution rule: this is the next canonical infrastructure migration after `retain-media-library-and-unified-entity`. Existing representation contracts and passing allowlist-based dependency checks are prerequisites, not completion evidence. Do not mark product migration or cleanup tasks complete until package-local ResourceCache composition is removed from production, the corresponding migration allowlist entries are deleted, and source-versus-derived runtime paths are proven.

## 1. Contracts And Dependency Audit

- [x] 1.1 Audit Agent, Assets, Canvas, Cut, Preview, Tools, DocumentAccess, and External Processor ResourceCache imports/composition; map each use to representation, source read, maintenance, or durable ownership.
- [x] 1.2 Define ContentRepresentationService with bounded locator reads, closed representation specs, storage-neutral generator/result, processor ownership, safe diagnostic, and promotion contracts while retaining existing ContentAccess source API.
- [x] 1.3 Add dependency and poison fixtures for package-local ResourceCache runtime, manifest/root/GC exposure, native document-entry materialization, and public `resourceCache` processor roots.

## 2. Shared Host Derived Composition

- [x] 2.1 Build shared Host composition for ResourceCache service, LocalMetadata ledger, provider wrapping, roots, startup GC, maintenance, and disposal.
- [x] 2.2 Adapt existing thumbnail/proxy/preview/waveform/loudness/raster/fov/semantic providers to storage-neutral generators wrapped only by Host.
- [x] 2.3 Preserve fingerprint keys, in-flight deduplication, freshness, bounded concurrency, invalidation, retention, quota, GC, and lifecycle behavior with focused internal tests.
- [x] 2.4 Enforce durable ownership exclusions for formal Assets, generated source, accepted candidates, projects, and exports.

## 3. Product Package Migration

- [x] 3.1 Migrate Assets, Canvas, Cut, Preview, Agent, and Tools to semantic representation requests/generators and injected Host ports.
- [x] 3.2 Remove package-local ResourceCache service/provider/manifest/root/GC/lifecycle composition and add production dependency guards with narrow Host allowlists.
- [x] 3.3 Add producer/consumer path tests proving representations hit Host derived storage and no product result contains cache path/status/provider.

## 4. Documents And Processor Ownership

- [x] 4.1 Route original source and EPUB/DOCX/CBZ native entries through direct existing ContentAccess reads; remove DocumentResourceCacheProvider bindings that copy native entries.
- [x] 4.2 Keep PDF/Office raster pages and document thumbnails behind representation requests; add ReadDocument-to-ReadImage and Preview regressions distinguishing source from derived paths.
- [x] 4.3 Replace External Processor `resourceCache` root policy with intermediate/debug/candidate/promoted allocation and verify accepted promotion escapes derived GC.

## 5. Documentation And Verification

- [x] 5.1 Synchronize cache/content/package documentation with Host-private derived storage and product semantic representations.
- [x] 5.2 Run focused representation/cache/document/processor tests and affected package builds, then `pnpm build`, `pnpm test`, and `pnpm check`.
- [x] 5.3 Run legacy/unused/dependency gates and isolated Extension scenarios for thumbnail, proxy/waveform, document entry/raster, processor candidate, GC, and path non-disclosure.
