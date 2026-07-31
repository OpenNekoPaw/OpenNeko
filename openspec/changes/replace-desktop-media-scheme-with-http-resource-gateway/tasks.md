## 1. Freeze Contracts And Red Paths

- [ ] 1.1 Add producer/consumer red tests for the versioned seekable, PCM stream and resource-set projections, including exact MIME/size/fingerprint and runtime-only URL rules.
- [ ] 1.2 Replace `MediaTransport = 'http' | 'authorized'` with the single loopback HTTP contract and make `transport: 'authorized'`, `neko-media:`, `file:` and private `media:`/`video:`/`audio:` URLs fail validation.
- [ ] 1.3 Define the minimal gateway registration port for exact file, one-shot PCM and allowlisted resource-set sources, including owner/generation identity, cancellation and release; avoid introducing a second generic content or media facade.
- [ ] 1.4 Add architecture/debt guards that poison Desktop custom-media protocol registration, upstream proxying, persisted loopback URLs and ordinary Canvas PCM success before migrating implementations.

## 2. Implement The App-Lifetime HTTP Gateway

- [ ] 2.1 Evolve the existing `NodeMediaLoopbackServer` Range/PCM implementation into the single injected gateway path while preserving `@neko/media/node` and Desktop Main ownership boundaries.
- [ ] 2.2 Start one gateway on `127.0.0.1` before Renderer loading, expose its exact origin to Desktop security composition and fail startup visibly if binding/origin publication fails.
- [ ] 2.3 Implement and test high-entropy scoped token registration, redacted diagnostics, exact source revision, owner/generation release and unknown/revoked-token rejection without trusting client identity headers.
- [ ] 2.4 Complete `GET`/`HEAD`/`OPTIONS`, full/open/closed/suffix single Range, `200`/`206`/`416`, MIME, length, `nosniff`, repeated/concurrent Range, backpressure and no-whole-file-buffer tests.
- [ ] 2.5 Preserve single-consumer framed PCM semantics, priming, conflict, client cancellation, FFmpeg termination and new-generation seek behavior without advertising byte Range.
- [ ] 2.6 Add exact virtual-path resource sets with frozen allowlists and tests for glTF dependencies, unknown entries, encoded traversal, absolute/network URI, symlink/containment escape and source revision changes.
- [ ] 2.7 Add lifecycle tests for generation replace, View detach, Window close, renderer epoch change and app quit, asserting all responses, handles, sockets, listeners and FFmpeg children are released.

## 3. Replace Desktop Protocol And Security Composition

- [ ] 3.1 Generate production/development CSP after the gateway port is known and allow its exact origin only in the directives required by audited media, image, fetch and frame consumers.
- [ ] 3.2 Replace wildcard loopback CORS with the exact Renderer origin, implement required PNA preflight and test unexpected origins, methods, headers and origin-less native media Range behavior.
- [ ] 3.3 Set anonymous CORS before `src` for Canvas/WebGL/Three.js pixel/texture consumers and add non-tainted pixel plus first/repeated texture-upload tests.
- [ ] 3.4 Remove `neko-media` from `registerSchemesAsPrivileged`, CSP and protocol handlers after all new-path producer tests pass; retain `neko-app:` solely for trusted Renderer assets.
- [ ] 3.5 Delete `DesktopMediaDescriptorRegistry` file/upstream proxy responsibilities and replace any remaining descriptorId resolution with owning session registration/release rather than a parallel URL identity.

## 4. Migrate Cut Without Weakening PCM

- [ ] 4.1 Inject the app gateway publisher into the Cut Node/FFmpeg composition so original/remux/prepared video and mixed PCM URLs reach Cut directly without Desktop upstream fetch/proxy.
- [ ] 4.2 Update Cut descriptor validation and clients to accept only the new HTTP projections while preserving muted native video, active/standby slots and same-clip video retention.
- [ ] 4.3 Preserve the single Host-mixed audible PCM generation, bounded scheduling, start barrier, master clock, drift correction, seek generation and deterministic disposal with focused Cut regression tests.
- [ ] 4.4 Add path assertions and a real Electron OTIO fixture proving changing native video frames, advancing mixed PCM timeline audio and Range requests while poisoned `neko-media:` and native clip-audio fallbacks remain untouched.

## 5. Migrate Canvas Ordinary Playback To Native Media

- [ ] 5.1 Add the package-owned native audio descriptor/consumer behind existing Canvas audio controls and cover play, pause, seek, volume, rate, end, source replace and cleanup.
- [ ] 5.2 Change ordinary Canvas video nodes to use one native video element with embedded audio, removing the muted-video plus duplicate PCM behavior while retaining package-owned UI and playback-store semantics.
- [ ] 5.3 Remove ordinary Canvas audio/video PCM production and `PcmAudioClient` success paths; keep a distinct explicit processed-playback contract only where a concrete synchronized/mixed/analysis operation exists.
- [ ] 5.4 Add two-Canvas isolation, hover/quick-preview fencing, save/reopen and prepared-file/unavailable tests that assert portable source identity and poison active/recent Canvas, ordinary PCM and codec fallback paths.
- [ ] 5.5 Run a real Electron synthetic Canvas audio/video scenario proving native element metadata, play, seek and cleanup through HTTP with no persisted URL or custom scheme.

## 6. Migrate Preview Across All Content Kinds

- [ ] 6.1 Project Preview image/audio/video sources through the gateway and keep the package-owned Image/Audio/Video viewers as the only Renderer consumers.
- [ ] 6.2 Route PDF/CBZ and other document formats through their owning Range or bounded content adapters with exact MIME, CSP and cancellation tests rather than a generic filesystem endpoint.
- [ ] 6.3 Route GLB as a seekable resource and glTF external buffers/textures through exact resource sets, preserving package-owned ModelViewer behavior and rejecting undeclared dependencies.
- [ ] 6.4 Cover temporary, pinned, side and quick Preview lifecycle, request fencing, stale revision/epoch, two-session isolation and deterministic token revocation without active/recent Preview fallback.
- [ ] 6.5 Add a real Electron Preview matrix for image, audio, video, PDF/document, GLB and external-resource glTF, recording DOM/network/console evidence and proving the legacy custom protocol is poisoned.

## 7. Migrate Agent Display Without Changing File Authority

- [ ] 7.1 Update the message resource display projector and Desktop Agent composition to preserve stable attachment/Tool result fields while adding only a transient HTTP render projection for the Webview.
- [ ] 7.2 Update package-owned Agent audio/video cards and rich-content renderers to consume the authorized URL through native elements, with deterministic tests for denied projection and no `file:`/absolute-path/`data:` fallback.
- [ ] 7.3 Add tests proving Pi reasoning, provider materialization and later Tools consume stable refs or Host-resolved bytes rather than the display URL; keep `Read`/`Write`/`ReadImage`/`ReadDocument` under existing PathAccessPolicy.
- [ ] 7.4 Add Developer Mode/processor boundary tests proving any authorized command receives validated real input/output paths and never a loopback/custom-scheme URL; do not grant ordinary Agent Bash or add a shell fallback.
- [ ] 7.5 Update `agent-runtime.stream-delivery` and its coverage index with the focused stable-resource/transient-display projection case defined in `evaluation.md`; run key-free harness validation/dry-run, then explicitly run the real-provider case locally or record its exact Desktop-driver/authorization blocker without treating the harness as AI behavior acceptance.

## 8. Live, Texture And Color Boundaries

- [ ] 8.1 Add contract tests proving finite local resources may use the gateway while camera/microphone/call/live capture remains on MediaStream/WebRTC or a dedicated live runtime.
- [ ] 8.2 Add an allowlisted local manifest/segment fixture for resource-set semantics without claiming an HLS/DASH player or remote live-stream implementation that no current consumer owns.
- [ ] 8.3 Record separate transport, changing-frame decode, WebGL texture-pixel and display-output facts for 10-bit/HDR fixtures; reject zero-copy, 10-bit-output or HDR-output claims based only on HTTP/media/texture success.

## 9. Remove Legacy Debt And Synchronize Architecture

- [ ] 9.1 Delete obsolete authorized transport types, Desktop media protocol/registry code, upstream fetch proxy, custom-scheme tests/fixtures and dependencies after canonical producer/consumer tests are green.
- [ ] 9.2 Update `define-desktop-media-capability-boundary`, `integrate-desktop-cut-preview-media` and the user's active `integrate-desktop-assets-canvas` artifacts to mark the superseded `neko-media:`/localhost/ordinary-PCM decisions without overwriting unrelated in-progress content.
- [ ] 9.3 Update `docs/architecture/media-runtime.md`, the Desktop media ADR, `package-boundaries.md`, `application-composition.md` and architecture navigation to document the HTTP bearer-capability threat model and per-consumer PCM matrix.
- [ ] 9.4 Run `pnpm check:legacy-debt`, `pnpm check:unused` and repository searches proving no production custom-media scheme, upstream proxy, dual transport or ordinary Canvas PCM path remains.

## 10. Qualification And Quality Gates

- [ ] 10.1 Convert the temporary HTTP spike into an isolated, synthetic, gitignored-report Electron qualification scenario covering H.264/WAV metadata, first frame, seek, Range, SHA-256, changing pixels, WebGL2 texture upload, throughput and cleanup.
- [ ] 10.2 Compare old custom-protocol and new direct-HTTP builds on the same `darwin-arm64` fixture before deleting the old build, recording latency, throughput, CPU/memory and copied-byte evidence; require HTTP to meet the recorded usable baseline without claiming unmeasured superiority.
- [ ] 10.3 Run the graphical packaged scenario locally on `darwin-arm64` and keep the native `win32-x64` typecheck/package job green; record Windows media/GPU/UI qualification as Phase 2 rather than running graphical UI tests in CI or restoring Linux Desktop support.
- [ ] 10.4 Run focused `@neko/media`, Cut, Canvas, Preview, Agent and Desktop producer/consumer tests and typechecks, then run `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:quality` and `pnpm test:agent:eval`.
- [ ] 10.5 Run `pnpm package:desktop`, applicable local graphical Electron functional matrices and `neko-quality-review`; record commands, target/runtime identities, reports, unexecuted checks and residual HDR/Windows-media/Agent-driver risks before completion.
