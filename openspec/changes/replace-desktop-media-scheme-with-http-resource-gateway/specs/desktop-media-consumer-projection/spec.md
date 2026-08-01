## ADDED Requirements

### Requirement: Domain content SHALL retain canonical locator identity

Cut, Canvas, Preview and Agent SHALL use validated `ContentLocator` as the only general persistent
and cross-package content identity. Representation, owning document/artifact identity and revision
SHALL remain separate typed fields. Only Desktop Host projection may materialize a locator-backed
source into a short-lived `openneko://resource/...` URL. Runtime URL, opaque ID, system path or
legacy resource-reference shape MUST NOT be accepted as stable domain input.

#### Scenario: Canvas saves a media node

- **WHEN** a Canvas containing locator-backed media is saved
- **THEN** `.nkc` retains its validated locator and separate owning facts
- **AND** it contains no path-only fallback, runtime URL or absolute source path

#### Scenario: Agent hands content to Cut

- **WHEN** a user accepts an Agent result into Cut
- **THEN** the handoff uses the result locator and exact Cut document/session/revision
- **AND** it does not reuse the Agent card's render URL

### Requirement: Cut SHALL preserve native video and timeline PCM

Cut SHALL publish original/remuxed/prepared seekable video through the Desktop resource registry and
assign it to muted native `<video>`. Audible timeline inputs SHALL remain Host-mixed versioned
framed PCM so trim, gain, fade, overlap, rate, loudness and clock policy are applied before browser
scheduling. PCM SHALL remain the master clock when audible content exists.

#### Scenario: Timeline contains overlapping audio

- **WHEN** Cut prepares an interval with overlapping enabled audio
- **THEN** Host registers one owning mixed PCM generation and required seekable video resources
- **AND** Renderer does not unmute embedded audio or create one audio element per clip

#### Scenario: Cut seeks

- **WHEN** seek crosses the active prepared interval
- **THEN** Cut revokes the old PCM generation and registers a new exact generation
- **AND** it does not Range-seek PCM or fall back to native clip audio

### Requirement: Canvas ordinary playback SHALL use native elements

Ordinary Canvas audio SHALL use native `<audio>` and ordinary video SHALL use one native `<video>`
including embedded audio. Host SHALL register the accepted source or explicitly prepared complete
seekable representation. Ordinary playback MUST NOT create PCM, a Web Audio master clock or a
native/PCM fallback.

#### Scenario: Existing node is path-only

- **WHEN** an otherwise valid Media/File node lacks `ContentLocator` and retains only a safe display path
- **THEN** the editor preserves the node, layout and connections and shows content unavailable
- **AND** no preview, playback, action, Agent handoff, registration, inference or migration occurs

#### Scenario: User moves an unavailable node

- **WHEN** an older material-action projection becomes stale after node movement
- **THEN** the Webview retries against the latest snapshot at most once and discards optional failure
- **AND** it does not emit `canvas.loadFailed` or replace the editor

#### Scenario: User plays Canvas media

- **WHEN** Host returns an accepted audio or video descriptor
- **THEN** the package-owned native element consumes its transient resource URL
- **AND** controls use native play, pause, seek, volume and playback rate

### Requirement: Canvas PCM SHALL require an explicit processing contract

Canvas SHALL consume PCM only for a package-owned operation that explicitly requires synchronization,
mixing, signal processing, analysis or generated timing. Such an operation SHALL define its clock,
seek generation, cancellation and output independently from ordinary media nodes.

#### Scenario: Ordinary Canvas node requests PCM

- **WHEN** normal audio/video playback follows the production path
- **THEN** tests observe the native consumer and no PCM registration
- **AND** a poisoned ordinary PCM path remains untouched

### Requirement: Preview SHALL use its owning viewers

Preview SHALL keep package-owned image, audio, video, document and model viewers. Audio/video SHALL
consume native resource URLs; PDF/document adapters SHALL consume Range or bounded bytes; GLB SHALL
use one resource and glTF external dependencies SHALL use an exact resource set.
`PreviewMediaDescriptor.contentLocator` SHALL remain source identity.

#### Scenario: Preview opens audio or video

- **WHEN** Preview resolves an accepted source
- **THEN** the owning player consumes an `openneko://resource/...` URL
- **AND** no Desktop-local viewer or PCM fallback replaces it

#### Scenario: Preview opens external-resource glTF

- **WHEN** the model manifest declares relative buffers/textures
- **THEN** one entry URL resolves only the frozen allowlist
- **AND** unknown dependencies fail without directory authorization

### Requirement: Agent display and file authority SHALL remain separate

Agent/Pi messages, attachments, Tool results, Timeline/artifacts and provider materialization SHALL
retain validated locator fields. Only the conversation display projector may add a transient
resource render URL. Agent file Tools and authorized processors SHALL use PathAccessPolicy and
Host-resolved real filesystem paths; ordinary Agent sessions SHALL not gain Bash.

#### Scenario: Tool result contains video

- **WHEN** a Tool result has a valid displayable locator
- **THEN** Webview projection preserves it and adds a transient render URL for native `<video>`
- **AND** Pi, provider and later Tools do not consume that URL

#### Scenario: Authorized processor invokes a command

- **WHEN** a typed processor receives an authorized media input
- **THEN** Host supplies the exact real input/output paths inside its execution scope
- **AND** no `openneko:`, `neko-media:` or loopback display URL is passed to the command

### Requirement: Finite and live resources SHALL use different runtime paths

Finite files and bounded allowlisted dependency sets SHALL use the Desktop resource registry only
when an owning consumer requests a finite runtime projection.
Camera, microphone, screen capture, calls and unbounded live streams SHALL use authorized
MediaStream, WebRTC or a dedicated live runtime and MUST NOT be represented as seekable files or
one-shot PCM merely to reuse this transport.

#### Scenario: Microphone capture starts

- **WHEN** the user authorizes a real-time microphone session
- **THEN** the owning capture runtime projects MediaStream
- **AND** it does not create an `openneko:` file resource

### Requirement: Consumer instances SHALL own independent state

Each Cut document, Canvas View, Preview session and Agent conversation SHALL own its playback
generation, subscriptions and resource handles. Active selection MUST NOT be used as a fallback
owner. Stale operations and release events SHALL carry exact identity and fail visibly.

#### Scenario: Two Canvas Views play media

- **WHEN** two Canvas instances play different sources
- **THEN** each controls and releases only its own elements and registrations
- **AND** selecting one does not retarget the other

### Requirement: Migration SHALL prove OpenNeko and poison replaced paths

Producer/consumer tests and real Electron scenarios SHALL assert that the exact `openneko` resource
handler, package-owned viewer/player and intended native or PCM consumer were reached. Loopback HTTP,
`neko-app:`, `neko-media:`, `opennekomedia:`, `MediaTransport`, Desktop upstream proxy, Canvas
ordinary PCM and private media schemes SHALL be removed or poisoned so they cannot contribute to a
successful result.

#### Scenario: Cut playback succeeds

- **WHEN** real Electron Cut reaches changing video frames and advancing timeline PCM
- **THEN** evidence records `openneko` Range/stream handling and the Cut PCM client
- **AND** poisoned HTTP and legacy scheme paths remain untouched

#### Scenario: Canvas and Preview succeed

- **WHEN** real Electron fixtures load Canvas and Preview media/model/document content
- **THEN** evidence records package-owned consumers and exact resource registrations
- **AND** no loopback or alternate protocol participates
