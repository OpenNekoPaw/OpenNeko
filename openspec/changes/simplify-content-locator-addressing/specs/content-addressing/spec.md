## ADDED Requirements

### Requirement: Durable content address contains a file and optional selector

`ContentLocator` SHALL identify one durable file under an exact authority and MAY identify one stable content selector inside that file. It SHALL NOT encode producing-domain lifecycle, cache, representation generation or Host path details.

#### Scenario: Complete Workspace file is addressed

- **WHEN** a consumer references `docs/report.pdf` as a complete Workspace file
- **THEN** the locator contains its exact Workspace file authority/path and no selector

#### Scenario: Archive entry is addressed

- **WHEN** a consumer references image entry `images/cover.png` inside `books/story.epub`
- **THEN** the locator contains the EPUB file address and one entry selector
- **AND** it contains no extraction path or representation settings

#### Scenario: Generated output is committed

- **WHEN** Generation commits bytes to a Workspace-relative output file
- **THEN** the content locator addresses that Workspace file
- **AND** output id, digest, Job and provenance remain in the Generation-owned record rather than defining another locator kind

### Requirement: Freshness conditions are separate from content address

Fingerprints and expected-byte conditions SHALL be carried by Content IO results/options or owning-domain receipts, not by `ContentLocator`. Locator equality SHALL compare only file authority/path and selector.

#### Scenario: Same mutable file is observed twice

- **WHEN** the same file address is read before and after its bytes change
- **THEN** both reads use the same `ContentLocator`
- **AND** their IO fingerprints differ

#### Scenario: Exact-byte consumer reads stale content

- **WHEN** a consumer supplies an expected fingerprint that no longer matches the addressed file
- **THEN** Content IO rejects that read as changed
- **AND** it does not invent a second locator identity or return stale bytes

### Requirement: Derived representations use runtime handles only

Thumbnail, proxy, preview, waveform, raster page, crop and semantic-sidecar results SHALL use an opaque runtime-owned `ContentRepresentationHandle`. The handle SHALL NOT be a `ContentLocator` and SHALL NOT contain or expose source, spec, generator, fingerprint, cache or Host path fields.

#### Scenario: PDF page is rasterized for visual analysis

- **WHEN** Content creates a raster representation of a PDF page
- **THEN** the runtime binds an opaque handle to the source/spec internally
- **AND** the provider receives only a conversation-scoped `image_ref`

#### Scenario: Representation handle is released or runtime restarts

- **WHEN** the owning representation runtime releases a handle or restarts
- **THEN** that handle is unavailable
- **AND** a consumer may request a new representation from the durable source and semantic spec through the canonical service

#### Scenario: Durable state is serialized

- **WHEN** transcript artifact authority, delivery metadata, Canvas `.nkc` or a Project fact is saved
- **THEN** no representation handle, representation locator, spec, generator id, data URL, Preview URL or absolute path is persisted

### Requirement: Agent content Tools expose opaque references

Model-facing content Tool definitions SHALL expose only ordinary file paths where appropriate and owning-capability-issued `input_ref`, `unit_ref`, `cursor_ref` or `image_ref` values for complex content. The Agent SHALL NOT construct or receive internal locator structures.

#### Scenario: Attached document is read

- **WHEN** a document attachment is authorized for a Conversation
- **THEN** the model receives an `input_ref` and uses returned unit/cursor/image refs
- **AND** the Tool schema contains no locator kind, authority, selector, fingerprint, representation spec or generator field

#### Scenario: Opaque reference is invalid or belongs to another Conversation

- **WHEN** the model submits an unknown, expired or cross-Conversation reference
- **THEN** the current Tool call fails with a typed reference diagnostic
- **AND** no path, locator or active/recent binding is inferred

### Requirement: Durable artifact delivery requires canonical content address

Creator-visible artifact collection, Workspace Board projection and Canvas durable nodes SHALL accept only a canonical `ContentLocator` for referenced content. Representation-only perceptual evidence SHALL NOT be promoted to a durable artifact implicitly.

#### Scenario: PDF analysis uses raster pages

- **WHEN** an Agent reads raster pages to analyze a PDF and authors Markdown analysis
- **THEN** Board delivery references the original PDF `ContentLocator` and the durable Markdown result
- **AND** no raster-page representation becomes a Board node or artifact identity

#### Scenario: Representation-only image result is collected

- **WHEN** a successful visual Tool result contains only an internal representation handle
- **THEN** creator-visible artifact collection omits it from durable delivery without failing the completed Turn
- **AND** invalid durable artifacts in the same batch still fail locally with their own diagnostic

#### Scenario: User explicitly exports a derived page

- **WHEN** the user explicitly requests export/materialization of a derived page
- **THEN** the owning export operation commits bytes and returns a new canonical `ContentLocator`
- **AND** only that new durable locator is eligible for Board/Canvas persistence

### Requirement: Contract replacement has one canonical shape

The implementation SHALL update all in-scope producers, consumers, codecs, fixtures and tests atomically and SHALL remove the old locator union branches and `ContentRepresentationLocator` public export. It SHALL NOT add a legacy parser, dual-read, dual-write, version dispatch or fallback conversion.

#### Scenario: Old locator shape reaches a current boundary

- **WHEN** an old generated-output, fingerprint-bearing or representation-locator shape reaches the current contract boundary
- **THEN** that record/input is rejected locally with an invalid-content diagnostic
- **AND** valid sibling records and Workspaces remain available

#### Scenario: Old authoritative persisted record exists

- **WHEN** an authoritative user record contains an invalid old locator shape
- **THEN** the owning catalog preserves the original record and presents its local invalid state and repair action
- **AND** it does not silently rewrite, discard or propagate failure to the application root
