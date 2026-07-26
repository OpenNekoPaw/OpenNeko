# node-media-runtime-retirement Specification

## ADDED Requirements

### Requirement: Product composition excludes Neko Engine before replacement

The OpenNeko product SHALL remove `neko-engine` from feature activation,
manifest dependency, command/capability discovery, package grouping, native
staging, and release composition before remaining media consumers are rebuilt.

#### Scenario: Product activates

- **WHEN** the OpenNeko VS Code extension activates during migration
- **THEN** no Engine feature or native Engine runtime is activated
- **AND** no Engine command is registered as an available media capability

#### Scenario: Replacement is not connected

- **WHEN** a media feature is invoked before its Node/FFmpeg adapter is connected
- **THEN** it returns an explicit unavailable/implementation diagnostic
- **AND** it does not call an Engine command, optional Engine provider, or mock

### Requirement: Engine retirement is enforced mechanically

The repository SHALL reject production Engine imports, package dependencies,
commands, routes, DTO consumers, and fallback mocks outside the quarantined
deletion target.

#### Scenario: Legacy reference is introduced

- **WHEN** a product package introduces a prohibited Engine reference
- **THEN** the quality gate fails and reports the file and matched surface

#### Scenario: Canonical path test runs

- **WHEN** a rebuilt media feature test executes
- **THEN** it observes the Node/FFmpeg domain adapter
- **AND** the absent or poisoned Engine path is not invoked

### Requirement: Shared media infrastructure remains domain-neutral

The system SHALL provide shared probe, preparation, PCM, extraction, export, and
lifecycle infrastructure without exposing a broad product-level Engine facade.

#### Scenario: Domain consumes media

- **WHEN** Preview, Canvas, Tools, Agent, Assets, or Cut needs media processing
- **THEN** it calls its own narrow domain port
- **AND** the composition root injects the shared Node/FFmpeg adapter

#### Scenario: Webview consumes prepared media

- **WHEN** a Webview receives a prepared video or PCM descriptor
- **THEN** the descriptor contains opaque loopback URLs and explicit version,
  format, and session identity
- **AND** it contains no local path or Node/VS Code object

### Requirement: Media operations are explicit FFmpeg jobs

The system SHALL implement probe, frame/thumbnail capture, waveform generation,
audio/subtitle extraction, analysis input decoding, proxy preparation,
transcode, and export as cancellable FFmpeg/ffprobe jobs owned by the Extension
Host.

#### Scenario: Read media on demand

- **WHEN** a bounded timestamp, stream, or interval is requested
- **THEN** the host uses bounded seek/range/process inputs and streams or writes
  the bounded result
- **AND** it does not first load the full source into Webview or JavaScript
  memory

#### Scenario: Job fails or is cancelled

- **WHEN** FFmpeg fails, output validation fails, or cancellation occurs
- **THEN** incomplete artifacts are not published
- **AND** owned processes, sessions, responses, and temporary files are released

### Requirement: Preview policy is declared and testable

The system SHALL use a qualified direct-play profile for H.264 and VP8, explicit
remux/transcode for other inputs, framed PCM for OpenNeko-owned audible
playback, and an explicit HDR preservation or SDR tone-map profile.

#### Scenario: Source is not qualified for direct play

- **WHEN** the actual VS Code Webview does not qualify the source codec,
  container, bit depth, or HDR profile
- **THEN** the host prepares the declared proxy profile
- **AND** it reports that conversion rather than presenting it as direct play

#### Scenario: PCM synchronization

- **WHEN** OpenNeko owns the playback timeline and audio is present
- **THEN** the video element is muted
- **AND** the domain controller synchronizes video to the PCM or declared
  timeline clock

### Requirement: Obsolete Engine code is deleted only after closure is empty

The repository SHALL physically delete the Engine package, client/protocol
surface, and native build machinery after executable consumers have been
removed and replacements pass canonical-path validation.

#### Scenario: Deletion audit passes

- **WHEN** runtime, manifest, protocol, native, build, test, and current
  documentation searches report zero Engine ownership
- **THEN** `packages/neko-engine` and obsolete Engine client code are deleted

#### Scenario: Executable consumer remains

- **WHEN** an executable consumer is found during the deletion audit
- **THEN** physical deletion is blocked
- **AND** the consumer must be removed or rebuilt without restoring product
  Engine composition

### Requirement: Runtime validation uses an isolated generated workspace

The system SHALL generate and use a dedicated synthetic media workspace for
Extension Development Host and Webview validation.

#### Scenario: Media runtime acceptance starts

- **WHEN** a developer starts the media runtime validation launch
- **THEN** the prelaunch task rebuilds
  `.tmp/vscode-test-workspaces/media-runtime`
- **AND** the Development Host opens only that fixture workspace
- **AND** it does not use `neko-test` or a normal user workspace
