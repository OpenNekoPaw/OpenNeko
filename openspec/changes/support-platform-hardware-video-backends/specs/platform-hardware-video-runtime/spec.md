## ADDED Requirements

### Requirement: Hardware video processing is target-specific

The Node media runtime SHALL select a complete hardware video processing
backend for each supported release target and SHALL NOT expose a
platform-specific implementation as the shared contract.

#### Scenario: macOS performs hardware video processing

- **GIVEN** a qualified `darwin-arm64` media runtime
- **WHEN** a source requires frame capture or H.264 SDR conversion
- **THEN** the runtime SHALL use VideoToolbox decode surfaces
- **AND** SHALL use `scale_vt` and `h264_videotoolbox`
- **AND** software encoding fallback SHALL be disabled

#### Scenario: Linux performs hardware video processing

- **GIVEN** a qualified `linux-x64` media runtime and VAAPI device
- **WHEN** a source requires frame capture or H.264 SDR conversion
- **THEN** the runtime SHALL use VAAPI decode surfaces
- **AND** HDR sources SHALL use `tonemap_vaapi`
- **AND** SHALL use `scale_vaapi` and `h264_vaapi`
- **AND** decoded video SHALL NOT cross into a CPU video filter before encode

#### Scenario: The platform hardware closure is unavailable

- **WHEN** the required build capability, device, driver, decoder, filter, or
  encoder is unavailable
- **THEN** the operation SHALL return an explicit backend capability diagnostic
- **AND** SHALL NOT retry through CPU video processing
- **AND** SHALL NOT report the operation as successful

### Requirement: Packaged runtimes declare their hardware backend floor

Each packaged media runtime SHALL declare and verify the FFmpeg capabilities
required by its target hardware video backend.

#### Scenario: A Linux runtime omits VAAPI

- **WHEN** a `linux-x64` descriptor omits the `vaapi` hardware accelerator,
  `h264_vaapi`, `scale_vaapi`, or `tonemap_vaapi`
- **THEN** packaging or runtime verification SHALL fail visibly

#### Scenario: Portable logic tests run on another host

- **WHEN** a test asserts backend command planning, caching, or error
  classification
- **THEN** it SHALL inject the backend being tested
- **AND** SHALL NOT infer the expected backend from the test runner platform

### Requirement: Remote media integration tests declare their FFmpeg dependency

Every remote workflow job that executes the media integration test graph SHALL
install FFmpeg from the repository-owned shared test dependency list.

#### Scenario: Release tests generate media fixtures

- **WHEN** the Release Tests job invokes the repository test graph
- **THEN** it SHALL install the shared media runtime test dependencies first
- **AND** it SHALL NOT rely on the runner image PATH implicitly containing
  FFmpeg
- **AND** media integration tests SHALL NOT be skipped to hide a missing
  dependency

### Requirement: New platform targets provide a complete hardware closure

A new release platform SHALL add hardware video support through the shared
backend strategy and SHALL qualify decode, filter, and encode together.

#### Scenario: Windows support is proposed

- **WHEN** a Windows release target is added
- **THEN** its design SHALL select and qualify a complete device-compatible
  hardware pipeline
- **AND** D3D11VA decode capability alone SHALL NOT satisfy the contract
- **AND** Media and Cut callers SHALL remain free of Windows-specific branches
