## ADDED Requirements

### Requirement: Product packages request representation semantics only

Agent, Assets, Canvas, Cut, Preview, and Tools SHALL request thumbnail, proxy, preview, waveform, loudness, raster-page, fov-crop, semantic sidecar, or processor ownership without knowing whether the result is cached, generated, reused, or stored.

#### Scenario: Request a thumbnail

- **WHEN** Assets or Canvas requests a thumbnail for a source
- **THEN** ContentRepresentationService returns a stable representation locator or safe unavailable diagnostic without cache path, status, manifest, or provider

#### Scenario: Request proxy or waveform

- **WHEN** Cut requests proxy, waveform, or loudness
- **THEN** the Host performs generator/Engine work and storage lifecycle without Cut importing ResourceCache

#### Scenario: Consume a representation

- **WHEN** a consumer reads a ready representation locator with bounded range/maxBytes options
- **THEN** the same Host service returns representation bytes and metadata without exposing cache path, status, manifest, or provider identity

#### Scenario: Representation was evicted

- **WHEN** a consumer reads a representation locator whose Host-private derived entry is no longer available
- **THEN** the service returns a safe unavailable diagnostic and does not fall back to a source path or package-local cache

### Requirement: ResourceCache is Host-private

ResourceCacheService, ResourceCacheProvider, manifest stores, roots, startup GC, retention, missing-cache states, and lifecycle updates MUST be owned by shared Host content composition or maintenance and MUST NOT be imported or constructed by product-package production code.

#### Scenario: Activate product extensions

- **WHEN** Agent, Assets, Canvas, Cut, Preview, or Tools activates
- **THEN** product composition receives representation/content ports and does not create a package-local ResourceCache runtime

#### Scenario: Run derived maintenance

- **WHEN** startup or user-invoked maintenance performs quota or GC work
- **THEN** a Host maintenance owner operates internal storage without projecting paths or manifest to products

### Requirement: Derived representations retain lifecycle guarantees

The Host-private store SHALL preserve fingerprint identity, in-flight deduplication, generator/profile freshness, bounded concurrency, retention, quota, invalidation, and GC for rebuildable representations.

#### Scenario: Reuse current representation

- **WHEN** source fingerprint, representation spec, generator profile, and runtime revision are unchanged
- **THEN** the internal store reuses the ready result

#### Scenario: Source or generator changes

- **WHEN** source fingerprint or generator/profile revision changes
- **THEN** prior result becomes stale and a new representation is produced without changing persisted source

#### Scenario: Evict rebuildable output

- **WHEN** derived storage exceeds quota
- **THEN** GC may remove eligible representations without deleting original source, project facts, formal Assets, generated source, accepted candidates, or exports

### Requirement: Native document entries are source content

An EPUB, DOCX, or CBZ entry already present in the archive MUST be read directly. PDF/Office raster pages and document thumbnails requiring computation SHALL use representation requests.

#### Scenario: Read existing CBZ image

- **WHEN** a document entry identifies an image stored in CBZ
- **THEN** the existing ContentAccess document provider reads it directly and derived storage is not invoked

#### Scenario: Render PDF page

- **WHEN** a consumer requests a PDF raster page
- **THEN** ContentRepresentationService generates or reuses the representation internally

### Requirement: Derived failure does not block source reads

Failure to initialize or generate derived storage MUST NOT prevent authorized original source or native document-entry reads.

#### Scenario: Cache initialization fails

- **WHEN** an original source is readable but internal derived storage fails
- **THEN** existing ContentAccess source read remains ready while representation requests fail visibly

### Requirement: Processor ownership is storage-neutral

External Processor contracts SHALL describe output as intermediate, debug, candidate, or promoted and MUST NOT expose a `resourceCache` input/output/cwd root.

#### Scenario: Produce intermediate output

- **WHEN** a processor requests intermediate output
- **THEN** Host allocates internal storage and returns a stable locator rather than a cache root

#### Scenario: Promote a candidate

- **WHEN** user accepts a processor or AI candidate
- **THEN** owning workflow ingests it into durable ownership so derived GC cannot delete it
