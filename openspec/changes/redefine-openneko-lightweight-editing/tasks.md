## 1. Freeze boundaries and baseline evidence

- [ ] 1.1 Inventory current NKV fields, Engine actions/jobs, Cut operations/messages/stores, Agent capabilities, GPU modules, FFmpeg profiles, and all custom shader/plugin/diff/keyframe/professional-color entry points.
- [ ] 1.2 Record ownership, dependency, interface, extension, and test mapping for the NKV → Cut → Proto/client → Engine → stream/job → ResourceRef call chains.
- [ ] 1.3 Build representative synthetic fixtures for legacy/current NKV, OTIO, one-to-three visual layers, text, audio/DSP, difficult codecs, output jobs, and AI candidate workflows.
- [ ] 1.4 Capture current realtime startup, seek, scrub, revision update, frame latency/drop, A/V sync, GPU session, memory, and export throughput baselines on supported platforms.
- [ ] 1.5 Define source and generated-artifact absence guards for every removed capability, legacy alias, fallback, arbitrary process input, and CPU video decoder path.
- [ ] 1.6 Resolve or time-box the open proxy, encoder, three-layer performance, basic-color, and AI accept-disposition spikes before freezing v3 profiles.

## 2. Define canonical project and wire contracts

- [ ] 2.1 Define the NKV v3 lightweight schema for project output, visual/audio tracks, three-layer concurrency, source/time ranges, static layout, simple transitions, fixed positive rate, basic color, text, DSP, and lineage.
- [ ] 2.2 Implement a host-neutral NKV codec/validator that rejects unknown, removed, and over-limit semantics before save or Engine allocation with field/path diagnostics.
- [ ] 2.3 Define the Canonical BasicTimeline and versioned RenderPlan contracts without generic effect JSON, arbitrary metadata escape hatches, or parallel TypeScript timeline models.
- [ ] 2.4 Replace Proto Engine contracts with the six action groups, explicit session/stream/document/revision/job identities, closed job/profile unions, ResourceRef results, and structured diagnostics.
- [ ] 2.5 Regenerate Rust/TypeScript types and migrate `@neko/neko-client` to the canonical registry, small typed clients, and bounded stream/job descriptors.
- [ ] 2.6 Poison legacy actions, DTO fields, aliases, generic `applyOperation`, arbitrary filter/argv input, and missing instance identity so they cannot return compatibility success.

## 3. Implement OTIO exchange and NKV migration

- [ ] 3.1 Implement NKV ↔ OTIO Timeline/Stack/Track/Clip/Gap/Transition mapping for track order, ranges, gaps, cuts, fade, and cross-dissolve.
- [ ] 3.2 Define and validate versioned `openneko.*` OTIO metadata for static layout, basic color, text styles, audio/DSP, and safe lineage only.
- [ ] 3.3 Add OTIO capability inspection that rejects nested stacks, timewarp, excessive layers, unsupported effects/transitions, and unknown required extensions without flattening.
- [ ] 3.4 Implement legacy NKV capability inspection, lossless in-memory projection, explicit-save upgrade, and byte-preserving rejection for unsupported or unknown projects.
- [ ] 3.5 Add NKV/OTIO round-trip, diagnostic path, no-runtime-path leakage, save/undo/backup, unknown-schema, and legacy-path-poison tests.
- [ ] 3.6 Add explicit flatten/handoff descriptors for unsupported NKV/OTIO without placing External Processor discovery or execution in the codec.

## 4. Refactor Engine runtime ownership and authorization

- [ ] 4.1 Replace global/active-instance mutable media state with session-owned decoder, GPU surface, clock, mixer, transport, queue, generation, and cancellation ownership.
- [ ] 4.2 Implement explicit bounded leases for any shared GPU/decoder/process pool and prove release, reset, owner mismatch rejection, and cross-session isolation.
- [ ] 4.3 Consolidate opaque input-token and Host-owned output-root authorization across probe, capture, playback, jobs, Range, overwrite, expiry, traversal, and symlink checks.
- [ ] 4.4 Implement complete runtime shutdown and reconstruction covering HTTP/WebSocket, sessions, jobs, tokens, codec/GPU/process resources, queues, and Tokio tasks.
- [ ] 4.5 Add concurrent multi-document/session/job, cancellation, shutdown-with-work, stale identity, unauthorized path, and runtime-recreate tests.

## 5. Preserve GPU-only long-lived realtime playback

- [ ] 5.1 Freeze packaged VideoToolbox, D3D11VA, and VA-API class backend profiles and implement real fixture self-check for codec, pixel format, frame output, and required interoperability.
- [ ] 5.2 Remove CPU video decoder configuration, feature flags, automatic fallback, and software decode branches from realtime and job input paths while retaining explicit encoder profiles.
- [ ] 5.3 Refactor media and timeline stream creation to reuse session-owned FFmpeg/libav decoder, GPU device/surfaces, clock, mixer, encoder/transport, and public stream identity.
- [ ] 5.4 Implement in-context seek/flush/pre-roll, latest-wins scrub, and generation-tagged stale frame/audio rejection without process or stream restart.
- [ ] 5.5 Implement revisioned `timelines:update` with background RenderPlan preparation and atomic activation at the requested playhead.
- [ ] 5.6 Add path/performance tests proving seek and edits retain process/stream identity, meet baseline bounds, use the declared hardware decoder, and never participate in CPU or legacy renderer paths.

## 6. Build the bounded RenderPlan renderer

- [ ] 6.1 Compile validated BasicTimeline into a single RenderPlan consumed by realtime preview, capture, and export.
- [ ] 6.2 Reduce GPU composition to at most three active visual elements, painter order, normal source-over alpha, transparent upper gaps, black background, and static transform/crop/fit/opacity.
- [ ] 6.3 Retain only hardware-frame import/export, buffer/budget, required upload/download, text/color nodes, and encoder bridges used by canonical preview/capture/export.
- [ ] 6.4 Implement hard cut, fade, cross-dissolve, bounded constant positive speed, source-handle validation, and optional pitch preservation.
- [ ] 6.5 Implement the closed basic-color node and deterministic title/subtitle shaping, packaged font fallback, bounded styles, and substitution diagnostics.
- [ ] 6.6 Add golden preview/capture/export tests for layers, gaps, layout, transitions, speed, color, text, duration, stale generations, and rejection of every removed visual semantic.

## 7. Unify production media jobs

- [ ] 7.1 Implement `MediaJobManager` for the closed job union with typed/versioned profiles, explicit identity, bounded concurrency, progress, status/list/cancel, terminal diagnostics, and shutdown integration.
- [ ] 7.2 Implement QoS and GPU session budgeting so realtime playback and seek/capture outrank proxy, transcode, timeline export, and audio render.
- [ ] 7.3 Migrate proxy generation to content/profile/runtime-addressed cache artifacts with verified duration, timestamp, frame, audio, and source-time equivalence.
- [ ] 7.4 Migrate transcode to typed profiles, GPU-only video input decode, explicit encoder choice, staged validation, atomic output, new ResourceRef provenance, and no source replacement.
- [ ] 7.5 Migrate waveform and loudness to rebuildable typed jobs that do not change NKV revision.
- [ ] 7.6 Migrate timeline export to frozen document/revision/snapshot/RenderPlan, PTS-based progress, output validation, atomic commit, and ResourceRef provenance.
- [ ] 7.7 Add cancellation, crash, invalid output, overwrite, resource pressure, playback contention, and no-partial-success/no-CPU-fallback tests.

## 8. Retain a closed audio finishing pipeline

- [ ] 8.1 Define versioned DSP nodes, parameter ranges, and order for gain/volume/pan, fades, EQ/filters, compressor, noise gate, limiter, loudness normalization, resample, and channel conversion.
- [ ] 8.2 Refactor preview, mix stream, audio render, waveform/loudness analysis, and export to share the canonical audio timing and DSP contract.
- [ ] 8.3 Remove runtime DSP factory registration, third-party nodes, arbitrary graphs/effect JSON, and writable creative DSP not explicitly in the profile.
- [ ] 8.4 Preserve fail-visible audio decode/DSP/mix/mux errors so no silent or video-only result can report success.
- [ ] 8.5 Add sample/golden tests for overlap, pan/fade, EQ/dynamics, limiter, loudness, preserve-pitch, channel conversion, preview/export parity, and unsupported-node rejection.

## 9. Rebuild Cut and Webview around one lightweight mode

- [ ] 9.1 Remove the basic/professional selector and rebuild authoring state around explicit document URI/revision, multi-track operations, selection, undo/redo, and canonical NKV mutation.
- [ ] 9.2 Retain and simplify UI for three-layer organization, static layout, title/subtitle, simple transition, fixed speed, basic color, audio/waveform/loudness, proxy/transcode/export, and job progress/cancel/result.
- [ ] 9.3 Delete Effects/Mask, keyframe/shape animation, blend modes, reverse/time-remap, stylized transitions, Wheels/Curves/HSL/LUT, diff, and dynamic capability UI with stores, operations, undo, messages, handlers, i18n, CSS, and tests.
- [ ] 9.4 Replace singleton/broad media proxies with per-editor typed authoring, playback, media-job, and derived-artifact clients carrying explicit instance identity.
- [ ] 9.5 Migrate seek/scrub to live `streams:seek` and edit commit to revisioned `timelines:update` with local buffer flush only and no public restart path.
- [ ] 9.6 Migrate Preview/Canvas/Assets/Tools consumers to canonical media/capture/derived-artifact contracts and remove diff/variant/plugin dependencies.
- [ ] 9.7 Add Extension/Webview tests for import, proxy, layered edit, text, transition, speed, color, audio, playback/update, job lifecycle, export, save/reopen, error UI, and multi-document isolation.

## 10. Implement managed AI and professional handoff

- [ ] 10.1 Define the closed capability classification and immutable External Processor request contract for profile-external generation, repair, tracking, upscale/interpolation, advanced grade, and composition.
- [ ] 10.2 Implement processor resolution, identity/version, trust, approval, PathAccessPolicy, sandbox, declared output, task status, cancellation, diagnostics, and provenance without Engine-owned discovery.
- [ ] 10.3 Define immutable candidate ResourceRef metadata including content hash, media metadata, provider/model/version, safe prompt/parameter summary, inputs, source NKV revision, task identity, and lineage.
- [ ] 10.4 Validate processor output through the owning media validator before candidate delivery; reject missing, corrupt, mismatched, unauthorized, or unsupported output despite provider success.
- [ ] 10.5 Implement preview/reject/accept candidate lifecycle and revisioned dispositions through canonical Cut authoring, undo, backup, and explicit asset/clip import.
- [ ] 10.6 Implement multi-stage orchestration that requires candidate acceptance before deterministic edit/export stages and stops safely on generation failure or revision conflict.
- [ ] 10.7 Add no-processor, denied approval, invalid output, stale revision, reject, accept, source preservation, secret/transient-path redaction, no-shell/no-legacy-fallback, and multi-document tests.

## 11. Delete open-ended capabilities vertically

- [ ] 11.1 Poison and delete custom/user WGSL, shader upload, dynamic effect/plugin registration, capability discovery, and generic effect application from contract through implementation.
- [ ] 11.2 Delete non-normal blend, masks, adjustment/effect tracks, arbitrary parameters, complex transitions, generic keyframe/animation/time-remap/reverse, and professional color/LUT paths.
- [ ] 11.3 Delete diff/audio-diff/video-diff/timeline-diff and unowned preview variant implementations, DTOs, commands, manifests, clients, UI, docs, and fixtures.
- [ ] 11.4 Remove legacy controller aliases, compatibility reads/writes, fallback branches, hidden CLI/N-API methods, and tests that allow removed paths to succeed.
- [ ] 11.5 Shrink Cargo/pnpm dependencies, generated artifacts, FFmpeg/font/platform packages, settings, and contributions only after every retained path has a canonical owner.
- [ ] 11.6 Run source/dependency/action/manifest/bundle absence guards and legacy-debt/unused checks proving removed capabilities cannot be rediscovered or restored.

## 12. Align Agent routing and evaluation

- [ ] 12.1 Update Cut/media capability schemas so lightweight authoring and production jobs expose explicit document/revision, typed profile, task, ResourceRef, candidate, and disposition contracts.
- [ ] 12.2 Update `skill.video-editing` and `skill.color-grading` only for changed creative boundaries; reuse audio/subtitle methods unless their Skill content actually changes.
- [ ] 12.3 Create/update the indexed Agent Evaluation suite and cases in `evaluation.md` for Engine export/proxy, advanced AI processing, candidate acceptance, mixed workflow, and missing processor.
- [ ] 12.4 Audit neutral TUI/runtime facts for capability identity, target revision, job/process state, approval, candidate/artifact identity, validation, provenance, and forbidden fallback; add only missing owning facts.
- [ ] 12.5 Refresh Host-computed Skill fingerprints, coverage mapping, key-free schema/runner validation, and dry-run selection before real provider-backed execution.
- [ ] 12.6 Run focused real TUI cases in an isolated synthetic workspace and record run/report IDs, effective model/target identities, path evidence, artifact validation, costs, blockers, and residual risk.

## 13. Synchronize documentation, packaging, and validation

- [ ] 13.1 Update Engine runtime, Cut/Canvas, Proto/wire, External Processor, package-boundary, and Agent orchestration ADR/domain docs for the final ownership model.
- [ ] 13.2 Supersede active OpenSpec text that promises CPU-first playback, single-track editing, removed production jobs, or the old wide effect/plugin surface without rewriting archived history.
- [ ] 13.3 Update root/package README, NKV/OTIO/AI compatibility docs, Chinese/English UI text, settings, and diagnostics for GPU requirements, derived media, export, and candidate handoff.
- [ ] 13.4 Freeze three-platform FFmpeg build/license manifest, backend self-check fixtures, proxy/export profiles, packaged fonts, and supported hardware/codec matrix.
- [ ] 13.5 Run Proto generation/idempotence, focused producer/consumer tests, Rust fmt/clippy/tests, TypeScript typecheck/build, Cargo Deny, and strict OpenSpec validation.
- [ ] 13.6 Run synthetic Engine/NKV/OTIO/media-job tests plus preview/export golden and performance gates, including path evidence, QoS, shutdown, no restart, and no CPU decode.
- [ ] 13.7 Use Extension Development Host with `vscode-extension-debugger` and isolated fixtures to verify import → proxy → layered edit → audio/text → AI candidate accept → realtime preview → save → export.
- [ ] 13.8 Run root build/test/check/quality/legacy/unused gates, `pnpm test:agent:eval`, focused real evaluation, `git diff --check`, release packaging, and a final retained/removed path audit before completion.
