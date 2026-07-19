## ADDED Requirements

### Requirement: Engine exposes one closed lightweight media contract
The Engine registry SHALL expose only `system`, `files`, `media`, `timelines`, `streams`, and `jobs` with declared typed actions. Host API, HTTP, N-API, CLI, and `@neko/neko-client` MUST derive from or validate against the same Proto-backed registry and MUST NOT accept an absent controller route.

#### Scenario: Discover supported actions
- **WHEN** a supported host queries Engine capabilities
- **THEN** it receives `system: health,capabilities`, `files: register,unregister,stat`, `media: probe,capture,stream`, `timelines: validate,capture,stream,update`, `streams: pause,resume,seek,rate,loop,stats,stop`, and `jobs: submit,status,list,cancel`

#### Scenario: Dispatch an unknown contract
- **WHEN** a caller submits an undeclared action, job kind, profile version, field, or legacy alias
- **THEN** Engine returns an unsupported-contract diagnostic and no generic handler, plugin, shell, or fallback participates

### Requirement: File and output access is authorized
Engine SHALL consume opaque input tokens and Host-owned output roots registered from explicit allowed roots. Webviews MUST receive bounded descriptors and ResourceRefs rather than arbitrary native paths. Expiry, unregister, traversal, symlink escape, invalid Range, unauthorized overwrite, and access after shutdown MUST fail visibly.

#### Scenario: Consume an authorized resource
- **WHEN** a valid token is used for probe, capture, playback, proxy, transcode, analysis, or export
- **THEN** Engine opens only that resource and attributes access to the owning session or job

#### Scenario: Reject an unauthorized path
- **WHEN** an input or output escapes its root, uses an escaping symlink, expires, or requests an unauthorized overwrite
- **THEN** Engine rejects it before decoder creation or destination write

### Requirement: Video input decoding is GPU-only
Every realtime and job video input path SHALL use the declared packaged hardware decoder backend for the current platform. Engine MUST NOT expose, enable, or silently select CPU video decoding. Startup self-check MUST prove fixture decode, pixel-format output, and required frame interoperability.

#### Scenario: Start with a usable hardware backend
- **WHEN** Engine starts on supported hardware
- **THEN** self-check records backend, codec, pixel format, interoperability, and verified fixture result before accepting video work

#### Scenario: Hardware decoding is unavailable
- **WHEN** device, driver, codec, surface, or pixel format cannot complete self-check or requested decode
- **THEN** the stream or job fails with a GPU-backend diagnostic and no CPU decoder is attempted

### Requirement: Realtime playback uses long-lived session-owned resources
Media and timeline playback SHALL keep decoder, GPU device/surfaces, A/V clock, mixer, encoder/transport, queues, cancellation, and stream identity alive for the session. Seek SHALL operate through the live decoder context, and timeline update SHALL atomically replace a validated RenderPlan without restarting Engine or reconnecting the public stream.

#### Scenario: Seek an active stream
- **WHEN** a matching live stream receives the latest seek request
- **THEN** Engine seeks, flushes, pre-rolls, rejects stale generation output, and resumes through the same stream identity

#### Scenario: Update a playing timeline
- **WHEN** `timelines:update` receives matching stream identity, expected revision, next revision, and a valid timeline
- **THEN** Engine prepares and atomically activates the new plan while public WebSocket descriptors remain stable

#### Scenario: Reject stale ownership
- **WHEN** a start/control/update omits or mismatches session, stream, or revision identity
- **THEN** Engine fails visibly and does not target an active/default editor

### Requirement: Engine renders only the lightweight visual profile
Engine SHALL render ordered visual tracks with at most three active elements using painter order, normal source-over alpha, static layout, transparent upper gaps, black background, hard cut/fade/cross-dissolve, constant positive rate, closed basic color, and deterministic text. It MUST reject unsupported semantics before allocating decoders or jobs.

#### Scenario: Render three lightweight layers
- **WHEN** a base video, overlay, and title/subtitle are active at the same timestamp
- **THEN** Engine renders them in declared order with persisted layout and normal alpha

#### Scenario: Reject professional composition data
- **WHEN** a timeline exceeds three layers or contains custom shader, non-normal blend, mask, nested composition, arbitrary effect, keyframe/time-remap, reverse, complex transition, or professional color
- **THEN** validation returns field-level diagnostics before capture, playback, or export starts

### Requirement: Preview, capture, and export share one RenderPlan
The NKV/OTIO domain model SHALL compile into one versioned Canonical RenderPlan containing source/time mapping, layer order, layout, transition, basic color, text, audio/DSP, and output semantics. Realtime preview, frame capture, and timeline export MUST consume this plan and MUST NOT independently reinterpret NKV in TypeScript, Webview, CLI, or a legacy renderer.

#### Scenario: Compare preview and export
- **WHEN** a golden timeline is previewed, captured, and exported at matching timestamps
- **THEN** composition, text, transition boundary, color, audio timing, and duration agree within declared tolerances

#### Scenario: Poison a legacy renderer
- **WHEN** a lightweight request runs while legacy effect/timeline handlers are configured to fail
- **THEN** the request succeeds exclusively through the Canonical RenderPlan path

### Requirement: Engine owns a unified cancellable media job plane
Engine SHALL manage `proxy`, `transcode`, `timeline-export`, `audio-render`, `waveform`, and `loudness` as a closed typed job union. Every job SHALL have explicit identity, authorized inputs/output root, versioned profile, progress, cancellation, terminal status, structured diagnostics, and ResourceRef/provenance results.

#### Scenario: Complete a typed job
- **WHEN** a valid job finishes
- **THEN** Engine validates the staged result, atomically commits it, and reports a terminal ResourceRef with profile/runtime provenance

#### Scenario: Cancel or fail a job
- **WHEN** cancellation, worker failure, invalid output, or shutdown occurs
- **THEN** Engine reaches an explicit non-success terminal state, cleans staging resources, and preserves existing sources/destinations

#### Scenario: Reject arbitrary process input
- **WHEN** a caller supplies shell text, FFmpeg argv, filter graph, unknown job kind, or unversioned profile
- **THEN** submission fails before process/worker creation

### Requirement: Media jobs preserve source identity and project truth
Proxy SHALL be content/profile/runtime-addressed and preserve source-time mapping; transcode SHALL produce a new asset; waveform/loudness SHALL remain rebuildable; export SHALL freeze document URI/revision/snapshot. None of these tasks may silently replace a source or mutate NKV.

#### Scenario: Generate an editing proxy
- **WHEN** a source and proxy profile are submitted
- **THEN** Engine produces an equivalent derived resource linked to the original source identity without altering the project

#### Scenario: Export while editing continues
- **WHEN** export freezes revision R and Cut later creates revision R+1
- **THEN** the output corresponds to R and reports R in provenance

### Requirement: Realtime work has priority over background jobs
Engine SHALL enforce `realtime playback > seek/capture > proxy > transcode/timeline-export/audio-render` using bounded concurrency and a GPU session budget. Background work MUST queue or throttle rather than preempt realtime playback or use CPU video decoding.

#### Scenario: Export during playback
- **WHEN** a background export competes with an active realtime session
- **THEN** Engine preserves declared playback latency/frame-drop bounds and queues or throttles export as required

#### Scenario: Exhaust GPU sessions
- **WHEN** no hardware decode budget is available for a new background job
- **THEN** the job remains queued or fails with a resource diagnostic and does not start CPU decode

### Requirement: Engine retains a closed audio finishing pipeline
Engine SHALL retain decode, resample, channel conversion, gain/volume/pan, fade, fixed EQ/filter, compressor, noise gate, limiter, loudness normalization, multitrack sum, mixdown, and A/V clock. Nodes and parameters MUST be versioned closed unions used consistently by preview, audio render, and export.

#### Scenario: Render a supported mix
- **WHEN** an NKV timeline contains overlapping audio with supported DSP
- **THEN** preview and export agree on sample timing, channel mapping, levels, dynamics, and limiter behavior within tolerance

#### Scenario: Audio processing fails
- **WHEN** decode, DSP, mix, or mux fails
- **THEN** the stream/job fails visibly instead of returning successful silent or video-only output

### Requirement: Runtime ownership and shutdown are complete
Each playback session and job SHALL own its mutable state, queues, cancellation, and resource handles. Shared pools MAY offer bounded immutable configuration and explicit leases but MUST NOT use active-editor global state. Runtime shutdown SHALL stop acceptance, cancel work, close HTTP/WebSocket, revoke tokens, release codec/GPU/process resources, and permit clean reconstruction.

#### Scenario: Shut down with active work
- **WHEN** runtime shutdown occurs with active streams and jobs
- **THEN** every owner reaches terminal state, resources are released, and no post-shutdown access succeeds

#### Scenario: Recreate runtime
- **WHEN** a fully shut-down runtime is constructed with new configuration
- **THEN** it performs a fresh hardware self-check and has no inherited session/job state

### Requirement: Removed Engine capabilities are absent vertically
Custom/user WGSL, dynamic shader/effect/plugin registration, non-normal blends, masks, generic keyframes/animation/time-remap, complex transitions, professional color/LUT, diff variants, arbitrary operation dispatch, and legacy aliases MUST be absent from public contracts, registries, handlers, manifests, generated types, clients, and reachable implementations.

#### Scenario: Audit removed capabilities
- **WHEN** source, generated artifacts, package manifests, action discovery, and runtime dispatch are audited
- **THEN** no removed capability can be registered, discovered, invoked, or return compatibility success
