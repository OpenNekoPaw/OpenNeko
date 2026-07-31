## ADDED Requirements

### Requirement: Domain state SHALL retain stable resource identity

Cut, Canvas, Preview and Agent SHALL keep `ContentLocator` plus owning document, artifact,
session/revision identities as their canonical inputs and persistent facts. Workspace-relative
paths SHALL remain authorized Tool inputs rather than parallel durable resource identity. Only
Desktop Host display projection SHALL materialize stable identities into a short-lived gateway URL.
A gateway URL MUST NOT be accepted as stable input to another domain, project codec, provider or
Tool.

#### Scenario: Canvas saves a media node

- **WHEN** a Canvas containing an audio, video, image or model source is saved
- **THEN** `.nkc` stores its portable source identity
- **AND** it contains no loopback origin, port, route, token or absolute source path

#### Scenario: Resource is handed from Agent to Cut

- **WHEN** an Agent result is explicitly accepted into Cut
- **THEN** the handoff uses the stable resource/locator and exact Cut document/session/revision
- **AND** it does not reuse the Agent card's display URL

### Requirement: Cut SHALL preserve native video and timeline PCM

Cut preview SHALL publish original, remuxed or prepared seekable video through the HTTP gateway and
assign it directly to muted native `<video>`. Every audible timeline input SHALL be mixed by the
Host into the versioned bounded framed PCM path so trim, clip gain, fade, overlap, playback rate,
loudness and peak policy are applied before browser scheduling. PCM SHALL remain the master clock
when audible content exists; video SHALL be the clock only for video-only intervals.

#### Scenario: Timeline contains overlapping audible clips

- **WHEN** Cut prepares a playback interval with overlapping enabled audio
- **THEN** Host publishes one owning mixed PCM generation and the required seekable video generation
- **AND** the Renderer does not unmute embedded video audio or create one native audio element per clip

#### Scenario: Timeline contains video without audible content

- **WHEN** Cut prepares a video-only interval
- **THEN** no PCM stream is required
- **AND** the native video element is the declared media clock

#### Scenario: Cut seeks to another timeline interval

- **WHEN** a seek crosses the active prepared interval
- **THEN** Cut stops and revokes the old PCM generation, prepares a new exact generation and preserves the established video retain/standby rules
- **AND** it does not seek the non-seekable PCM HTTP stream or fall back to native clip audio

### Requirement: Canvas ordinary media playback SHALL use native elements

An ordinary Canvas audio node SHALL use a native `<audio>` element, and an ordinary Canvas video
node SHALL use a native `<video>` element including its embedded audio. The Host SHALL publish the
accepted source or an explicitly prepared complete seekable file before playback, and ordinary node
playback MUST NOT create a PCM stream, Web Audio master clock or parallel native/PCM fallback.
Existing package-owned Canvas controls and playback state SHALL remain the UI owner.

#### Scenario: User plays a Canvas audio node

- **WHEN** the source has an accepted native or prepared audio profile
- **THEN** Canvas assigns its authorized HTTP URL to the package-owned native audio consumer
- **AND** play, pause, seek, volume and playback rate use the media element

#### Scenario: User plays a Canvas video node

- **WHEN** the source has an accepted native or prepared video profile with embedded audio
- **THEN** Canvas uses one native video element for its A/V playback
- **AND** it does not mute the video and start a duplicate PCM audio generation

#### Scenario: Browser profile is not accepted

- **WHEN** probe and the release manifest do not authorize direct playback
- **THEN** Host explicitly publishes a qualified complete seekable prepared file or an actionable unavailable diagnostic
- **AND** playback failure does not trigger an implicit PCM or codec fallback

### Requirement: Canvas PCM SHALL require an explicit processing contract

Canvas SHALL consume PCM only for an operation whose package-owned contract explicitly requires
multi-source synchronization, mixing, signal processing, analysis or generated timing. Such an
operation SHALL have a distinct descriptor/lifecycle from ordinary media-node playback and SHALL
define its clock, seek generation, cancellation and output semantics.

#### Scenario: Ordinary Canvas node requests PCM

- **WHEN** a normal audio/video node follows the production playback path
- **THEN** tests observe the native consumer and no PCM registration
- **AND** a poisoned ordinary-node PCM path is not invoked

#### Scenario: Future Canvas processing operation needs samples

- **WHEN** an approved Canvas operation declares a concrete signal-processing requirement
- **THEN** it may request a versioned PCM/processed descriptor through its own contract
- **AND** that capability does not change ordinary node playback

### Requirement: Preview SHALL route every content kind through its owning viewer

Preview SHALL continue to use the package-owned viewer registry for image, audio, video, document
and model content. Audio and video SHALL prefer native elements with gateway URLs. PDF/CBZ and other
document viewers SHALL use their declared Range or bounded content adapter. GLB SHALL use a single
resource when possible, while glTF external buffers/textures SHALL use an exact resource set.
Desktop Renderer and Main MUST NOT create parallel viewers or infer a viewer solely from URL syntax.

#### Scenario: Preview opens audio or video

- **WHEN** a Preview session resolves an accepted audio or video source
- **THEN** the owning AudioPlayer or VideoPlayer consumes the authorized HTTP URL
- **AND** no Desktop-local media component or PCM fallback replaces it

#### Scenario: Preview opens a PDF

- **WHEN** the package-owned PDF viewer requests ranges from an authorized document
- **THEN** the Preview/content adapter and gateway serve the exact document revision with correct MIME and Range
- **AND** the Renderer receives neither an absolute path nor a generic file API

#### Scenario: Preview opens glTF with external resources

- **WHEN** the package-owned model viewer resolves a glTF source with declared relative dependencies
- **THEN** it receives one authorized entry URL whose relative requests remain inside the frozen resource set
- **AND** an unknown dependency fails rather than broadening directory authorization

### Requirement: Preview projections SHALL follow exact session lifecycle

Temporary, pinned, side and quick Preview SHALL each revoke their resource capabilities when their
owning source/session is replaced or disposed. Revision, Window, View and renderer epoch mismatch
MUST fail visibly and MUST NOT fall back to the active or most recent Preview.

#### Scenario: Hover Preview ends

- **WHEN** pointer leave, request fencing or replacement ends a quick Preview
- **THEN** its image/audio/video capability is revoked
- **AND** a late media load cannot reuse the old URL

#### Scenario: Two Preview sessions are open

- **WHEN** one Preview closes while another remains active
- **THEN** only the closing session's capabilities are revoked
- **AND** the other session retains its exact resource registrations

### Requirement: Agent attachment and display projection SHALL remain separate

Agent/Pi messages, attachment metadata, Tool results and provider inputs SHALL retain stable
resource or path facts. For an authorized displayable resource, the conversation display projector
SHALL add a transient HTTP render URL for the Agent Webview and package-owned audio/video cards
SHALL use native elements, but that URL MUST NOT replace the original stable field or become input
to reasoning, provider upload or later Tool execution.

#### Scenario: Tool result includes a local video

- **WHEN** a Tool result contains a stable resource plus a local displayable source
- **THEN** the Webview projection preserves the stable resource and adds only a transient render URL
- **AND** the video card plays the render URL through native `<video>`

#### Scenario: Local media cannot be authorized for display

- **WHEN** Agent display projection cannot resolve or authorize the source
- **THEN** it emits a visible resource-projection diagnostic and omits the unsafe render URL
- **AND** it does not substitute `file:`, `data:`, a raw absolute path or an unrelated recent resource

### Requirement: Agent file operations SHALL use Host-authorized filesystem paths

Agent `Read`, `Write`, `ReadImage`, `ReadDocument` and other typed file Tools SHALL continue through
PathAccessPolicy, ContentReadService and owning writers. Agent-visible inputs SHALL remain
workspace-relative paths or stable locators; Desktop Host SHALL resolve the concrete system path
only inside the authorized execution boundary. Ordinary Agent sessions MUST NOT receive a gateway
URL as a filesystem path or gain Bash access from this transport change.

#### Scenario: Agent reads an attachment

- **WHEN** Agent needs the bytes or structure of an authorized attachment
- **THEN** the Host resolves its stable resource through the appropriate content/file Tool
- **AND** Pi does not fetch the Renderer display URL

#### Scenario: Agent writes a workspace file

- **WHEN** an authorized write Tool accepts a workspace-relative target
- **THEN** Host validates containment and ownership before resolving and writing the system path
- **AND** the saved fact remains portable rather than storing the absolute path

#### Scenario: Agent requests an unauthorized absolute path

- **WHEN** a file Tool receives an unmanaged or out-of-scope absolute path
- **THEN** PathAccessPolicy returns a fail-visible diagnostic
- **AND** the gateway token or Renderer authorization does not grant filesystem access

### Requirement: Authorized shell execution SHALL not consume HTTP resource URLs

Ordinary creative Agent sessions SHALL remain unable to invoke arbitrary Bash. If Developer Mode or
an audited processor explicitly authorizes shell execution, Host SHALL validate executable, cwd,
environment, network, input/output roots, approval and cancellation, then execute against real
Host-resolved paths. Gateway URLs MUST NOT be passed as file arguments or treated as writable
destinations. Produced files SHALL become Host-owned locators before any durable promotion.

#### Scenario: Authorized processor invokes a command

- **WHEN** a typed processor is approved to operate on an authorized media input
- **THEN** Host materializes or resolves the exact filesystem input and allocated output inside its execution scope
- **AND** the command receives no `neko-media:` or loopback display URL

#### Scenario: Shell command produces a media file

- **WHEN** the authorized process completes successfully
- **THEN** Host validates the allocated output and returns a stable output locator
- **AND** only an owning workflow may promote it into Canvas, Cut, Asset or project facts

### Requirement: Finite resources and live media SHALL use different runtime paths

The system SHALL route finite local files and bounded point-on-demand manifests/segments through
the HTTP gateway only when an owning consumer requests that projection. Camera, microphone, screen
capture, calls and unbounded live streams SHALL use an authorized `MediaStream`, WebRTC or a
dedicated live runtime with its own lifecycle and diagnostics. A live source MUST NOT be represented
as a seekable gateway file or one-shot PCM resource merely to reuse this contract.

#### Scenario: Preview plays a local HLS package

- **WHEN** an audited Preview consumer supports a local HLS/DASH manifest and its exact segments
- **THEN** the Host may publish them as one bounded authorized resource set
- **AND** undeclared segments or remote origins remain unavailable

#### Scenario: Character runtime captures microphone input

- **WHEN** a user authorizes a real-time microphone session
- **THEN** the runtime projects an owned MediaStream through the dedicated capture boundary
- **AND** it does not create an HTTP file capability for the live device

### Requirement: Consumer instances SHALL own independent mutable playback state

Every Cut document, Canvas View, Preview session and Agent conversation display projection SHALL
own its own mutable playback generation, subscriptions and resource handles. Active UI selection
MUST NOT be used as a fallback owner. Operations and release events SHALL carry exact instance
identity, and stale identity SHALL fail visibly.

#### Scenario: Two Canvas Views play different media

- **WHEN** two Canvas instances have independent active media nodes
- **THEN** each instance controls and releases only its own native element and gateway capabilities
- **AND** selecting one Canvas does not retarget the other's playback state

#### Scenario: Stale release arrives

- **WHEN** a release or playback result carries a previous renderer epoch or generation
- **THEN** the owning runtime rejects it or limits it to the stale generation cleanup
- **AND** it does not stop the current active instance

### Requirement: Migration SHALL prove the HTTP path and poison legacy success

Producer/consumer tests and real Electron scenarios SHALL assert that the exact HTTP gateway,
package-owned viewer/player and intended native or PCM consumer were reached. `neko-media:`,
`MediaTransport: 'authorized'`, Desktop upstream proxy, Canvas ordinary PCM and any private
`media:`/`video:`/`audio:` scheme SHALL be removed or poisoned so they cannot contribute to a
successful new-path result.

#### Scenario: Cut playback succeeds after migration

- **WHEN** a real Electron Cut fixture reaches changing video frames and advancing PCM timeline audio
- **THEN** evidence records direct gateway Range plus the Cut PCM client
- **AND** a poisoned `neko-media:` handler and proxy remain untouched

#### Scenario: Canvas and Preview playback succeed after migration

- **WHEN** real Electron fixtures play Canvas audio/video and Preview audio/video/model/document resources
- **THEN** evidence records the package-owned native consumers and exact gateway routes
- **AND** poisoned ordinary Canvas PCM and legacy custom-scheme paths remain untouched
