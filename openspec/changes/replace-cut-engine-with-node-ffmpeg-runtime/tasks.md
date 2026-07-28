# Tasks

## 1. Freeze contracts and decision

- [x] 1.1 Create proposal, design, delta spec, and implementation task list.
- [x] 1.2 Record the H.264/VP8, explicit remux/transcode, PCM-only audio, and
      OpenNeko clock policy.
- [x] 1.3 Update and freeze Cut media port types with native Range video and HTTP PCM
      descriptors.
- [x] 1.4 Validate OpenSpec artifacts and architecture links.

## 2. Implement the Node/FFmpeg adapter

- [x] 2.1 Add injected FFmpeg/ffprobe executable discovery and process runner.
- [x] 2.2 Implement probe, frame capture, and waveform ports.
- [x] 2.3 Implement session-scoped loopback HTTP delivery and range/segment
      handling.
- [x] 2.4 Implement H.264 remux and explicit transcode preview preparation.
- [x] 2.5 Implement framed float32 PCM streaming for all audible inputs.
- [x] 2.6 Implement Cut export through FFmpeg with cancellation, staging, and
      output validation.
- [x] 2.7 Add focused adapter, lifecycle, error, and contract tests.

## 3. Validate the real VS Code Webview

- [x] 3.1 Replace the Engine WebSocket preview client with native `<video src>` and HTTP
      PCM clients.
- [x] 3.2 Implement and test OpenNeko timeline clock ownership and drift policy.
- [x] 3.3 Validate H.264 preview, PCM audio, seek/resume, frame capture, waveform,
      and explicit transcode in an Extension Development Host.
- [x] 3.4 Run a VP8 WebM native video fixture and record direct-support qualification or
      retain explicit H.264 transcode.

## 4. Switch the composition root

- [x] 4.1 Select only the Node/FFmpeg adapter in the Cut composition root.
- [x] 4.2 Add path assertions proving no Engine Cut adapter is selected.
- [x] 4.3 Verify cancellation and resource disposal across document/panel
      lifecycle.

## 5. Poison the old Engine Cut path

- [x] 5.1 Make any remaining legacy Cut Engine entry fail with a deterministic
      diagnostic.
- [x] 5.2 Run canonical-path tests with the legacy entry poisoned.

## 6. Remove Cut Engine surface

- [x] 6.1 Delete the Cut Engine adapter and connection.
- [x] 6.2 Delete Cut-owned Engine routes/client methods/DTO references and
      dependencies.
- [x] 6.3 Remove legacy tests and update architecture/domain documentation.
- [x] 6.4 Run legacy-debt and unused-code checks.

## 7. Audit other Engine consumers

- [x] 7.1 Inventory runtime, protocol, route, package, native-build, test, and
      documentation consumers.
- [x] 7.2 Assign each remaining responsibility to an owning package and document
      migration or retention.
- [x] 7.3 Verify the audit against repository dependency and text searches.

## 8. Apply the Engine deletion gate

- [ ] 8.1 Delete `packages/neko-engine` only if the audited dependency closure is
      empty.
- [x] 8.2 Otherwise retain it and record the exact blockers without claiming
      whole-Engine removal.

## 9. Quality gates

- [x] 9.1 Run focused TypeScript and Rust tests for affected paths.
- [x] 9.2 Run affected builds, `pnpm check`, `pnpm check:legacy-debt`, and
      `pnpm check:unused`.
- [x] 9.3 Run `pnpm ci:local` for the final high-risk cross-layer change.
- [x] 9.4 Record actual validation commands, results, and remaining release/HDR
      risks.
