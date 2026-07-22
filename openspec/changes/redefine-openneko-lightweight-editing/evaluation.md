## Evaluation Scope

- Change/feature: VS Code Cut changes from NKV/NKC and implicit editor routing to OTIO-only authoring, explicit Canvas targets and explicit logical audio separation that reuses the source MP4.
- Authoring decision: `create` the indexed suite `agent-runtime.cut-authoring`. The existing `video-editing` Skill does not own real Cut document revision, capability routing or side-effect evidence.
- Why real evaluation is required: implementation changes Agent-visible Cut schemas, target selection, approval context and persisted OTIO artifacts. Unit/schema tests cannot prove a real Agent selects the canonical path or avoids legacy and transcode fallbacks.
- Canonical path: real Agent request → host-neutral Cut capability → explicit `.otio` URI/revision → Cut Core command → validated OTIO side effect.
- Forbidden substitutes: eval-only Cut tools, direct fixture mutation, active/recent document selection, NKV/NKC aliases, audio-transcode/WAV derivation and hidden host-specific shortcuts.

## Planned Cases

### `cut-create-otio-project`

- Kind: positive.
- Prompt intent: create a basic Cut project from supported media, perform trim/reorder/gap operations and save it.
- Required evidence: selected capability/operation, explicit `.otio` target/revision, validated OTIO artifact, project-relative media references and absence of NKV/NKC writes.
- Path assertion: poison legacy handlers and assert the Cut Core OTIO command path.

### `canvas-route-explicit-cut-target`

- Kind: boundary/positive.
- Prompt intent: send an ordered Canvas route to a new Cut or a named existing `.otio`.
- Required evidence: route snapshot, target mode, target URI/revision and resulting OTIO edit.
- Path assertion: no active/recent Cut lookup; missing target choice fails.

### `cut-separate-audio-logically`

- Kind: positive.
- Prompt intent: import a video, then explicitly separate its embedded audio.
- Required evidence: initial Video Clip only; later Audio Clip with the same MP4 ExternalReference, copied initial range and provenance-only source identity.
- Path assertion: import creates no Audio Clip; separation invokes a Cut command only; no `audios:transcode`, WAV, staging file or media mutation occurs.

### `cut-reject-legacy-or-implicit-target`

- Kind: failure.
- Prompt intent: edit an `.nkv`, omit the target, use a stale revision, separate ambiguous multi-stream audio or request speed/interpolation.
- Required evidence: structured fail-visible diagnostic identifying the exact unsupported condition.
- Path assertion: no fallback, default document, partial side effect, empty success, legacy handler or transcode invocation.

## Evidence and Observability

- Record scenario id, provider/model, Agent run/report identity, capability/operation, approval, target URI/revision and terminal diagnostic.
- Validate resulting `.otio` independently; for logical separation assert both Clips reference the same project-relative MP4 and no new media file exists.
- Add path counters/spies or poison assertions for Cut Core, selected Engine adapter, legacy handlers and `audios:transcode` so final-output equality cannot hide fallback use.
- Use isolated synthetic workspaces without real user media, credentials or private paths.
- Key-free harness results prove manifest/schema/runner behavior only, not real model selection or side effects.

## Missing Observability / Implementation Blocker

- The current indexed Agent evaluation catalog has no Cut-authoring suite.
- The canonical TUI evaluation surface must expose the same host-neutral Cut capability and artifact events used by VS Code. If unavailable, the real case remains blocked.
- Do not add an evaluation-only Cut capability or mutate OTIO fixtures directly to bypass the product path.

## Verification Plan

- Artifact stage: strict OpenSpec and documentation consistency checks only; no runtime capability has been implemented.
- Implementation stage: run suite key-free self-tests, then focused real Agent cases through the canonical TUI binding.
- VS Code visual/media acceptance remains separate and must use Extension Development Host evidence.

## Current Result

- Real Agent evaluation: not run; this proposal does not implement or register the Cut capability changes.
- Key-free Agent harness: not run; no evaluation manifest or runner code changes are part of this artifact update.

## Residual Risks

- Until Cut is exposed through the canonical TUI binding, Agent routing and side-effect behavior remain unverified.
- Model variability may still select deferred operations or misunderstand logical separation as WAV extraction.
- Engine codec, PCM and export correctness require dedicated Rust and Extension Development Host validation outside Agent evaluation.
