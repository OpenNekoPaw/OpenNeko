## ADDED Requirements

### Requirement: Engine retains one Rust media implementation

The retained Engine MUST use the Rust Kernel, Host API/HTTP, CLI, and N-API implementation as its only media runtime. The TypeScript VS Code extension MUST remain a lifecycle/composition adapter and MUST NOT implement a parallel FFmpeg process runner, action registry, or HTTP server.

#### Scenario: Connect a retained editor

- **WHEN** Cut or Canvas requires media playback or processing
- **THEN** it obtains the loopback port through `neko.engine.ensureFrameServer` and uses `@neko/neko-client` against the Rust Host HTTP runtime

#### Scenario: Activate the Engine extension

- **WHEN** the Engine extension activates
- **THEN** it loads the retained N-API host and does not select or fall back to a TypeScript FFmpeg implementation

### Requirement: Native dependency closure contains only retained media crates

The Cargo workspace MUST retain engine-types, codec, audio processing, GPU, runtime-media, media Kernel, Host API/HTTP, CLI, and N-API crates. It MUST NOT depend on Scene, Puppet, ML, Device, model-preview, panoramic, or product-specific renderer crates.

#### Scenario: Inspect Cargo metadata

- **WHEN** Cargo metadata is generated for the Engine workspace
- **THEN** no retained package depends on runtime-scene, runtime-puppet, runtime-ml, runtime-device, scene renderer, puppet renderer, or panoramic renderer

#### Scenario: Inspect removed-only dependencies

- **WHEN** the retained native dependency graph is audited
- **THEN** Bevy ECS, glTF, ONNX Runtime, ndarray, rustfft, and device-only capture dependencies are absent unless a retained media implementation proves a direct requirement

#### Scenario: Audit retained native dependencies

- **WHEN** Cargo Deny checks advisories, bans, licenses, and sources for the retained workspace
- **THEN** the dependency graph contains no unacknowledged denied advisory, any transitive unmaintained dependency without a safe upgrade has a narrow advisory-specific exception and replacement condition, and the deny configuration contains no stale exception for a removed dependency

### Requirement: Retained media groups remain functional

The Engine MUST retain authorized files/previews, video, audio, image, timeline, stream, effects, color-correction, health/task, codec, GPU, proxy, and export behavior required by retained callers.

#### Scenario: Probe and seek media

- **WHEN** a retained caller probes an authorized source or seeks/captures a frame
- **THEN** the request uses the Rust FFmpeg codec path and returns the established client response shape

#### Scenario: Stream retained media

- **WHEN** a retained editor starts a supported playback stream
- **THEN** the Rust runtime owns decoder/encoder state and transports high-frequency media directly over its authorized HTTP/WebSocket data plane

### Requirement: Engine file access remains authorized and on demand

The Engine HTTP server MUST bind to loopback and require authorized roots or opaque file tokens before serving sources. Range responses MUST seek and stream only the requested bytes without reading the complete file into memory.

#### Scenario: Serve an authorized Range request

- **WHEN** a valid token requests a byte range from an authorized file
- **THEN** the server returns only the bounded range with `206`, `Accept-Ranges`, `Content-Range`, and the correct content length

#### Scenario: Reject an unauthorized path

- **WHEN** a request resolves outside authorized roots or traverses outside a registered resource root
- **THEN** the Engine rejects it before opening the file or decoder

### Requirement: Removed capabilities are absent vertically

Scene, Puppet, Model, ML, Device, Live, model-preview, viewport, camera, MIDI, and gamepad capabilities MUST be removed from Cargo members, Kernel services, Host controllers/routes, CLI/N-API methods, TypeScript client exports, and active tests. They MUST NOT return successful no-op or fallback responses.

#### Scenario: Request a removed action group

- **WHEN** a caller dispatches a removed group/action to the retained Engine
- **THEN** the router returns a visible unknown/unsupported action diagnostic and no removed runtime or alternate implementation participates

#### Scenario: Inspect public clients

- **WHEN** retained TypeScript packages are typechecked
- **THEN** they do not expose Scene/Puppet/Model/ML/Device methods as supported Engine client APIs

### Requirement: CLI and N-API expose the same media Engine

The CLI and N-API hosts MUST compose the same retained Kernel and Host API contracts. Neither host may register removed capability groups or construct a second Engine state owner.

#### Scenario: Run CLI smoke operations

- **WHEN** CLI health, probe, capture, or server smoke tests run
- **THEN** they exercise the retained Rust media Kernel and Host API

#### Scenario: Load the N-API host

- **WHEN** the VS Code extension loads the native host
- **THEN** N-API provides media lifecycle and dispatch methods backed by the same process-wide Engine API instance
