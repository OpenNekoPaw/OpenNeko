## ADDED Requirements

### Requirement: Desktop SHALL expose one authorized loopback HTTP gateway

Desktop Main SHALL start exactly one app-lifetime resource gateway on an ephemeral port bound only
to `127.0.0.1`. Cut, Canvas, Preview and Agent Renderer projections MUST use that gateway rather than
creating domain-local Desktop servers or proxying one loopback URL through another transport.

#### Scenario: Desktop starts before loading a Renderer

- **WHEN** Desktop application composition starts successfully
- **THEN** the gateway is listening on one exact `http://127.0.0.1:<port>` origin before the first Renderer document loads
- **AND** every Desktop resource projection uses that origin

#### Scenario: Gateway cannot bind

- **WHEN** the gateway cannot bind to `127.0.0.1` or cannot publish its exact origin
- **THEN** Desktop reports media/resource capability initialization failure
- **AND** it does not bind another interface, use `localhost`, open broad `http:` access or fall back to a custom resource scheme

### Requirement: Every gateway URL SHALL be a scoped bearer capability

Every gateway URL SHALL contain an unpredictable capability token with at least 128 bits of
cryptographic entropy. A token MUST authorize only one exact seekable resource, one one-shot stream,
or one explicitly allowlisted resource set. Server-side registration SHALL retain owning
Window/View/session/revision/generation identity for lifecycle and revocation, while request
authorization MUST NOT trust caller-supplied identity headers.

#### Scenario: Exact resource is requested

- **WHEN** a holder requests a live token for its registered resource
- **THEN** the gateway returns only the bytes and MIME registered for that capability
- **AND** it does not derive a local path or a broader scope from request text

#### Scenario: Unknown or revoked token is requested

- **WHEN** a request contains an unknown, expired, replaced or revoked capability token
- **THEN** the gateway returns an explicit non-success response
- **AND** no current, recent or active-session fallback resolves the request

#### Scenario: Request claims another owner

- **WHEN** a request supplies Window, View, session, revision or `webContents` headers
- **THEN** those untrusted headers do not expand or replace the capability's server-side scope

### Requirement: Capability URLs SHALL remain transient and secret

Gateway URLs and tokens SHALL be runtime projections only. They MUST NOT be written to project
documents, Agent memory, attachments, provider payloads, recent state, clipboard defaults,
telemetry or unredacted logs. Persistent and cross-package records SHALL retain stable locator or
domain identity instead.

#### Scenario: Projection is persisted

- **WHEN** Canvas, Cut, Preview, Agent or Desktop serializes durable or recoverable state
- **THEN** the result contains no loopback origin, port, route or capability token
- **AND** it preserves only the owning stable resource identity

#### Scenario: Gateway request fails

- **WHEN** the gateway emits a diagnostic or log for a failed token request
- **THEN** the route token is redacted
- **AND** the diagnostic remains actionable without exposing an absolute source path

### Requirement: Seekable resources SHALL implement native HTTP Range semantics

The gateway SHALL support `GET`, `HEAD` and required `OPTIONS` requests for seekable resources.
It SHALL support full responses and one closed, open-ended or suffix byte range with correct
`200`, `206` or `416`, `Content-Length`, `Content-Range`, `Accept-Ranges`, exact MIME and
`X-Content-Type-Options: nosniff`. It MUST allow repeated and concurrent ranges for one live token
without buffering the complete resource in memory.

#### Scenario: Chromium seeks within a large video or document

- **WHEN** Chromium sends a valid byte Range for a live seekable resource
- **THEN** the gateway returns only that range with status `206` and exact `Content-Range`
- **AND** the source path remains undisclosed

#### Scenario: Chromium retries a range

- **WHEN** Chromium repeats or concurrently requests valid ranges for the same live token
- **THEN** every response is derived from the same frozen resource revision
- **AND** one request does not consume or invalidate the seekable token

#### Scenario: Range is malformed or unsatisfiable

- **WHEN** a request supplies multiple, malformed or unsatisfiable byte ranges
- **THEN** the gateway returns `416` with the appropriate total-size information
- **AND** it does not return full-file success as a fallback

### Requirement: Stream resources SHALL have explicit non-seekable semantics

Framed PCM and any future finite generated stream SHALL use an explicit stream descriptor and
single-consumer registration. A stream MUST NOT claim byte Range support. Repeat consumption,
seek or stale generation access SHALL fail visibly and SHALL NOT restart an unrelated producer.

#### Scenario: PCM consumer connects

- **WHEN** the owning browser PCM client connects to a primed live descriptor
- **THEN** the gateway returns the declared framed PCM MIME and applies response backpressure
- **AND** the registered producer is the only stream connected to that token

#### Scenario: PCM consumer seeks

- **WHEN** a PCM request contains a byte Range or a consumed token is requested again
- **THEN** the gateway rejects the request
- **AND** the owning domain must create a new playback generation for a timeline seek

### Requirement: Gateway access SHALL retain strict CSP, CORS and PNA boundaries

Desktop SHALL generate Renderer CSP from the exact gateway origin after the port is known.
`media-src`, `img-src`, `connect-src` and `frame-src` SHALL include the gateway origin only where
an audited consumer needs it; policies MUST NOT allow arbitrary `http:`, `localhost`, `*` or
`file:`. For requests that carry an `Origin`, the gateway SHALL accept only the configured
Renderer origin and return that exact `Access-Control-Allow-Origin`, never `*`. Required Private
Network Access preflight SHALL be handled only for that origin and the allowed methods/headers.

#### Scenario: Production media element loads a resource

- **WHEN** a `neko-app://desktop` Renderer loads an authorized audio or video URL
- **THEN** CSP permits only the exact gateway origin
- **AND** the gateway returns headers compatible with native media loading and Range

#### Scenario: Cross-origin media is used as a texture

- **WHEN** an authorized video or image is assigned to a canvas/WebGL/Three.js consumer with anonymous CORS before its source is set
- **THEN** the gateway returns the exact Renderer origin
- **AND** pixel or texture upload is not tainted by the transport

#### Scenario: Unexpected web origin requests a token

- **WHEN** a request carries an origin other than the configured production or current development Renderer origin
- **THEN** CORS/PNA authorization fails
- **AND** no wildcard response or compatibility branch grants browser access

### Requirement: Resource sets SHALL authorize only exact relative dependencies

The gateway SHALL support package-owned compound Preview resources through a tokenized resource set
whose virtual paths map to an explicit immutable allowlist. Registration SHALL normalize paths,
freeze source revision/fingerprint and MIME, and reject traversal, absolute or scheme-relative
references, unknown entries and containment escapes. It MUST NOT expose an arbitrary directory
listing or treat a directory root as unrestricted authorization.

#### Scenario: glTF loads an external buffer and texture

- **WHEN** Preview registers a glTF entry whose inspected manifest references authorized relative dependencies
- **THEN** the model loader resolves the entry, buffer and texture beneath one resource-set URL
- **AND** every requested virtual path maps to an exact allowlisted source

#### Scenario: Model requests an undeclared dependency

- **WHEN** a loader requests `..`, an absolute URL, an external network URL or an unregistered relative path
- **THEN** the gateway returns an explicit non-success response
- **AND** it does not read an adjacent workspace file or fetch the network resource

### Requirement: Gateway lifecycle SHALL cancel and release every owned resource

The system SHALL revoke the corresponding registrations and abort in-flight file reads, HTTP
responses and FFmpeg producers when replacing or stopping a playback generation, closing/detaching
a View, changing renderer epoch, closing a Window or quitting the application. Client disconnect
SHALL be treated as cancellation without hiding genuine source IO or producer failure.

#### Scenario: Preview source is replaced

- **WHEN** a temporary Preview replaces its source
- **THEN** all capabilities owned by the previous Preview session are revoked
- **AND** subsequent requests to the old URLs fail

#### Scenario: Renderer cancels a Range request

- **WHEN** Chromium closes an in-flight Range response because it changed seek position
- **THEN** the associated read is cancelled and resources are released
- **AND** later valid Range requests remain usable

#### Scenario: Application quits

- **WHEN** Desktop application disposal completes
- **THEN** all registrations, HTTP connections, listener handles and producer processes are closed
- **AND** the loopback port no longer accepts connections

### Requirement: Private resource schemes SHALL not remain a successful Desktop path

Desktop production code SHALL retain `neko-app:` only for trusted Renderer assets and SHALL remove
`neko-media:` registration, handler, registry proxy and CSP sources. Renderer resource descriptors
MUST reject `neko-media:`, `file:` and any custom `media:`, `video:` or `audio:` scheme. `data:` SHALL
remain limited to explicitly bounded embedded representations, and `blob:` SHALL remain limited to
Renderer-created resources with deterministic revocation.

#### Scenario: Legacy media descriptor is received

- **WHEN** a producer, fixture or Renderer supplies `transport: 'authorized'` or a `neko-media:` URL after migration
- **THEN** contract validation fails visibly
- **AND** the request does not map, proxy or retry it as loopback HTTP

#### Scenario: Renderer receives a filesystem URL

- **WHEN** a domain attempts to project `file:` or an absolute path as a display source
- **THEN** the projection is rejected before rendering
- **AND** no native element or loader receives the filesystem URL

### Requirement: Transport SHALL NOT determine codec, texture or color qualification

The system SHALL treat HTTP as byte transport only. Native codec/container support, decoded pixel
format, texture upload, GPU memory behavior, 10-bit preview and HDR output SHALL remain separately
qualified against exact Electron/Chromium, OS, architecture, GPU/driver, display and FFmpeg facts.
Successful HTTP load, media playback, metadata, canvas pixels or screenshot MUST NOT by itself
authorize zero-copy, 10-bit or HDR claims.

#### Scenario: Main10 PQ video loads over HTTP

- **WHEN** Chromium loads metadata or changing frames from a Main10 BT.2020/PQ resource
- **THEN** the result records only the observed transport/decode evidence
- **AND** HDR or 10-bit output remains unavailable until the complete output chain is qualified

#### Scenario: Video is uploaded repeatedly as a WebGL texture

- **WHEN** pixel checks prove first and repeated texture uploads are nonblank and changing
- **THEN** the system records texture correctness
- **AND** it does not describe the path as zero-copy or guaranteed decoder-surface reuse without separate evidence

### Requirement: HTTP qualification SHALL preserve the closed native target set

The repository SHALL keep native Desktop build targets closed to `darwin-arm64` and `win32-x64`,
while Linux remains host-neutral CI only. The gateway SHALL complete graphical media/runtime
qualification on local packaged `darwin-arm64` Electron and SHALL keep native `win32-x64`
typecheck/package construction green. Complete Windows installation, CSP/PNA, media/GPU and release
qualification SHALL remain a separate Phase 2 gate. Evidence from an ordinary browser,
cross-compilation or a different OS/architecture MUST NOT substitute for the required evidence.

#### Scenario: macOS qualification is evaluated

- **WHEN** the recorded Electron 43.2.0 `darwin-arm64` spike is used as evidence
- **THEN** it may establish the initial HTTP feasibility and performance baseline
- **AND** it does not establish Windows media/GPU, HDR output or future Electron release qualification

#### Scenario: Windows package is built

- **WHEN** the native `win32-x64` CI package job runs after the gateway migration
- **THEN** Desktop typecheck and package construction must succeed without Linux or custom-scheme fallback
- **AND** the artifact is not described as complete Windows graphical/media qualification

#### Scenario: Unsupported platform requests qualification

- **WHEN** Linux, Intel macOS, Windows ARM or another unsupported target requests Desktop qualification
- **THEN** the closed platform contract rejects it before native packaging
- **AND** this gateway specification does not create a release success path for that target
