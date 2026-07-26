# qualified-hdr-media-runtime Specification

## ADDED Requirements

### Requirement: Packaged FFmpeg identity is deterministic

Each supported OpenNeko target SHALL stage exact FFmpeg and ffprobe
executables with target, version, SHA256, license, and required capability
metadata.

#### Scenario: Packaged media runtime activates

- **WHEN** OpenNeko activates from a packaged target
- **THEN** the composition root selects only the staged verified executables
- **AND** feature media adapters receive those executable paths

#### Scenario: Runtime is missing or mismatched

- **WHEN** executable bytes, target, version, or capability signature do not
  match the descriptor
- **THEN** media activation fails with an actionable diagnostic
- **AND** it does not fall back to PATH, Neko Engine, or browser-native audio

### Requirement: Video processing is hardware-only

HDR10/PQ and HLG sources SHALL use either a narrowly qualified native Webview
profile or a declared all-hardware SDR preview graph. Probe codec and container
facts alone MUST NOT authorize native playback. Preview MUST NOT use CPU video
decode, filters, transcoding, proxy generation, or a software fallback.

#### Scenario: MP4 AV1 native playback is qualified

- **WHEN** the active Preview Webview has proved MP4 AV1 frame output for the
  active Electron runtime rather than relying on `canPlayType()` alone
- **AND** the source is AV1 in an MP4-family container
- **THEN** the host publishes the original bytes through tokenized HTTP Range
- **AND** audio, when present, continues through OpenNeko PCM

#### Scenario: Electron only reports AV1 type support

- **WHEN** `canPlayType()` reports MP4 AV1 support without real frame-output
  qualification
- **THEN** Preview reports AV1 native playback as unqualified
- **AND** the source may use only a separately qualified all-hardware H.264 SDR
  preview path

#### Scenario: WebM VP9 is qualified through MP4 remux

- **WHEN** the active Preview Webview reports MP4 VP9 playback capability
- **AND** the source is VP9 in WebM
- **THEN** the host remuxes the video stream without re-encoding into MP4
- **AND** does not authorize WebM direct playback from `canPlayType()` alone

#### Scenario: VideoToolbox closure exists

- **WHEN** VideoToolbox supports the source decoder
- **AND** `scale_vt` color conversion and scaling has real-host output
  qualification for the source color profile
- **AND** `h264_videotoolbox` hardware encode is available
- **THEN** FFmpeg keeps decoded and filtered video in VideoToolbox hardware
  frames and emits the H.264 SDR preview
- **AND** software encoder fallback is disabled

#### Scenario: Required closure is absent

- **WHEN** any required hardware decoder, hardware encoder, hardware filter, or
  output qualification is missing
- **THEN** proxy preparation fails before output publication
- **AND** the failure identifies the unavailable hardware capability
- **AND** no direct-play, CPU-processing, or untagged-SDR fallback is attempted

#### Scenario: Apple M2 rejects AV1 hardware decode

- **WHEN** VideoToolbox rejects the AV1 Main10 source decoder on Apple M2
- **THEN** Preview reports a media-runtime-unavailable diagnostic
- **AND** does not classify the valid source as corrupt
- **AND** does not retry through Chrome software decode, an FFmpeg software
  decoder, CPU filters, or `libx264`

### Requirement: Preview media operation failures are observed

Preview SHALL observe every asynchronous Webview message operation and SHALL
distinguish optional poster capture from playback preparation.

#### Scenario: HDR poster capture is unavailable

- **WHEN** HDR frame capture would require CPU filtering or hardware readback
- **THEN** the Extension Host consumes the rejection
- **AND** the Webview receives a hardware-only capture-frame diagnostic without
  invalidating a separately available playback route
- **AND** no `unhandledRejection` is emitted

#### Scenario: Playback preparation fails

- **WHEN** the selected playback profile cannot be prepared
- **THEN** the Webview receives a playback diagnostic
- **AND** the failed media session is disposed

### Requirement: Capability diagnostics retain the player surface

Preview SHALL project media capability failures as stable, localized notices
inside the mounted player. It MUST NOT replace the complete player with a raw
runtime error message.

#### Scenario: Hardware decoder is unavailable

- **WHEN** VideoToolbox rejects the source decoder
- **THEN** the video element, metadata, controls, and editor session remain
  mounted
- **AND** Preview shows a localized hardware-decoder notice with a source or
  device recommendation
- **AND** raw FFmpeg or runtime implementation text is not used as the primary
  user message

#### Scenario: HDR poster capture is disabled

- **WHEN** the hardware-only policy prevents HDR frame capture
- **THEN** Preview shows a localized informational poster notice
- **AND** the play action and transport controls remain available
- **AND** the notice does not claim that the source file is corrupt

### Requirement: Preview replacement is generation-safe

Preview seek and speed changes SHALL replace the current video and PCM
generation without treating intentional teardown as media corruption.

#### Scenario: User seeks while video and PCM are playing

- **WHEN** the player seeks the existing native video source and stops the old
  PCM session
- **THEN** the editor-scoped video descriptor remains registered and Chromium
  seeks it through HTTP Range without another remux or transcode
- **AND** intentional FFmpeg termination is consumed as cancellation
- **AND** the replacement descriptor starts at the requested media time

#### Scenario: Native video source is finally released

- **WHEN** the preview panel is disposed or its source changes
- **THEN** clearing the native video source does not unmount the video element
- **AND** the editor-scoped file session is revoked exactly once

#### Scenario: Playback requests overlap

- **WHEN** a newer seek arrives before prior preparation completes
- **THEN** the provider publishes only the latest owned PCM generation
- **AND** every superseded PCM session is stopped
- **AND** the one editor-scoped video session remains unchanged

#### Scenario: Superseded Webview connection rejects

- **WHEN** a newer playback descriptor supersedes a Webview PCM connection
- **AND** the obsolete connection later rejects
- **THEN** the obsolete client is disposed
- **AND** its rejection does not unmount the video element or overwrite the
  current generation with an error view

#### Scenario: Replay after PCM reaches EOF

- **WHEN** the finite PCM generation and media timeline reach playback EOF
- **THEN** Preview marks that PCM generation spent instead of treating it as a
  resumable connection
- **AND** retains the editor-scoped video URL and shared `AudioContext`
- **AND** replay from zero creates a new PCM generation without republishing or
  reloading the video source

### Requirement: Obsolete Range requests cancel cleanly

The tokenized loopback transport SHALL distinguish a browser-aborted response
from a media runtime or file IO failure.

#### Scenario: Chromium replaces an active Range request

- **WHEN** the Webview closes an in-flight file response during seek or source
  replacement
- **AND** Node reports `ERR_STREAM_PREMATURE_CLOSE` after the response closes
- **THEN** the loopback server completes that request without an error
  diagnostic or synthetic 500 response
- **AND** later Range requests for the same token remain available

### Requirement: Partial corruption retains valid interval evidence

The media runtime SHALL report the narrowest proven corruption scope and retain
successful results from unaffected intervals.

#### Scenario: Advertised timestamp has no decodable frame

- **WHEN** probe succeeds but a bounded frame request reaches early EOF or
  returns no frame
- **THEN** that result is `corrupt/interval`
- **AND** successful captures, PCM, or preview-prefix results remain usable

#### Scenario: Container cannot be opened

- **WHEN** ffprobe cannot read the source/container
- **THEN** the operation reports source corruption
- **AND** does not present the file as partially validated.
