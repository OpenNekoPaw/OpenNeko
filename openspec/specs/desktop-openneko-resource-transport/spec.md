# desktop-openneko-resource-transport Specification

## Purpose
TBD - created by archiving change replace-desktop-media-scheme-with-http-resource-gateway. Update Purpose after archive.
## Requirements
### Requirement: Desktop SHALL register one OpenNeko scheme

Desktop SHALL register exactly one privileged `openneko:` scheme before app ready. The same
`protocol.handle('openneko', ...)` SHALL serve trusted Renderer bundle requests under
`openneko://desktop/...` and authorized runtime resources under
`openneko://resource/<opaque-id>/...`. Production MUST NOT register `neko-app:`, `neko-media:`,
`opennekomedia:`, `media:`, `video:` or `audio:` as an additional successful resource path.

#### Scenario: Desktop loads its Renderer

- **WHEN** a production Window is created
- **THEN** it loads `openneko://desktop/index.html`
- **AND** exactly one `openneko:` protocol handler owns both app and resource host dispatch

#### Scenario: Unknown host is requested

- **WHEN** an `openneko:` URL uses a host other than `desktop` or `resource`
- **THEN** the handler returns an explicit non-success response
- **AND** it does not reinterpret the host as a filesystem path or another protocol

### Requirement: Resource registration SHALL consume exact authorized sources

The Desktop resource registry SHALL accept only an exact Host-authorized seekable file, one-shot
stream producer or frozen dependency allowlist plus explicit lifecycle and sender ownership. It
MUST NOT resolve `ContentLocator`, infer a workspace/path, browse a directory, select recent state
or interpret Cut, Canvas, Preview or Agent documents.

#### Scenario: Preview registers locator-backed content

- **WHEN** Preview requests a runtime URL for a valid `ContentLocator`
- **THEN** the owning adapter resolves and authorizes the exact source/revision before registration
- **AND** the registry receives no authority to resolve adjacent or unrelated content

#### Scenario: Caller supplies an unresolved content identity

- **WHEN** a caller supplies only a locator, display path or URL to the registry
- **THEN** registration fails visibly
- **AND** no active workspace, recent resource or path-to-locator inference is used

### Requirement: Every resource request SHALL be sender-bound

Every registration SHALL bind the allowed `webContentsId` together with
Window/View/session/renderer-epoch/generation ownership. `session.webRequest` SHALL reject a
resource request whose actual Electron request context is missing, stale or does not match the
registration. `protocol.handle` SHALL independently reject unknown/revoked IDs and MUST NOT trust
Renderer-provided owner headers.

#### Scenario: Owning Renderer requests a resource

- **WHEN** the registered WebContents requests its live opaque URL
- **THEN** sender authorization and exact registration lookup both succeed
- **AND** only the registered source/stream/dependency can be returned

#### Scenario: Another Renderer reuses the URL

- **WHEN** a different WebContents requests a copied live URL
- **THEN** the request is cancelled or denied before bytes are returned
- **AND** possession of the URL does not expand sender scope

#### Scenario: Sender context is unavailable

- **WHEN** the target Electron request path does not expose a reliable `webContentsId`
- **THEN** qualification and resource access fail visibly
- **AND** Desktop does not fall back to pure bearer authorization, loopback HTTP or disabled web security

### Requirement: Runtime URLs SHALL remain transient projections

`openneko://resource/...` URLs and opaque IDs SHALL exist only in runtime Renderer projections.
They MUST NOT be written to project documents, Agent memory, provider payloads, Tool arguments,
clipboard defaults, recent state, telemetry or unredacted logs. Persistent content identity SHALL
remain a validated `ContentLocator`; representation, domain identity and revision SHALL remain
separate typed facts.

#### Scenario: Canvas persists a media node

- **WHEN** a locator-backed Canvas document is saved
- **THEN** it contains no `openneko:`, loopback URL, opaque runtime ID or absolute path
- **AND** the source remains identified by its canonical locator

#### Scenario: Runtime URL is handed to another domain

- **WHEN** a runtime URL is supplied as Agent, Cut, Canvas, Preview, provider or Tool content input
- **THEN** the owning contract rejects it
- **AND** it is not converted into a locator or filesystem path

### Requirement: Seekable resources SHALL implement browser Range semantics

The resource handler SHALL support `GET` and `HEAD`, full responses, one closed/open/suffix byte
Range, repeated/concurrent Range and correct `200`, `206` or `416` responses. It SHALL return exact
MIME, length, `Accept-Ranges`, applicable `Content-Range`, `Cache-Control: no-store` and
`X-Content-Type-Options: nosniff`. It MUST stream with backpressure and MUST NOT buffer the complete
file, expose its path or start a TCP server.

#### Scenario: Native video seeks

- **WHEN** Chromium sends a valid Range request for a live video registration
- **THEN** only that range is streamed with status `206` and exact headers
- **AND** the same frozen revision remains available for later valid ranges

#### Scenario: Range is invalid

- **WHEN** Chromium sends multiple, malformed or unsatisfiable ranges
- **THEN** the handler returns `416` with total-size information
- **AND** it does not return the full resource as a fallback

### Requirement: Stream resources SHALL be explicit and one-shot

Framed PCM SHALL use an explicit one-shot registration with priming, response backpressure,
single-consumer behavior, cancellation and producer termination. It MUST NOT claim byte Range
support. A seek SHALL revoke the old owning generation and register a new producer.

#### Scenario: Cut consumes PCM

- **WHEN** the owning Cut Renderer connects to a primed live PCM registration
- **THEN** it receives the declared framed PCM stream
- **AND** client cancellation or owner revocation terminates the exact producer

#### Scenario: PCM is consumed twice

- **WHEN** a consumed PCM URL or a Range request is used
- **THEN** the handler fails visibly
- **AND** it does not restart the producer or select another generation

### Requirement: Resource sets SHALL authorize exact dependencies

A resource set SHALL map one opaque ID plus normalized relative virtual paths to an immutable exact
allowlist. Registration and request handling SHALL reject traversal, absolute/scheme-relative URL,
encoded separator, unknown entry, containment escape and source revision change. It MUST NOT expose
directory listing or authorize an entire directory.

#### Scenario: glTF loads declared dependencies

- **WHEN** Preview registers a glTF entry, buffer and texture
- **THEN** relative loader requests resolve only those exact entries under one resource URL
- **AND** MIME and revision remain bound to each entry

#### Scenario: glTF requests an undeclared file

- **WHEN** the loader requests an unknown or escaping path
- **THEN** the handler returns an explicit non-success response
- **AND** no adjacent file or network resource is read

### Requirement: Resource lifecycle SHALL release every owned handle

The registry SHALL revoke corresponding registrations and abort in-flight file/PCM responses when
replacing/stopping a generation, detaching a View, changing renderer epoch, closing a Window or
quitting the app.
Client cancellation SHALL release the exact response without hiding genuine source or producer
failure.

#### Scenario: Renderer reloads

- **WHEN** a WebContents enters a new renderer epoch
- **THEN** old resource registrations and in-flight responses are revoked
- **AND** old URLs cannot be reused by the new document

#### Scenario: Application quits

- **WHEN** Desktop disposal completes
- **THEN** registry records, protocol/webRequest listeners, file streams and FFmpeg producers are closed
- **AND** no loopback listener or resource handler remains active

### Requirement: CSP and CORS SHALL allow only the resource origin

Production CSP SHALL allow only the audited `openneko://resource` origin for media, image, fetch or
frame consumers. It MUST NOT add loopback origins, arbitrary `http:`, `file:` or wildcard custom
schemes. Cross-origin resource responses SHALL allow only `openneko://desktop` or the exact current
development Renderer origin where a Canvas/WebGL/model consumer requires CORS.

#### Scenario: Video is used as a texture

- **WHEN** the owning consumer sets anonymous CORS before assigning its resource URL
- **THEN** changing Canvas/WebGL pixels remain readable
- **AND** no wildcard network origin is enabled

#### Scenario: Unexpected origin requests a resource

- **WHEN** a request carries an origin outside the configured Renderer origins
- **THEN** access is denied
- **AND** no CORS/PNA compatibility fallback grants access

### Requirement: Transport SHALL NOT determine media or GPU qualification

Successful `openneko:` loading SHALL prove only the observed byte transport, decode and consumer
facts. Codec/container support, texture reuse, copied bytes, 10-bit surface and HDR output SHALL
remain separately qualified for the exact Electron/Chromium, OS, architecture, GPU/driver, display
and FFmpeg facts.

#### Scenario: Main10 PQ video loads

- **WHEN** metadata and changing pixels succeed through `openneko:`
- **THEN** the result records those exact transport/decode facts
- **AND** it does not claim zero-copy, 10-bit output or HDR display output without separate evidence
