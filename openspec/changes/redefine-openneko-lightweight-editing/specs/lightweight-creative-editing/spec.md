## ADDED Requirements

### Requirement: OpenNeko provides one lightweight editing experience
OpenNeko SHALL expose one Cut editing experience for importing media, editing an NKV lightweight project, generating proxies, previewing, mixing, exporting, exchanging OTIO, and handing profile-external work to managed processors. It MUST NOT expose a basic/professional mode selector or a hidden professional editing surface.

#### Scenario: Open a lightweight project
- **WHEN** a user opens a supported NKV project
- **THEN** Cut exposes the retained timeline, proxy/transcode, audio, preview, export, undo/redo, save, and professional handoff operations in one editor

#### Scenario: Audit the product surface
- **WHEN** manifests, commands, messages, stores, UI, localization, Agent capabilities, and Engine clients are inspected
- **THEN** retained lightweight operations are reachable and removed shader/plugin/diff/mask/keyframe/professional-color operations are absent

### Requirement: NKV has one versioned lightweight profile
The writable NKV contract SHALL support ordered video, title, subtitle, and audio tracks; no more than three concurrently active visual elements; non-overlapping video clips within one track; explicit source/timeline ranges; project resolution/fps/duration; and workflow lineage. Validation MUST reject unknown or unsupported semantics before save, playback, or export.

#### Scenario: Validate a layered project
- **WHEN** a project has any number of organizational tracks but never exceeds three simultaneous visual elements and uses only profile fields
- **THEN** the canonical codec accepts it as a writable lightweight project

#### Scenario: Reject excessive visual concurrency
- **WHEN** more than three video/title/subtitle elements are active during the same interval
- **THEN** validation reports the conflicting elements, interval, and layer limit without partially saving the project

#### Scenario: Render gaps
- **WHEN** an upper visual track or all visual tracks contain a gap
- **THEN** the upper gap is transparent and a fully empty visual composite uses the project black background while eligible audio continues

### Requirement: Lightweight visual composition is closed and deterministic
Visual clips SHALL support track-order z, normal source-over alpha, static position/scale/rotation, crop, contain/cover, and static opacity. NKV MUST NOT support non-normal blend, masks, adjustment/effect tracks, nested compositions, arbitrary shader/effect data, or animated layout.

#### Scenario: Create picture in picture
- **WHEN** a user places a transformed overlay above a base clip
- **THEN** Cut persists the static layout and Engine preview/export render the same normal-alpha composition

#### Scenario: Request an unsupported composition field
- **WHEN** a caller authors a non-normal blend, mask, adjustment layer, nested composition, or arbitrary visual effect
- **THEN** the authoring contract rejects the exact field and does not encode it as generic metadata

### Requirement: Lightweight timing supports only simple deterministic operations
The writable profile SHALL support hard cuts, fade to/from black, cross-dissolve between eligible adjacent clips, and a bounded constant positive clip rate with optional audio pitch preservation. It MUST NOT support reverse, time-remap curves, arbitrary transitions, transition effect parameters, or generic keyframes.

#### Scenario: Add a cross-dissolve
- **WHEN** adjacent clips have sufficient source handles and a supported dissolve duration
- **THEN** Cut persists the transition and preview/export render the same overlap

#### Scenario: Change constant speed
- **WHEN** a user assigns a supported positive fixed rate
- **THEN** Cut updates timeline duration/source mapping and preview/export use that same mapping

#### Scenario: Request advanced timing
- **WHEN** a caller requests reverse, speed keyframes, time-remap, wipe, glitch, iris, ripple, or another unsupported transition
- **THEN** authoring fails with an unsupported-capability diagnostic and writes no generic timing/effect field

### Requirement: Titles and subtitles remain first-class tracks
NKV SHALL support timed title and subtitle elements with bounded text, font/fallback identity, size, color, background, alignment, stroke, static layout, and duration. Preview and export MUST use deterministic shaping and packaged font fallback. Animated text, arbitrary text effects, and path text MUST NOT be writable.

#### Scenario: Author timed subtitles
- **WHEN** a user imports or creates subtitles using supported styles
- **THEN** Cut persists them as subtitle elements and preview/export render them at the declared intervals

#### Scenario: Resolve a missing font
- **WHEN** a persisted font is unavailable on the current platform
- **THEN** the renderer uses the declared packaged fallback, reports the substitution, and produces the same preview/export layout

### Requirement: Basic color correction remains available
Visual clips SHALL support a closed bounded set for exposure or brightness, contrast, temperature/tint, and saturation with reset semantics. Wheels, curves, selective HSL, LUT upload, secondary correction, arbitrary parameters, and animated grading MUST NOT be writable.

#### Scenario: Correct a clip
- **WHEN** a user changes supported basic-color controls
- **THEN** Cut persists typed values and Engine preview/export apply the same correction

#### Scenario: Request professional grading
- **WHEN** a caller submits LUT, curve, wheel, selective HSL, secondary, animated, or unknown color data
- **THEN** Cut rejects the data or offers managed professional handoff without writing a partial grade

### Requirement: Lightweight audio supports multitrack finishing
NKV SHALL support multiple audio tracks and embedded video audio with source/timeline mapping, mute, gain/volume, pan, fades, and a closed corrective DSP chain. Cut SHALL expose waveform, loudness, mix preview, and mixdown/export without exposing third-party DSP or arbitrary graphs.

#### Scenario: Mix dialogue and music
- **WHEN** dialogue and music overlap with supported level, pan, fade, EQ/dynamics, and limiter settings
- **THEN** preview and export preserve source identities, declared timing, and the expected mix

#### Scenario: Request unsupported DSP
- **WHEN** a caller registers third-party DSP, submits arbitrary effect JSON, or authors an unknown node
- **THEN** mutation fails visibly and no runtime factory or compatibility fallback participates

### Requirement: Derived media does not replace project truth
Proxy, waveform, thumbnail, loudness, transcode, AI candidate, and export artifacts SHALL be represented by ResourceRef and provenance according to their lifecycle. NKV SHALL continue to reference original sources until an explicit authoring disposition accepts a new asset; machine-specific cache paths MUST NOT become project facts.

#### Scenario: Edit through a proxy
- **WHEN** an equivalent proxy is available
- **THEN** preview may use it while trim, source mapping, relink, export, and provenance remain anchored to the original source

#### Scenario: Rebuild a missing derived artifact
- **WHEN** proxy, waveform, thumbnail, or loudness data is absent
- **THEN** the project remains valid and Cut can request regeneration without silently changing project revision

### Requirement: Proxy, transcode, and export are in-product operations
Cut SHALL submit typed Engine jobs for proxy, supported transcode, and timeline export; display progress, cancellation, and terminal diagnostics; and return authorized ResourceRefs. Profiles MUST be versioned and MUST NOT accept arbitrary FFmpeg arguments or filter graphs.

#### Scenario: Export a project revision
- **WHEN** a user exports a valid NKV document and expected revision
- **THEN** Cut freezes that revision, reports job progress, and presents the validated output even if later edits create a newer revision

#### Scenario: Cancel an output job
- **WHEN** a user cancels proxy, transcode, or export
- **THEN** Cut reports cancellation, preserves existing sources/destinations, and does not present partial output as successful

#### Scenario: Transcode an incompatible source
- **WHEN** an authorized source can be converted by a supported profile
- **THEN** Engine creates a new managed asset with provenance and Cut requires an explicit disposition before adding it to the project

### Requirement: NKV maps predictably to OTIO editorial structure
The domain layer SHALL map NKV ordered tracks, clips, gaps, supported transitions, source ranges, and timing to OTIO Timeline/Stack/Track/Clip/Gap/Transition semantics. OpenNeko-only layout, basic color, text style, and DSP SHALL use versioned `openneko.*` metadata. Runtime tokens, proxy/cache paths, and localhost URLs MUST NOT be exported as editorial facts.

#### Scenario: Round-trip the common subset
- **WHEN** a lightweight project uses only the declared OTIO core and recognized OpenNeko extensions
- **THEN** NKV-to-OTIO-to-NKV preserves track order, ranges, gaps, supported transitions, and recognized extension values

#### Scenario: Import unsupported OTIO semantics
- **WHEN** OTIO contains excessive visual concurrency, nested stacks, timewarp, unsupported effects/transitions, or unknown required extensions
- **THEN** import preserves the source OTIO, returns object/path-level diagnostics, and does not silently flatten or discard data

### Requirement: Legacy NKV is migrated by capability without data loss
The system MUST inspect legacy version and capability usage before migration. A fully representable project MAY be projected in memory and written only after explicit save through normal dirty/undo/backup semantics. A project using removed, excessive, or unknown semantics MUST remain byte-for-byte unchanged and return `unsupported-nkv-capabilities` diagnostics.

#### Scenario: Open a representable legacy project
- **WHEN** every legacy field maps losslessly to the lightweight profile
- **THEN** Cut opens an in-memory projection and does not rewrite the file until explicit save

#### Scenario: Open an advanced legacy project
- **WHEN** a project uses custom shader, non-normal blend, mask, arbitrary effect, keyframe/time-remap, professional color, or another removed semantic
- **THEN** Cut preserves the file and reports field paths plus explicit handoff or flatten options

#### Scenario: Open an unknown schema
- **WHEN** NKV version or required schema is unknown
- **THEN** loading fails closed without best-effort field fallback

### Requirement: Authoring and playback are document-scoped
Every Cut mutation, Engine timeline operation, media job, and processor handoff SHALL carry an explicit NKV document URI and expected revision where applicable. Active editor, recent file, output completion, or filename similarity MUST NOT select the target.

#### Scenario: Edit one of multiple projects
- **WHEN** multiple NKV documents are open and an edit, export, candidate accept, or handoff is requested
- **THEN** only the explicitly identified document/revision is affected or the operation fails on mismatch

### Requirement: Webview exposes only retained lightweight capabilities
The Cut Webview SHALL retain timeline, bounded layers, static layout, title/subtitle, simple transition, fixed speed, basic color, audio, derived-media, playback, and job UI. It MUST remove professional mode, arbitrary Effects/Mask, keyframe/shape animation, non-normal blend, reverse/time-remap, stylized transition, professional color/LUT, diff, and dynamic capability surfaces together with their stores, messages, handlers, localization, styles, and tests.

#### Scenario: Inspect Webview contracts
- **WHEN** Cut Webview source and generated bundles are audited
- **THEN** only typed per-editor authoring/playback/job/derived-artifact clients remain and removed operations cannot be sent or restored by a hidden UI path

#### Scenario: Seek and update preview
- **WHEN** a user scrubs or commits a timeline edit
- **THEN** Webview uses the existing stream seek or revisioned timeline update contract without requesting a public stream/session restart
