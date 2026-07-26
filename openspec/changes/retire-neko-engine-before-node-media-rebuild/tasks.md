# Tasks

## 1. Freeze the removal-first contract

- [x] 1.1 Create proposal, design, delta spec, and task plan.
- [x] 1.2 Validate OpenSpec and record the superseded conditional deletion
      order in the Cut change.
- [x] 1.3 Freeze the neutral media contracts and package ownership.

## 2. Remove Engine from product composition first

- [x] 2.1 Remove `neko-engine` from VS Code feature ordering and activation.
- [x] 2.2 Remove Engine extension dependencies, commands, configurations, and
      capability discovery from product manifests.
- [x] 2.3 Remove Engine from package groups, platform VSIX assembly, native
      staging, and release closure.
- [x] 2.4 Add a repository gate rejecting product composition, manifest,
      packaging, and build-graph Engine dependencies. Expand it to all
      production client/DTO references in sections 3 and 6.
- [x] 2.5 Add composition/path tests proving Engine is absent and cannot satisfy
      a media request.

## 3. Poison and remove remaining product clients

- [x] 3.1 Remove Preview Engine client/provider/lifecycle paths.
- [x] 3.2 Remove Canvas Engine client/provider/lifecycle paths.
- [x] 3.3 Remove Tools Engine service/resolver/handler paths.
- [x] 3.4 Remove Agent Engine provider/preprocessor paths.
- [x] 3.5 Remove Assets Engine command/extractor/thumbnail paths.
- [x] 3.6 Verify missing replacements fail visibly rather than return empty,
      null, disabled, or success results.

## 4. Build the shared Node media runtime

- [x] 4.1 Add neutral probe, frame, waveform, preview, PCM, extract, export, and
      lifecycle contracts.
- [x] 4.2 Extract injected FFmpeg/ffprobe process execution and diagnostics.
- [x] 4.3 Extract loopback Range/session delivery and temporary artifact
      lifecycle.
- [x] 4.4 Extract browser MSE and PCM clients.
- [x] 4.5 Move Cut onto the shared runtime and delete its duplicate
      infrastructure.
- [x] 4.6 Add contract, cancellation, security, and cleanup tests.
- [x] 4.7 Add FFmpeg capability qualification and distinguish missing runtime
      filters/encoders from media corruption.
- [x] 4.8 Preserve valid thumbnails/waveform intervals when bounded frames or
      packets are locally corrupt, with explicit partial-result diagnostics.
- [x] 4.9 Enforce the PCM first-packet startup barrier and dispose all browser
      clients on preview discontinuity.

## 5. Rebuild consumers on domain ports

- [x] 5.1 Connect Preview playback/probe/capture.
- [x] 5.2 Connect Canvas node playback/capture.
- [x] 5.3 Connect Tools diff/silence/visualization analysis.
- [x] 5.4 Connect Agent keyframe/frame/audio/transcode preprocessing.
- [x] 5.5 Connect Assets metadata and thumbnail extraction.
- [x] 5.6 Add canonical-path assertions for every consumer.

## 6. Remove obsolete shared and native surfaces

- [x] 6.1 Remove Engine HTTP/WebSocket routes and client exports.
- [x] 6.2 Remove unused Engine protobuf services/messages and regenerate
      consumers.
- [x] 6.3 Remove native module loading, platform artifact staging, and Engine
      release scripts.
- [x] 6.4 Delete `packages/neko-engine` and any empty obsolete client package.
- [x] 6.5 Update current architecture, domain, package, and release docs.
- [x] 6.6 Remove stale Engine ownership claims and unrelated Engine fixtures
      while retaining explicit fail-closed retirement guards.

## 7. Validate

- [x] 7.1 Run focused producer/consumer tests and path assertions.
- [x] 7.2 Run full build, test, check, quality, legacy-debt, and unused gates.
- [x] 7.3 Validate affected playback paths in the Extension Development Host.
- [x] 7.3a Add a generated isolated media fixture subtree; superseded on
      2026-07-27 so active VS Code launch paths now use only
      `${HOME}/Git/neko-test`.
- [x] 7.4 Record actual commands, evidence, and remaining FFmpeg/HDR/release
      risks.
- [x] 7.5 Re-run focused orchestration, architecture, retirement, OpenSpec, and
      diff checks after residual cleanup.
