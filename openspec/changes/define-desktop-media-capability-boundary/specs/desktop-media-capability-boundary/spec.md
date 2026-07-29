## ADDED Requirements

### Requirement: Desktop MUST separate host freedom from renderer capability

The Desktop architecture MUST treat removal of VS Code Webview URI, iframe and
host CSP restrictions as a host transport change. It MUST NOT infer 10-bit,
HDR, codec or display correctness from using Electron because the renderer
continues to use Chromium media and compositor paths.

#### Scenario: Electron opens a 10-bit HDR file

- **WHEN** a 10-bit HDR source reaches playable state in an Electron `<video>`
- **THEN** the product records only direct decode success
- **AND** it does not declare 10-bit or HDR output without qualified display-chain evidence

### Requirement: Source, preview and export capability MUST be independent

The media contract MUST distinguish source decode/process capability, preview
output capability and export fidelity. SDR preview MUST remain the baseline
until the exact release target and output chain qualify an HDR preview profile.

#### Scenario: HDR source is displayed on an unqualified target

- **WHEN** FFprobe identifies PQ or HLG content and the current output chain is not qualified
- **THEN** the playback plan selects an explicit platform-hardware HDR-to-SDR prepared file or
  returns an actionable unavailable diagnostic
- **AND** the UI identifies the state as HDR source with SDR preview
- **AND** HDR export eligibility remains independently determined by the export adapter

### Requirement: Desktop media transport MUST be authorized and streamable

The Desktop Host MUST project opaque, short-lived media URLs through a secure
streaming custom protocol. The handler MUST support GET, HEAD, closed Range,
206 responses, MIME, token/owner/session validation, cancellation, backpressure
and cleanup. It MUST NOT expose local paths or use `file://`.

#### Scenario: User seeks within a large local video

- **WHEN** the renderer seeks to a time that is not currently buffered
- **THEN** native `<video src>` requests only the authorized byte range
- **AND** the handler returns a valid 206 response without exposing the source path
- **AND** cancellation closes the response and associated resources

### Requirement: Direct playback MUST use an explicit release manifest

The Host MUST choose direct, remux, platform-hardware prepared file or reject from FFprobe facts and a
fixture-backed manifest keyed by Electron/Chromium, OS, architecture, packaged
FFmpeg and media profile. Browser capability APIs MAY invalidate or narrow the
manifest but MUST NOT silently expand it. Native `<video src>` MUST be the only
renderer video path; `MediaSource`, `SourceBuffer`, whole-video fetch and CPU
fallback MUST NOT return success.

#### Scenario: A codec plays on one developer machine

- **WHEN** a non-manifest HEVC, AV1, VP9, ProRes, 10-bit or HDR profile happens to play
- **THEN** the release plan continues to use its declared platform-hardware prepared-file or reject path
- **AND** direct playback is enabled only after a new target fixture is accepted

### Requirement: Desktop MUST retain strict renderer security

Desktop renderer windows MUST keep Node integration disabled, context isolation
and sandbox enabled, and `webSecurity` enabled. The app MUST define a restrictive
CSP and MUST NOT enable custom-protocol `bypassCSP` to make media work.

#### Scenario: Renderer requests an unauthorized resource

- **WHEN** renderer content requests `file://`, an arbitrary local path, arbitrary localhost,
  an unknown custom-protocol token or an unknown IPC channel
- **THEN** the request fails visibly
- **AND** no compatibility fallback, CSP bypass or direct disk access succeeds

### Requirement: HDR and 10-bit claims MUST use target-specific output evidence

Every HDR/10-bit preview claim MUST be tied to an exact Electron/Chromium,
OS, architecture, GPU/driver, display and connection configuration. Browser
support flags, playback state and screenshots MUST NOT be sufficient evidence.

#### Scenario: Window moves to a different display

- **WHEN** a window using an HDR-qualified preview moves to a display whose output chain is not qualified
- **THEN** the previous capability snapshot is invalidated
- **AND** preview changes to the SDR baseline or stops with an actionable diagnostic

### Requirement: Desktop media qualification MUST respect the closed release platform set

Desktop media qualification MUST initially cover only the repository's canonical
`darwin-arm64` and `linux-x64` release targets. Windows and other targets MUST
remain unsupported until a separate platform-contract change supplies real
target packaging, startup, transport, media and color evidence.

#### Scenario: Windows Desktop media support is proposed

- **WHEN** a change proposes Windows direct playback, custom protocol or HDR support
- **THEN** it first updates the closed platform contract through a separate OpenSpec
- **AND** evidence from macOS, cross-compilation or Chromium documentation is rejected as Windows qualification
