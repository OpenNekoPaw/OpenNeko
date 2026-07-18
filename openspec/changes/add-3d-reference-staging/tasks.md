## 1. Close the prerequisite and define the replacement contract

- [x] 1.1 Finish or explicitly accept the remaining warnings in `add-standard-3d-model-preview`, sync its stable specs, and archive it before implementing this follow-up.
- [x] 1.2 Add red shared contract/parser/compile tests for the versioned `3d-reference` session, subject, preset, purpose, pose, camera, panorama, output, context, identity, and diagnostic unions from abstract contracts to concrete messages.
- [x] 1.3 Poison and remove successful `model-preview` parsing, producers, consumers, fixtures, aliases, and generic-image fallback inside the replacement boundary; prove only `3d-reference` reaches the new canonical path.
- [x] 1.4 Define exact migration behavior for transient workspace/Webview state and Agent contexts: rebuild from live staging, reject incompatible versions, and preserve user model/panorama source data without dual-read or dual-write.

## 2. Prove bundled preset feasibility and ownership

- [x] 2.1 Implement a bounded feasibility spike comparing corrected project-owned procedural geometry with one audited rigged GLB for mannequin articulation, landmarks, pose output, package size, load time, render quality, and recursive disposal; record the decision in `design.md` before production implementation.
- [x] 2.2 Define the immutable Preview-owned preset catalog contract with stable ID/version/fingerprint, kind, allowed purposes, default scale, pose/environment capabilities, exact packaged dependencies, provenance, and license metadata.
- [x] 2.3 Add red catalog validation tests for duplicate/unknown IDs, incompatible versions, fingerprint mismatch, invalid joint/render-pass metadata, undeclared dependencies, missing notices, and guide presets that expose appearance.
- [x] 2.4 Add the minimum project-authored or redistribution-safe guide catalog: abstract articulated mannequin, primitive/blockout props, studio/room blockout, and neutral panoramic orientation grid; include audited notice/provenance records.
- [x] 2.5 Add build ownership and lazy-load tests proving non-3D Preview entries do not fetch or instantiate preset assets; record actual per-asset/aggregate bundle size and supported-host load/disposal measurements.

## 3. Extend the Preview Extension session boundary

- [x] 3.1 Extend the panel-scoped provider protocol with explicit `source-model`, `builtin-preset`, and `environment-only` subjects, purpose eligibility/selection, pose, panorama environment, and purpose-specific capture requests while preserving session identity and cancellation.
- [x] 3.2 Add an explicit command/panel entry for a no-source guide session; keep real model/panorama load failures typed and visible and add poison tests proving they cannot open a bundled fallback.
- [x] 3.3 Project exact built-in assets from the code-owned catalog through `webview.asWebviewUri()` and existing local-resource authorization, sending only stable preset identity plus authorized runtime descriptors to the matching panel.
- [x] 3.4 Reuse/extract package-local panoramic inspection and authorization helpers for the 3D environment path without nesting or instantiating another custom-editor provider.
- [x] 3.5 Add provider lifecycle tests for simultaneous source, guide, and environment-only panels; stale/mismatched messages; cancellation during preset/panorama load; close/reload; and idempotent resource release.

## 4. Implement Three.js reference staging

- [x] 4.1 Extend the fakeable Three runtime port with declared preset load, pose capability/constraints, pose preset and joint operations, panorama environment projection, purpose render passes, and exact disposal contracts.
- [x] 4.2 Implement the neutral mannequin and blockout runtime without detailed appearance cues; validate catalog-declared joints, hierarchy, constraints, landmarks, and compatible pose presets rather than guessing node semantics.
- [x] 4.3 Implement bounded pose/skeleton and supported depth control render passes that exclude toolbar, grid, XYZ, camera helper, labels, and other editor chrome unless explicitly required by that output contract.
- [x] 4.4 Implement panorama texture/orientation staging with authorized local resources, bounded MIME/size handling, untainted capture, renderer-loss diagnostics, and recursive texture/GPU disposal.
- [x] 4.5 Preserve current camera front/reset, orbit, grid, XYZ, light, material, depth, and source-model correctness; use only external `~/Git/neko-test/test.glb` for manual real-model acceptance and never copy that model into the repository.

## 5. Build the purpose-aware 3D Reference UI

- [x] 5.1 Rename the user-facing surface to 3D Reference/3D 参考 while retaining source-read-only and temporary-staging messaging; update Chinese and English localization together.
- [x] 5.2 Add package-local typed source/preset/environment composition using existing tree, panel, property, segmented-control, badge, empty-state, floating-toolbar, focus, keyboard, theme, and i18n primitives; do not add a package-local design system or generic property adapter.
- [x] 5.3 Add visible independent appearance, pose, camera, and panoramic-scene purpose controls with capability-derived availability and a persistent “guide only, not appearance reference” label for restricted presets.
- [x] 5.4 Add pose preset and constrained joint controls for supported subjects, explicit unsupported states for static/non-articulated models, and no animation timeline, IK, retargeting, or source writeback.
- [x] 5.5 Add camera, shot/aspect, panorama orientation, environment, capture, and output-preview controls without resetting the live orbit view during unrelated edits.
- [x] 5.6 Add focused accessibility, keyboard/focus, theme, panel-switching, resize, role-selection, stale-state, and multi-root Webview tests.

## 6. Replace Agent, Canvas, and media delivery

- [x] 6.1 Materialize exact bounded purpose resources through the existing rebuildable resource boundary and build one validated `3d-reference` context containing only outputs selected for the live session revision.
- [x] 6.1.1 Store capture sources in the owning workspace resource cache, reject missing/ambiguous workspace ownership before writes, and add a regression test proving Preview global storage is not used for Agent handoff.
- [ ] 6.2 Update Agent context parsing, chips, prompt/evidence projection, reference tokens, and multimodal attachment handling so every output retains appearance/pose/camera/panorama role and guide restrictions.
- [ ] 6.3 Update Canvas/Agent media projection to map pose/depth only to `controlImage` plus matching `controlMode`, appearance only to explicit ordinary/IP-Adapter references, and camera/panorama only to declared structured controls.
- [ ] 6.4 Add capability negotiation and red/green tests proving unsupported provider/model controls fail before submission and cannot be dropped, converted to prompt-only success, rerouted to another provider, or attached as ordinary appearance.
- [ ] 6.5 Add path-level spies/poison guards proving Preview session → purpose output → `3d-reference` context → Agent/Canvas/media projection, with no legacy context, generic image fallback, direct provider selection, raw model upload, Engine Model/Scene path, or feature-package internal import.

## 7. Validate the real product boundary

- [ ] 7.1 Add owning Preview functional scenarios with isolated synthetic fixture workspaces for guide creation, preset selection, pose, camera, panorama, purpose toggles, send, reload, multi-panel isolation, and disposal; assert CSP/runtime/console/resource/Engine errors and exact output roles.
- [ ] 7.2 Run the built-in scenarios in an Extension Development Host through `pnpm test:webview:functional` and `vscode-extension-debugger`; retain only reports under `reports/webview-functional/` and commit a scrubbed result summary.
- [ ] 7.3 Manually verify the real-source path in the external `~/Git/neko-test` workspace with `test.glb`, including appearance/pose eligibility, camera, panorama composition, material completeness, angle changes, and role isolation without repository-local copies.
- [x] 7.4 Use `neko-agent-evaluation` to make an explicit `reuse | update | create | excluded` decision for the changed Agent context/purpose-routing behavior, run `pnpm test:agent:eval` for harness integrity, and run the required focused real TUI case or record the exact external blocker without claiming behavior acceptance.
- [ ] 7.5 Run focused shared/Preview/Agent/Canvas/media tests, typechecks, production builds, manifest/CSP/build-ownership/license tests, `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:legacy-debt`, `pnpm check:unused`, strict OpenSpec validation, and `git diff --check`; record all blocked commands and residual risks.

## 8. Document and prepare rollout

- [x] 8.1 Update Preview README/architecture, supported reference-purpose tables, built-in catalog/licensing documentation, package description, commands, and user-facing no-model/guide behavior in Chinese and English where applicable.
- [ ] 8.2 Update the system ADR and package-boundary documentation only where the stable responsibility changes, preserving the absence of durable 3D projects and Rust Engine Model/Scene authority.
- [ ] 8.3 Record the final design/reuse audit, asset provenance, actual bundle/performance measurements, canonical-path/no-fallback evidence, Extension Development Host reports, Agent Evaluation disposition, validation commands, blocked checks, and remaining risks in `verification.md`.
