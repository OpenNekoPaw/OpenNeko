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

### Requirement: HDR input uses a qualified tone-map profile

HDR10/PQ and HLG sources SHALL use a declared SDR proxy graph in VS Code until
an HDR-preserving Webview profile is separately qualified.

#### Scenario: Required closure exists

- **WHEN** source decode, H.264 encode, `zscale`, and `tonemap` are qualified
- **THEN** the host decodes the 10-bit source, tone maps in linear/float space,
  converts to BT.709, and emits an H.264/yuv420p proxy

#### Scenario: Required closure is absent

- **WHEN** any required decoder, encoder, or filter is missing
- **THEN** proxy preparation fails before output publication
- **AND** no direct-play or untagged-SDR fallback is attempted

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
