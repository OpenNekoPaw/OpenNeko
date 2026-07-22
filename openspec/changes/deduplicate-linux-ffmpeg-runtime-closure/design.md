## Context

The BtbN Linux FFmpeg archive represents each shared library with a normal linker chain: an unversioned alias points to a major-version alias, which points to the fully versioned ELF file. The current bundler enumerates every `lib<name>.so*` entry, resolves every entry with `realpathSync`, and copies the resolved bytes under each alias name. VSIX packaging therefore sees three regular files instead of one binary plus filesystem aliases and compresses hundreds of megabytes of avoidable duplicate data.

The runtime contract is different from the build-time linker contract. Packaged ELF consumers resolve the `DT_NEEDED`/`SONAME` major name such as `libavcodec.so.62`; neither the unversioned link-time alias nor the fully versioned archive filename is required in the runtime closure.

Inspection of the published `0.0.2` Linux payload exposed a second contract violation: the N-API binary was linked against Ubuntu's FFmpeg 6 names such as `libavcodec.so.60`, while packaging later replaced its runtime with the pinned BtbN FFmpeg 8 closure containing `libavcodec.so.62`. The platform build therefore needs one configured FFmpeg SDK identity from compilation through packaging, plus a final `DT_NEEDED` closure check.

The same inspection found that both supported N-API binaries link `avdevice` directly while the shared `ffmpegLibs` package configuration omitted it. The canonical configuration must include `avdevice` so macOS and Linux both materialize the complete direct closure.

## Goals / Non-Goals

**Goals:**

- Materialize exactly one regular file per configured FFmpeg library in the Linux Engine package.
- Name that file with the unique major-version alias and validate that it matches the source ELF `SONAME`.
- Keep the existing `$ORIGIN` native loader contract and make malformed archive layouts fail visibly.
- Prove that every FFmpeg dependency requested by the N-API binary or another bundled FFmpeg library is present by exact runtime name.
- Build the platform N-API binary against the FFmpeg development source selected by package configuration, including the verified artifact on Linux.
- Provide a fast regression test using real symlinks so a future alias dereference loop cannot reintroduce duplicate entities.

**Non-Goals:**

- Changing the pinned BtbN artifact, supported platform matrix, Rust/N-API ABI, or final OpenNeko artifact names.
- Deduplicating arbitrary VSIX files after packaging.
- Adding a compatibility fallback for malformed FFmpeg archives or missing ELF tooling.

## Decisions

### Engine packaging owns closure materialization

The fix remains in the Engine packaging boundary because this is where the native runtime and dynamic-loader contract are known. The OpenNeko assembler continues to treat the Engine VSIX as an opaque build input.

Alternative considered: deduplicate files while composing the final OpenNeko VSIX. Rejected because that would couple the application root to ELF semantics and allow the standalone Engine artifact to remain defective.

### The major-version SONAME is the canonical runtime filename

For each configured library, the bundler selects exactly one filename matching `lib<name>.so.<major>`, resolves its source bytes once, verifies the ELF reports the same `SONAME`, and copies only that filename as a regular file. The unversioned alias is build-time input and the fully versioned name is archive implementation detail.

Alternative considered: preserve all three entries as symlinks. Rejected because VSIX/ZIP handling of symlinks is not a portable installation contract and can materialize aliases again. Alternative considered: retain only the fully versioned file. Rejected because ELF consumers request the major `DT_NEEDED` name.

### Archive ambiguity fails before packaging

Zero or multiple major-version candidates, a mismatched ELF `SONAME`, or a missing required FFmpeg dependency terminates packaging with a specific diagnostic. There is no filename fallback because a guessed runtime name can produce a VSIX that installs successfully but fails when the Engine loads.

### Build and runtime artifacts share one pinned version contract

CI and Release prepare the configured platform FFmpeg development source before building `host-napi` and pass its workspace prefix explicitly through `FFMPEG_DIR`. Linux uses the SHA256-verified BtbN development artifact and no longer implicitly selects Ubuntu's system FFmpeg merely because development packages are installed for other native dependencies. macOS projects the configured Homebrew source into the same explicit workspace prefix. The bundler reads `DT_NEEDED` from the N-API binary and every materialized FFmpeg library, filters FFmpeg dependency names, and requires every exact name to exist in the destination closure.

Alternative considered: patch the N-API binary's FFmpeg `DT_NEEDED` major versions after compilation. Rejected because a major SONAME change is an ABI boundary and renaming it would hide an incompatible build. Alternative considered: accept system FFmpeg as a runtime dependency. Rejected because OpenNeko publishes an offline platform VSIX with an explicit native closure.

### Regression coverage targets the filesystem boundary

A script-level test creates a fully versioned fixture file plus unversioned and major-version symlinks, invokes the canonical materializer with an injected SONAME reader, and asserts that the destination contains only the major-version regular file. Separate negative cases cover missing, ambiguous, and mismatched SONAME inputs.

## Five-Layer Analysis

- **Responsibility:** Engine platform packaging owns FFmpeg closure discovery, validation, and materialization; Release only publishes the resulting OpenNeko VSIX.
- **Dependency:** the helper depends only on Node filesystem/path primitives and an injected ELF metadata reader; it does not cross Extension, Webview, application, or Rust runtime boundaries.
- **Interface:** input is the source library directory, destination directory, configured FFmpeg library names, native root consumers, and ELF SONAME/NEEDED readers; output is the copied runtime-name list or a thrown diagnostic.
- **Extension:** a future FFmpeg component is added through the existing package configuration and automatically receives the same unique-SONAME rule without another copy path.
- **Testing:** symlink and dependency fixtures cover deterministic materialization locally; workflow tests pin SDK preparation before compilation; Linux CI packaging covers the real verified ELF artifacts and final native closure.

## Risks / Trade-offs

- **[Incorrect SONAME selection prevents Engine load]** -> Validate the selected source ELF SONAME and retain the existing `$ORIGIN` patch before VSIX creation.
- **[Build SDK and runtime archive expose different ABIs]** -> Pin both artifacts in one platform config and compare every FFmpeg `DT_NEEDED` name against the packaged SONAME set.
- **[Pinned archive layout changes]** -> Reject missing or ambiguous major aliases with the library name and candidate list instead of guessing.
- **[Local macOS cannot execute Linux ELF tooling]** -> Inject the SONAME reader in deterministic unit tests and rely on the supported Linux packaging job for real ELF verification.
- **[VSIX size remains above macOS]** -> Native codec/library differences can remain; acceptance targets removal of duplicate entities, not equal byte size across platforms.

## Migration Plan

1. Add the red-capable symlink regression and failure cases.
2. Route Linux FFmpeg copying through the canonical materializer and require `patchelf` SONAME/NEEDED validation.
3. Prepare the configured platform FFmpeg SDK before CI/Release N-API compilation and pass its prefix explicitly.
4. Run Engine script, workflow orchestration, OpenSpec, and quality checks locally.
5. Let Merge Gate build the real Linux artifact and inspect its closure, dependencies, and size before the next release tag.

Rollback restores the previous bundler, but must not be used to publish another oversized artifact; no user data or persisted project format is involved.

## Open Questions

None.
