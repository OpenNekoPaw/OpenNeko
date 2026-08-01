## ADDED Requirements

### Requirement: Neko Tools retains media comparison as an owning capability

Neko Tools SHALL compare explicit image, audio and video resource pairs, including supported Git revision materializations, through one Tools-owned media comparison service. It MUST NOT route media comparison through Timeline/NKV analyzers, an active editor fallback or Engine-prefixed DTOs.

#### Scenario: A user compares two supported media resources

- **WHEN** the Host resolves two explicit resources of the same supported media kind
- **THEN** the Tools media comparison service SHALL invoke the matching image, audio or video path through the selected `@neko/media` adapter
- **AND** no Timeline, NKV, JVI or legacy Engine diff path participates

#### Scenario: The requested resources are unsupported or incompatible

- **WHEN** resource resolution or kind validation cannot establish a supported comparison
- **THEN** the request SHALL return an explicit diagnostic
- **AND** it SHALL NOT return an empty result, guessed kind or fallback comparison

### Requirement: Tools contracts are package-owned and runtime validated

The Extension and Webview SHALL communicate through the zero-dependency `@neko-tools/contracts` package. Every request and event SHALL include a supported schema version, explicit `sessionId` and `requestId`, and SHALL be runtime validated before use.

#### Scenario: A valid result reaches its owning viewer

- **WHEN** a result passes schema and value validation and its session/request identity matches a live viewer
- **THEN** the Webview SHALL render the result variant matching its declared media kind

#### Scenario: A stale or malformed message arrives

- **WHEN** a message has an unknown version/type, invalid numeric value, missing identity or a stale session/request identity
- **THEN** the receiver SHALL reject it with a visible diagnostic
- **AND** it SHALL NOT apply it to the active or most recent viewer

### Requirement: Media metrics and artifacts are truthful

Computed results SHALL contain only values and artifacts produced by the selected analysis path. Ratio fields SHALL use the inclusive `0..1` range, time fields SHALL declare their unit, and presentation-only display modes SHALL NOT be represented as computed artifacts.

#### Scenario: Image SSIM is converted to a difference ratio

- **WHEN** the runtime reports a valid SSIM value
- **THEN** the image result SHALL expose the corresponding difference ratio exactly once in the `0..1` range
- **AND** no analyzer SHALL divide the ratio by 100 again

#### Scenario: An artifact is not computed

- **WHEN** the analysis path does not produce a heatmap, histogram or other artifact
- **THEN** the result SHALL omit that field
- **AND** it SHALL NOT use an empty string, fixed zero or fabricated URI to represent success

#### Scenario: A viewer applies a visual comparison mode

- **WHEN** the user selects overlay, curtain, onion-skin or a supported GPU transform
- **THEN** the Webview MAY apply it as recoverable per-viewer presentation state
- **AND** it SHALL NOT label the mode as a persisted or computed analysis artifact

### Requirement: Cancellation owns the full process lifecycle

Each media comparison request SHALL own an independent cancellation signal, child-process scope and temporary-resource scope. User cancellation, timeout, supersession and viewer disposal SHALL abort the actual media operations, wait for child-process exit and only then clean temporary resources.

#### Scenario: A user cancels an in-flight comparison

- **WHEN** the owning viewer cancels a request
- **THEN** the same request signal SHALL reach every active media operation and FFmpeg child process
- **AND** the Host SHALL wait for termination before reporting `cancelled` and cleaning temporary resources

#### Scenario: A request times out

- **WHEN** the configured request deadline expires
- **THEN** the Host SHALL abort the request rather than only winning a detached promise race
- **AND** no child process or later success event SHALL survive the timeout

#### Scenario: Two viewers compare concurrently

- **WHEN** one viewer cancels or disposes its request while another request is active
- **THEN** only the matching `sessionId` and `requestId` resources SHALL be terminated
- **AND** the other request SHALL remain unaffected

### Requirement: Media Info reports probed facts

The retained Media Info command SHALL resolve an explicit resource and use the media probe path to present available, serializable metadata or a diagnostic. It MUST NOT report guessed extension-only metadata as a successful probe.

#### Scenario: Probe succeeds

- **WHEN** the selected resource is readable and the media adapter returns probe data
- **THEN** Media Info SHALL present the supported metadata projection without local process handles, tokens or internal paths

#### Scenario: Probe fails

- **WHEN** the resource is unreadable, unsupported or probe execution fails
- **THEN** Media Info SHALL show the owning diagnostic
- **AND** it SHALL NOT silently show only the file path and inferred kind as if probing succeeded

### Requirement: Electron Desktop validates the retained user path

Media comparison changes SHALL be validated in Electron Desktop using isolated image, audio and video fixtures. The validation SHALL cover compare, Git comparison where supported, cancellation/timeout, concurrent viewers, Media Info and disposal.

#### Scenario: A retained comparison release candidate is evaluated

- **WHEN** the package build and automated tests pass
- **THEN** the current Electron Desktop build SHALL complete the focused fixture scenarios
- **AND** sanitized evidence SHALL prove the package-owned handler, media adapter and matching renderer were used
