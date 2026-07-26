## ADDED Requirements

### Requirement: Each host selects exactly one media adapter
The VS Code and Desktop composition roots SHALL each select one implementation of the shared probe, video preview, PCM stream, export job, and authorized media source ports. Runtime failure MUST NOT trigger an implicit switch to another adapter or a hidden legacy route.

#### Scenario: Compose the VS Code editor
- **WHEN** a VS Code Cut editor session is created
- **THEN** it receives one editor-scoped Engine-backed adapter with explicit document and session identity

#### Scenario: Compose the Desktop editor
- **WHEN** a Desktop Cut editor session is created
- **THEN** it receives one editor-scoped WebCodecs/Host FFmpeg adapter and does not load Neko Engine

### Requirement: VS Code keeps Neko Engine as a frozen media adapter
VS Code SHALL continue to use existing Engine probe, preview, PCM, and export capabilities during the transition, restricted by the shared Cut v1 profile. Engine MUST NOT own OTIO persistence, define Cut operations, expose profile-external UI capabilities, or gain new editing features under this change.

#### Scenario: Play and export an OTIO project in VS Code
- **WHEN** a supported OTIO revision is previewed or exported
- **THEN** the VS Code adapter derives a bounded playback/export request, the Engine executes it, and the OTIO document remains owned by Cut Core

#### Scenario: Engine playback fails
- **WHEN** Engine initialization, codec, stream, or export fails
- **THEN** VS Code returns the Engine diagnostic and does not fall back to Node/WebCodecs, `<video>`, or an older timeline implementation

### Requirement: Desktop video preview uses a bounded WebCodecs path
Desktop SHALL read authorized MP4 data through a bounded source, use one selected demux implementation, decode through WebCodecs, and present through Canvas or WebGPU. It MUST NOT use `<video src>` as the Cut playback core or send file bytes through ordinary IPC.

#### Scenario: Seek a long MP4
- **WHEN** the user seeks to a new timeline position
- **THEN** the demuxer requests bounded closed ranges, stale decode generations are discarded, and only the required media intervals and decode dependencies are read

#### Scenario: The source sends an unsafe range request
- **WHEN** a request is open-ended, suffix, multiple, out of bounds, over the configured cap, stale, or unauthorized
- **THEN** the Host rejects it without reading or streaming the rest of the file

### Requirement: Desktop audio is decoded to bounded PCM in the Host
Desktop SHALL use managed FFprobe/FFmpeg processes to select audio from standalone audio or video containers and produce interleaved f32le PCM at 48 kHz stereo. PCM frames SHALL carry PTS, duration, sample rate, and channel count over a binary channel with backpressure.

#### Scenario: Play embedded video audio
- **WHEN** a supported MP4 contains an AAC-LC audio stream
- **THEN** the Host selects the declared stream, emits bounded PCM frames, and WebAudio mixes them without receiving the compressed file through IPC

#### Scenario: Seek during PCM playback
- **WHEN** the user seeks while PCM is buffered
- **THEN** the old decode process or generation is cancelled, stale frames are discarded, and the next accepted frame belongs to the requested generation

### Requirement: Shared Host transport exposes only authorized bounded resources
The shared Node transport SHALL bind to loopback, use unguessable owner-scoped tokens, support registration, HEAD/OPTIONS, closed Range responses, stream cancellation, revocation, and disposal, and expose correct Content-Length, Content-Range, and Accept-Ranges headers. Document entry semantics MUST remain outside the shared kernel.

#### Scenario: Read one closed range
- **WHEN** an authorized client requests `bytes=start-end` within the configured cap
- **THEN** the Host reads and returns exactly that interval with 206 and the correct headers

#### Scenario: Dispose an editor session
- **WHEN** the owning editor or application is disposed
- **THEN** its tokens, streams, sockets, requests, FFmpeg processes, and server ownership are released and stale access fails visibly

### Requirement: Both adapters enforce one Cut v1 Media Profile
Direct editing SHALL be limited to MP4/H.264 AVC 8-bit yuv420p SDR progressive CFR up to 1080p with AAC-LC 44.1 or 48 kHz mono/stereo, plus standalone WAV PCM 44.1 or 48 kHz mono/stereo. Host decoding SHALL normalize frontend PCM to f32le 48 kHz stereo. The profile MUST be derived from probe metadata rather than filename extension.

#### Scenario: Import conforming media
- **WHEN** probe metadata satisfies every Cut v1 field
- **THEN** both VS Code and Desktop accept the same source for direct editing

#### Scenario: Import profile-external media
- **WHEN** media is VFR, HDR, 10-bit, non-4:2:0, interlaced, contains extra video streams, surround/object audio, DRM, corrupt timestamps, or unknown duration
- **THEN** both hosts reject direct editing with field-level diagnostics even if their underlying decoder can read it

### Requirement: Desktop conversion import produces canonical project media
Desktop MAY explicitly convert supported external formats into a project-local conforming MP4 or WAV using a typed FFmpeg job. The converted artifact SHALL become the OTIO media reference and export source; the first profile MUST NOT claim proxy/original relink or original-media conform.

#### Scenario: Convert a non-native source
- **WHEN** the user accepts conversion import for a recognized MOV, MKV, WebM, MP3, or FLAC source
- **THEN** Desktop stages, converts, validates, atomically commits the conforming artifact, and updates OTIO only after success

#### Scenario: Conversion is cancelled or invalid
- **WHEN** the user cancels or output validation fails
- **THEN** staging is removed, OTIO is unchanged, and no partial artifact is reported as imported

### Requirement: Export uses one typed and atomic media profile
The initial media export SHALL produce MP4/H.264/AAC-LC/SDR/yuv420p up to 1080p from a frozen document URI, revision, OTIO snapshot, authorized source set, and typed output profile. Callers MUST NOT provide shell commands, arbitrary FFmpeg arguments, or filter graphs.

#### Scenario: Export succeeds
- **WHEN** the selected host completes an export job
- **THEN** it validates codec, duration, size, and audio before atomically committing the target and reporting success

#### Scenario: Export fails or is cancelled
- **WHEN** decode, mix, encode, mux, validation, or cancellation reaches a terminal failure
- **THEN** the Host cleans staging, preserves an existing target, and returns a terminal diagnostic without partial success

### Requirement: Media data does not traverse the control bridge
Host bridge and IPC messages SHALL contain only authorization, descriptor, command, status, progress, cancellation, and diagnostic data. File bytes and PCM MUST use bounded binary data-plane channels and MUST NOT be Base64-encoded into messages.

#### Scenario: Audit media transport
- **WHEN** VS Code and Desktop preview a long media fixture
- **THEN** network/bridge evidence shows bounded Range or binary PCM traffic and no bulk file or PCM payload in ordinary IPC/postMessage
