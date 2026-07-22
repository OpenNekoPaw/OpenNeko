## ADDED Requirements

### Requirement: Canonical Linux FFmpeg runtime entities

Linux Engine packaging MUST materialize exactly one regular runtime file for each configured FFmpeg library, and that file MUST use the library's unique major-version `SONAME` filename.

#### Scenario: Archive contains the normal linker alias chain

- **WHEN** a configured library is represented by unversioned, major-version, and fully versioned archive entries that resolve to the same ELF file
- **THEN** packaging copies only the major-version `SONAME` filename as one regular destination file

#### Scenario: Multiple configured libraries are packaged

- **WHEN** the Linux FFmpeg archive contains a valid alias chain for every configured library
- **THEN** the closure contains exactly one materialized destination file per configured library

### Requirement: Fail-visible Linux closure validation

Linux Engine packaging MUST fail before VSIX creation when a configured FFmpeg library has no unique major-version candidate or when the selected ELF `SONAME` does not equal that candidate.

#### Scenario: Major-version alias is missing

- **WHEN** a configured library has only an unversioned or fully versioned archive entry
- **THEN** packaging fails with a diagnostic identifying the library and the missing unique major-version alias

#### Scenario: Major-version alias is ambiguous

- **WHEN** a configured library has more than one major-version alias
- **THEN** packaging fails with a diagnostic listing the ambiguous candidates

#### Scenario: ELF SONAME disagrees with the selected alias

- **WHEN** the selected source ELF reports a different `SONAME` than its major-version filename
- **THEN** packaging fails with a diagnostic containing both names

### Requirement: Linux native loader contract remains local

The packaged Linux N-API module MUST continue to resolve its FFmpeg runtime dependencies from its own directory through `$ORIGIN`, and every FFmpeg `DT_NEEDED` name requested by the module or a bundled FFmpeg library MUST exist in the materialized closure.

#### Scenario: Deduplicated closure is bundled

- **WHEN** Linux FFmpeg runtime entities have been materialized successfully
- **THEN** packaging sets the N-API module runtime search path to `$ORIGIN` before creating the Engine VSIX

#### Scenario: Native binary requests a different FFmpeg major version

- **WHEN** the N-API binary requests an FFmpeg `DT_NEEDED` name that is absent from the materialized runtime-name set
- **THEN** packaging fails with a diagnostic naming the consumer and missing dependency before VSIX creation

#### Scenario: Bundled FFmpeg dependency is incomplete

- **WHEN** a materialized FFmpeg library requests another FFmpeg `DT_NEEDED` name that is absent from the closure
- **THEN** packaging fails with a diagnostic naming the consumer and missing dependency

### Requirement: Configured FFmpeg build SDK

CI and Release platform packaging MUST compile the N-API binary against the FFmpeg development source configured for the same target before bundling the runtime closure, and Linux MUST use the checksum-verified BtbN development artifact.

#### Scenario: Platform package build starts

- **WHEN** CI or Release builds `host-napi` for a supported target
- **THEN** it prepares the configured FFmpeg development source first and passes that explicit workspace prefix to the native build

### Requirement: Build SDK exclusion

The FFmpeg development SDK under the Engine `deps/` tree MUST remain a build-time input and MUST NOT appear in either the standalone Engine VSIX or the composed OpenNeko VSIX.

#### Scenario: Engine platform VSIX is created

- **WHEN** platform packaging runs after preparing the configured FFmpeg development SDK
- **THEN** VSIX inclusion rules exclude the complete `deps/` tree while retaining the materialized `packages/host-napi` runtime closure

#### Scenario: A feature payload contains a build dependency tree

- **WHEN** the OpenNeko assembler inspects an extracted feature payload containing a `deps/` path segment
- **THEN** composition fails visibly before creating the final VSIX and identifies the forbidden build input
