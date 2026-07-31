## ADDED Requirements

### Requirement: Public content identity uses one canonical locator contract

Creator-visible, durable, persisted, and cross-package payloads SHALL use a validated
`ContentLocator` variant as their only general content-location identity. They MUST NOT expose,
persist, accept, or produce `ResourceRef`, `DocumentArchiveResourceRef`, a public
`ResourceVariantRef`, or an equivalent wrapper that combines content identity with runtime,
provider, path, or cache state.

#### Scenario: Pass workspace content between packages

- **WHEN** a package passes a workspace or linked-library file to another package
- **THEN** the payload contains one normalized `workspace-file` ContentLocator and no absolute
  path, URI, provider, library target, cache scope, or legacy resource reference

#### Scenario: Pass generated or package content

- **WHEN** a package hands off committed generated content or package-owned content
- **THEN** it uses the matching generated-output or package-resource ContentLocator and retains
  the owning domain ID separately

### Requirement: Domain meaning and derived representations remain separate

Semantic entity identity, document position, and representation derivation SHALL remain in their
owning typed fields and MUST NOT be collapsed into a generic content reference. A document image
that crosses a public boundary SHALL identify content with either the applicable document-entry
ContentLocator or a ContentRepresentationLocator, while an optional DocumentLocator independently
describes page, chapter, slide, or region meaning.

#### Scenario: Return a native archive image

- **WHEN** document reading returns an image that is an addressable native archive entry
- **THEN** the public result contains a document-entry ContentLocator and contains no
  DocumentArchiveResourceRef

#### Scenario: Return a rendered page

- **WHEN** document reading returns a PDF page raster, Office render, thumbnail, or proxy
- **THEN** the public result contains a ContentRepresentationLocator and keeps any semantic
  DocumentLocator separate

#### Scenario: Bind content to a domain object

- **WHEN** content belongs to an Entity, Job, artifact, output, processor run, or Canvas node
- **THEN** the domain identity and content locator are separate typed fields

### Requirement: Runtime materialization stays inside the authorized Host operation

The system MUST treat physical input/output paths, HTTP or Webview URLs, bytes, data URLs, streams, provider request
bodies, engine tokens, process handles, and cache keys as operation-scoped Host
materializations. They MUST NOT be promoted into ContentLocator values or persisted as general
content identity.

#### Scenario: Render locator-backed media

- **WHEN** a Renderer or Webview requests media for a valid ContentLocator
- **THEN** Desktop Host returns a sender-bound short-lived projection and the caller retains the
  original locator as identity

#### Scenario: Let an Agent tool or shell process access a file

- **WHEN** an approved Agent operation requires a system path for direct IO or a bash command
- **THEN** Host resolves an authorized operation-scoped path, enforces the read/write grant, and
  records any durable input or output with a ContentLocator rather than the system path

#### Scenario: Materialize external processor input

- **WHEN** a processor or provider requires bytes, multipart data, a stream, or a path
- **THEN** the owning Host port materializes it immediately before execution and does not write the
  materialized value into the durable request or result

### Requirement: Resource cache identity is private and rebuildable

Resource-cache manifests SHALL use a cache-owned internal key and source descriptor rather than a
public ResourceRef. Cache DTOs MUST NOT be used as cross-package content handoff contracts.
Prelaunch cache records with the removed schema SHALL fail schema validation and be rebuilt without
deleting source workspace content or committed generated outputs.

#### Scenario: Store a derived representation

- **WHEN** the cache stores a page image, thumbnail, preview, proxy, or other derived variant
- **THEN** it records cache-owned identity, source fingerprint, lifecycle, and relative storage
  metadata without exposing that entry as durable content identity

#### Scenario: Load a legacy cache manifest

- **WHEN** a cache manifest contains the removed ResourceRef-based entry schema
- **THEN** loading reports an invalid-schema diagnostic, invalidates or rebuilds the derived
  manifest, and preserves all source and committed output files

### Requirement: Legacy resource-reference payloads fail visibly

The system MUST make every persistence, Tool, message, attachment, projector, and cross-package boundary that receives
untyped input reject legacy `resourceRef`, `documentResourceRef`, and removed resource-ref
object shapes. The system MUST NOT infer a locator from paths, URIs, provider values, cache state,
active workspace, or active selection and MUST NOT silently omit the affected content.

#### Scenario: Decode a legacy Tool or attachment payload

- **WHEN** Agent receives a Tool result, attachment, perception result, or artifact payload using a
  removed resource-reference field
- **THEN** validation returns a stable fail-visible diagnostic and no Timeline or artifact success
  is projected

#### Scenario: Decode a legacy Canvas or processor payload

- **WHEN** Canvas, a plugin-transfer boundary, or an external processor receives a legacy
  resource-reference field
- **THEN** validation rejects the payload and neither a fallback path nor current active state is
  used

### Requirement: Agent and Canvas retain locator identity end to end

The system MUST ensure Agent Tool inputs/results, attachments, perception evidence, Timeline and artifact projections,
processor handoffs, and Canvas preview/playback inputs retain validated locator identity
until the final Host materialization boundary. Tests and focused Agent evaluation MUST prove the
canonical path was used and the legacy path did not participate.

#### Scenario: Deliver locator-backed Agent content

- **WHEN** Agent reads, perceives, processes, or delivers workspace or generated content
- **THEN** runtime evidence shows the same valid ContentLocator across public Agent projections
  and contains no legacy reference, persisted system path, cache path, or Webview URL

#### Scenario: Preview locator-backed Canvas content

- **WHEN** Canvas previews an image, audio, video, document representation, model, or other
  supported content
- **THEN** Canvas retains the locator or representation identity and obtains any playable/renderable
  projection from the Host for that operation

#### Scenario: Attempt the forbidden fallback

- **WHEN** a focused regression or Agent evaluation supplies only a legacy resource reference
- **THEN** the operation fails visibly and path evidence proves no legacy adapter, field mapping,
  path inference, or active-state fallback returned success
