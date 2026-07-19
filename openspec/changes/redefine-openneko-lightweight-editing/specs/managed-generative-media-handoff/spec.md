## ADDED Requirements

### Requirement: Requests are classified by a closed capability boundary
Agent/Platform SHALL classify supported timeline authoring and basic media production separately from profile-external generative/professional processing. Basic authoring and Engine jobs MUST remain on their canonical paths; generative/professional requests MUST use External Processor resolution.

#### Scenario: Route deterministic lightweight editing
- **WHEN** a user requests trim, split, track organization, static layout, title/subtitle, simple transition, fixed speed, basic color, or supported audio editing
- **THEN** Agent uses explicit Cut authoring capabilities and does not invoke an AI processor

#### Scenario: Route basic media production
- **WHEN** a user requests proxy, supported transcode, waveform, loudness, audio render, or NKV export
- **THEN** Agent uses the typed Engine job path and does not invoke an External Processor

#### Scenario: Route generative or professional work
- **WHEN** a user requests shot generation, background replacement/extension, complex mask/tracking, denoise, upscale, interpolation, stylization, advanced grade, or advanced composition
- **THEN** Agent resolves a managed External Processor and does not invoke a removed Engine action

### Requirement: External Processor invocation is authorized and observable
Every generative/professional invocation SHALL include explicit input ResourceRefs or NKV document URI/revision, declared output kind, provider/processor identity and version, trust state, approval, sandbox/policy decision, task identity, terminal status, diagnostics, and provenance. Engine SHALL not own provider discovery or approval.

#### Scenario: Start an approved processor task
- **WHEN** an enabled trusted processor matches the request and the user/policy grants required approval
- **THEN** Platform starts one observable task using only authorized inputs and declared outputs

#### Scenario: Deny processor access
- **WHEN** trust, approval, PathAccessPolicy, sandbox, or required input validation fails
- **THEN** no processor starts, no output is accepted, and the denial is reported without project mutation

### Requirement: Generative results are immutable media candidates
Every successful generative/professional result SHALL be delivered as a new immutable candidate ResourceRef with content hash, media metadata, provider/model/version or processor identity, prompt/parameter summary, input ResourceRefs, source NKV URI/revision when applicable, task identity, timestamp, and provenance. It MUST NOT be represented as a deterministic NKV effect or overwrite an input resource.

#### Scenario: Generate a new shot
- **WHEN** an AI video task completes successfully
- **THEN** OpenNeko records a new candidate resource and leaves all source media and NKV revisions unchanged

#### Scenario: Modify a source video generatively
- **WHEN** a provider describes the operation as editing, extending, replacing, or transforming an existing video
- **THEN** OpenNeko still records the result as a distinct candidate with lineage to the input

### Requirement: Candidate acceptance is explicit and revisioned
Candidate preview, validation, rejection, and acceptance SHALL be separate from processor completion. Accepting a candidate into NKV SHALL require explicit document URI, expected revision, and disposition such as add asset, add/insert clip, or replace selected clip, and SHALL use the normal authoring, undo, backup, and save path.

#### Scenario: Accept a candidate
- **WHEN** a user accepts a validated candidate with a supported disposition and matching document revision
- **THEN** Cut creates one normal authoring revision referencing the candidate ResourceRef and records lineage

#### Scenario: Reject a candidate
- **WHEN** a user rejects a candidate
- **THEN** no project mutation occurs and the generated artifact remains independently addressable until the user deletes it or an explicitly configured retention policy authorizes cleanup

#### Scenario: Candidate target is stale
- **WHEN** expected project revision or selected clip identity no longer matches
- **THEN** acceptance fails visibly, preserves the candidate, and does not retarget the active editor

### Requirement: Candidate validation is owned by the media domain
Before acceptance or delivery, a candidate SHALL pass owning media validation for existence, content hash, declared container/codec, duration/dimensions, decodability under supported policy, and any request-specific constraints. Agent final text or provider success alone MUST NOT prove artifact validity.

#### Scenario: Validate a usable candidate
- **WHEN** processor success produces an accessible output matching its declaration
- **THEN** the media validator records validation facts and the candidate becomes previewable/acceptable

#### Scenario: Processor reports success with invalid output
- **WHEN** output is missing, corrupt, mismatched, or unauthorized
- **THEN** the task is treated as failed or invalid-artifact and no candidate can be accepted

### Requirement: Missing advanced capability fails visibly
If no enabled, trusted, permitted processor can satisfy a profile-external request, OpenNeko SHALL return an actionable unavailable-capability diagnostic. It MUST NOT use arbitrary shell, package-local FFmpeg, a basic Engine job, a removed action, hidden plugin discovery, or fabricated success as fallback.

#### Scenario: No processor is available
- **WHEN** a user requests profile-external work and resolution finds no eligible processor
- **THEN** no tool/process/job starts, no artifact is created, and the response identifies the missing capability or configuration

### Requirement: Multi-stage AI editing preserves explicit boundaries
When a request requires deterministic editing plus generative processing, Agent SHALL produce an ordered plan whose stages name their canonical owner, input/output ResourceRefs, document revision, acceptance point, and validation. A generated result MUST be explicitly accepted before later Cut/Engine stages consume it.

#### Scenario: Generate then assemble and export
- **WHEN** a user asks to generate a shot, insert it into a project, mix audio, and export
- **THEN** processor completion creates a candidate, explicit acceptance creates a new NKV revision, deterministic editing targets that revision, and export freezes the final revision

#### Scenario: Generation fails mid-workflow
- **WHEN** the processor task fails before candidate acceptance
- **THEN** later authoring/export stages do not run and the existing project remains unchanged

### Requirement: Provider secrets and transient endpoints never become project facts
Credentials, tokens, localhost URLs, Webview URIs, blob URLs, sandbox paths, and raw provider responses SHALL remain in their owning runtime boundary. NKV, OTIO, portable provenance, Agent messages, and committed evaluation fixtures MUST contain only stable identities, safe summaries, ResourceRefs, and redacted diagnostics.

#### Scenario: Persist AI lineage
- **WHEN** an accepted AI candidate is referenced by NKV or exported through OTIO metadata
- **THEN** persisted lineage contains stable provider/model/processor identity and safe provenance without secrets or transient endpoints

### Requirement: Agent routing is proven by focused real evaluation
Changes to capability/tool routing for lightweight editing, Engine media jobs, and External Processor invocations SHALL have indexed focused Agent Evaluation with canonical-path facts, no-fallback assertions, artifact identity/provenance evidence, and fail-visible cases. Deterministic Engine/NKV correctness SHALL remain outside Agent evaluation.

#### Scenario: Evaluate both sides of the boundary
- **WHEN** the change is validated for release
- **THEN** real TUI cases prove a basic Engine job, a generative/professional processor task, candidate acceptance, and missing-processor failure without removed or fallback paths
