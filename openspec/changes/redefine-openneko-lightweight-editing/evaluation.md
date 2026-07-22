## Evaluation Scope

- Change/feature: Cut Agent authoring changes from NKV and implicit UI ownership to explicit `.otio` document URI/revision and host-neutral offline OTIO commands.
- Authoring decision: `create` the indexed suite `agent-runtime.cut-authoring`. The existing `video-editing` Skill owns editing methodology, not real Cut document routing, revision or artifact side effects.
- Why real evaluation is required: capability registration, target selection, approval and persisted artifact delivery can change real Agent behavior. Parser and command unit tests cannot prove that a real Agent selects the canonical Cut capability.
- Canonical path: real TUI Agent request → host-neutral Cut capability → explicit `.otio` URI/revision → Cut Core command → independently validated `.otio` artifact.
- Forbidden substitutes: eval-only Cut tools, direct fixture mutation, active/recent document selection, NKV/NKC aliases, Webview state, media runtime shortcuts and hidden host-specific writes.

## Planned Cases

### `cut-create-edit-save-otio`

- Kind: positive.
- Prompt intent: create an OTIO project, add workspace-relative media references and gaps, perform trim/reorder/delete operations, then save or save-as.
- Required evidence: selected capability/operation, explicit `.otio` target/revision, validated OTIO artifact, workspace-relative references and absence of NKV/NKC writes.
- Path assertion: poison legacy handlers and assert the Cut Core document-session command path.

### `cut-open-edit-export-otio-structure`

- Kind: positive.
- Prompt intent: open an existing `.otio`, edit it and export the updated OTIO structure to another `.otio` destination.
- Required evidence: source and destination document identities, expected/new revisions, validated serialized OTIO and unchanged referenced media bytes.
- Path assertion: “export” means OTIO serialization/save-as only; no media probe, frame capture, playback or MP4 export operation may run.

### `canvas-route-explicit-cut-target`

- Kind: boundary/positive.
- Prompt intent: send an ordered Canvas media/gap route to a new Cut or a named existing `.otio`.
- Required evidence: route snapshot, target mode, target URI/revision and resulting OTIO edit.
- Path assertion: no active/recent Cut lookup; missing target choice fails.

### `cut-reject-invalid-offline-authoring`

- Kind: failure.
- Prompt intent: edit an `.nkv`, omit the target, use a stale revision, link an absolute/escaping path or request an unsupported timeline object.
- Required evidence: structured fail-visible diagnostic identifying the exact unsupported condition.
- Path assertion: no fallback, default document, partial side effect, empty success, legacy handler or Webview mutation.

## Evidence and Observability

- Record scenario id, provider/model, Agent run/report identity, capability/operation, approval, target URI/revision and terminal diagnostic.
- Validate resulting `.otio` independently with the owning OTIO validator and verify referenced media bytes were not copied or changed.
- Add path counters/spies or poison assertions for Cut Core document sessions, legacy handlers, active/recent target lookup and Webview-owned persistence.
- Use isolated synthetic workspaces without real user media, credentials or private paths.
- Key-free harness results prove manifest/schema/runner behavior only, not real model selection or side effects.

## Explicit Exclusions

- TUI evaluation does not prove media codec support, source duration, audio-stream presence, logical separation runtime correctness, frame capture, PCM, playback, preview quality or MP4 export.
- Those behaviors require a selected media adapter and deterministic adapter/Extension Development Host tests. They must not be simulated through fixture metadata or Evaluation-only media tools.
- Pure OTIO parse/serialize, schema rejection and command algebra remain primarily deterministic tests; the real suite proves Agent routing and durable artifact delivery.

## Missing Observability / Implementation Blocker

- The current indexed Agent evaluation catalog has no Cut-authoring suite.
- The canonical TUI runtime must expose the production host-neutral Cut document binding and artifact events. If unavailable, real cases remain blocked.
- Do not add an evaluation-only Cut capability, direct turn runner or fixture mutation path.

## Verification Plan

- Artifact stage: strict OpenSpec and documentation consistency checks only; no runtime capability has been implemented.
- Implementation stage: run suite key-free self-tests, then focused real Agent cases through the canonical TUI session owner.
- VS Code visual/media acceptance remains separate and uses Extension Development Host evidence.

## Current Result

- Real Agent evaluation: not run; this proposal does not implement or register the Cut capability changes.
- Key-free Agent harness: not run; no evaluation manifest or runner code changes are part of this artifact update.

## Residual Risks

- Until TUI exposes the production Cut binding, Agent routing and artifact side effects remain unverified.
- Offline authoring can preserve a workspace-relative media reference without proving that its bytes are decodable; selected media operations must diagnose that later.
- Media runtime correctness remains outside this suite and requires its own adapter and VS Code evidence.
