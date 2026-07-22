## ADDED Requirements

### Requirement: Content I/O uses stable locators and explicit operations
The public content contract SHALL expose stable locators and explicit stat, source read, runtime projection, representation, and authorized write operations. It MUST NOT expose an independent intent × target × materialization matrix.

#### Scenario: Read source bytes
- **WHEN** a consumer requests bounded bytes for a workspace-file, document-entry, generated-output, or package-resource locator
- **THEN** ContentReadService returns a bytes result matching that operation without optional Webview, Engine, stream, cache, or local-path fields

#### Scenario: Project to a runtime consumer
- **WHEN** a capability-scoped port projects a locator to Webview, Engine, or processor
- **THEN** it returns only the opaque discriminated projection for that consumer

### Requirement: Public content contracts exclude internal storage
Public requests, results, diagnostics, and source contracts MUST NOT contain cache-materialize intent, materialization policy, missing-cache status, cache path/runtime ref, cache-artifact destination, manifest, root, GC, or storage provider identity.

#### Scenario: Compile a product consumer
- **WHEN** a product package imports public content API
- **THEN** it can read, project, request an existing representation, or write through an authorized owner without importing internal storage contracts

### Requirement: Permissions come from injected capabilities
Callers MUST receive Host-composed capability-scoped content ports and MUST NOT elevate access by supplying an arbitrary caller, intent, destination, or allowAbsolutePath field.

#### Scenario: Request unauthorized projection
- **WHEN** a consumer port lacks Engine, Webview, processor, or write capability
- **THEN** that operation is unavailable or rejected without trying another provider

### Requirement: Physical paths remain Host-only
Public results, Agent tools, Webview messages, project files, and portable diagnostics MUST exclude localPath, absolute paths, link targets, raw filesystem errors, and provider-private storage identity.

#### Scenario: File access fails
- **WHEN** Host receives a filesystem error containing a user path
- **THEN** consumer receives a stable safe diagnostic and locator while restricted Host logging may retain physical details

### Requirement: Authorized writer does not decide domain ownership
The shared writer SHALL provide bounded atomic workspace writes and owner-requested allocation but MUST NOT choose project, Media Library copy, generated, package, export, or cache ownership from a generic mode/destination request.

#### Scenario: Save NK project
- **WHEN** Canvas or Cut saves NKC/NKV
- **THEN** ProjectFileStore and domain codec own validation, backup, destination, and atomic commit using the shared writer primitive

#### Scenario: Copy into a Media Library
- **WHEN** a user explicitly chooses a writable Media Library destination and conflict policy
- **THEN** the Media Library file operation uses the writer without creating Asset membership or routing through generic ContentIngest provider competition

### Requirement: DocumentAccess depends on the narrow read port
DocumentAccessService SHALL retain format, manifest, range, locator, cursor, and adapter semantics while reading source/entries through ContentReadService.

#### Scenario: Continue ReadDocument to ReadImage
- **WHEN** ReadDocument returns a stable document-entry locator
- **THEN** ReadImage passes it unchanged to the narrow read port without archive or physical-path knowledge

### Requirement: Old content matrices cannot remain canonical
After migration, old ContentAccess/ContentIngest request types, first-supports provider routing, aliases, adapters, and fallback branches MUST NOT serve new requests successfully.

#### Scenario: New request reaches old API
- **WHEN** a migrated consumer attempts to use old intent/materialization or ingest mode contract
- **THEN** compile-time or runtime poison fails visibly and no compatibility adapter returns success
