## Context

OpenNeko already has one canonical repository UI validation Skill and a package-owned Desktop functional platform. The platform creates isolated Electron states, drives user input, captures screenshots, checks selected DOM geometry and runtime diagnostics, and writes reports. It does not judge screenshot pixels. As a result, screenshot presence is currently easy to confuse with visual acceptance, and several important surfaces have no screenshot state at all.

This change affects repository development workflow and local functional scenarios, not product Agent behavior. The prompt boundary remains strict: Skill content may describe visual-analysis methodology and evidence requirements, but concrete tool names, commands, selectors, polling, runtime parameters, and package-private contracts stay in their existing runtime owners.

Five-layer analysis:

- **Responsibility:** `neko-ui-validation` owns acceptance planning and visual judgment. The shared Desktop runner owns neutral execution and capture. App-owned scenarios own application Shell states; each Webview package owns its feature states.
- **Dependency:** the Skill consumes image artifacts and runtime reports without importing product modules. Functional scenarios continue to depend on the shared runner primitives and public Desktop product path only.
- **Interface:** each acceptance item maps to an exact visual state and artifact; the Agent returns observable findings, uncertainty, and one existing outcome class. Scenario outputs keep their current screenshot artifact shape.
- **Extension:** future UI owners add states to their own scenarios. The Skill method stays domain-neutral and does not gain scenario-specific branches.
- **Testing:** an explicit local contract guards Skill semantics and required capture points; generic gates only prove that local UI entries remain unreachable; real Electron runs produce the images that the Agent may inspect.

## Goals / Non-Goals

**Goals:**

- Require an image-capable Agent to inspect every required visual artifact rather than infer appearance from scenario success or metadata.
- Keep functional, structural, and visual judgments distinct and fail visible when image evidence is unavailable or ambiguous.
- Add focused visual states for the application Sidebar and Settings surface.
- Add visual evidence for Cut playback/seek/authoring and the complete supported Preview viewer matrix.
- Keep one canonical Skill and one existing Desktop execution path.
- Keep UI evidence advisory and outside code completion, merge, release, and generic gate decisions.

**Non-Goals:**

- Add a second UI validation Skill, product Agent capability, image-analysis service, or autonomous product runtime controller.
- Add pixel-diff dependencies, golden-image storage, aesthetic scoring, GUI execution, or UI contract tests to CI or generic gates.
- Replace semantic runtime assertions with screenshots or claim that a screenshot proves interaction, persistence, media correctness, or lifecycle behavior.
- Move package-specific selectors, fixtures, or scenario authoring instructions into Skill content.
- Expand current production UI or runtime contracts.

## Decisions

### 1. Extend the existing Skill as the single workflow owner

`neko-ui-validation` SHALL add an explicit Agent visual-review stage inside its existing visual pass. It remains the only repository UI acceptance workflow; `neko-quality-review` continues to consume its result. Browser and desktop-control capabilities may help reach or inspect a state, but they do not define coverage or pass criteria.

Alternative considered: create a separate visual-analysis Skill. Rejected because functional and visual evidence must use the same acceptance inventory and outcome, and a second Skill would split ownership and permit conflicting signoff.

### 2. Require direct pixel inspection with traceable findings

For every required visual state, the Agent SHALL open the actual artifact, verify that it represents the intended state, and judge observable properties including fit, clipping, overlap, containment, hierarchy, spacing, alignment, readability, contrast, layering, focus, feedback, density, and relevant media or canvas visibility. It SHALL record the artifact reference and concrete findings. Filename, screenshot count, scenario status, DOM facts, or prior screenshots cannot substitute for inspecting the current pixels.

When pixels are unreadable, incomplete, stale, blank, corrupted, or unavailable, the state is `blocked` unless an observed defect already makes it `failed`. Uncertainty remains visible and cannot be converted to `passed`.

Alternative considered: let scenario success imply visual success. Rejected because the runner does not analyze image content and geometry assertions cover only known invariants.

### 3. Keep deterministic execution and semantic visual judgment separate

The existing Electron/CDP runner remains responsible for reproducible state construction, trusted input, screenshot capture, diagnostics, and cleanup. The development Agent consumes those artifacts after execution. Interactive desktop control is supplemental only when motion, hover, focus, or an uncaptured transient state must be observed; it cannot replace a package-owned scenario for repeatable Desktop boundaries.

This avoids embedding model invocation or credentials in the runner and keeps visual reasoning outside product runtime and CI.

### 4. Close focused coverage gaps at current owners

- `scripts/desktop-functional/desktop-workbench-scenes.mjs` SHALL capture compact and restored Sidebar presentations plus the Settings Workbench state because these are application Shell responsibilities.
- `@neko/cut-webview` SHALL capture stable ready, playback/seek, and post-authoring states in its package-owned scenario.
- `@neko/preview-webview` SHALL capture each supported image, audio, video, PDF, GLB, and glTF viewer after readiness and before close.

The shared runner and scenario registry remain unchanged. No central feature-name dispatch or test-only product route is introduced.

Alternative considered: add one central screenshot-tour scenario. Rejected because it would move package behavior and selectors into the application test harness and create a second ownership path.

### 5. Guard methodology and coverage through an explicit local contract

An explicit local-only contract SHALL verify that the Skill requires direct image inspection, artifact-to-inventory mapping, concrete findings, uncertainty handling, and separate functional/visual outcomes while still rejecting tool protocols and private schemas. The same local contract SHALL require the focused screenshot labels for Sidebar, Settings, Cut, and the Preview viewer matrix. It SHALL remain outside generic checks, local and remote code gates, CI aliases, and GitHub Actions.

Generic orchestration tests SHALL only prove that local UI execution and contract entries are unreachable from those gates and workflows. Real Electron evidence remains local-only. This change is excluded from product Neko Agent Evaluation because it does not change product prompts, Skill Host discovery, capability routing, provider selection, AgentSession, or Desktop Agent event projection.

### 6. Keep UI evidence advisory

The UI report SHALL preserve `passed`, `failed`, `blocked`, and `not-applicable` accurately for its own scope. A non-passing or missing UI result SHALL remain visible as a reference finding but SHALL NOT change a code-quality gate result or block implementation completion, commit, merge, or release. A defect may still block independently when functional, contract, security, or other code-gate evidence establishes it.

### 7. Separate functional readiness from visual settlement

A functional readiness condition proves that the owning runtime can operate the state; it does not prove that asynchronous data projection, media decode, the first meaningful frame, layout, animation, or GPU presentation has settled for visual inspection. Each owning scenario SHALL wait through a bounded visual-settlement window after its semantic readiness condition and before capturing the artifact.

The Agent SHALL interpret black or blank-looking media against the fixture content and capture timing. An expected black intro frame is not a rendering failure, while an unresolved loading or state-timing ambiguity remains blocked rather than being promoted to either pass or fail. A visible defect after settlement still fails normally.

Alternative considered: treat every black frame as a visual defect. Rejected because content semantics and loading state are distinct from UI rendering correctness, and the same pixels may be intentional source material.

### 8. Sample seekable video at its duration midpoint

A stable visual artifact for seekable video or a Cut timeline SHALL use the owning UI's user-operable seek control to position presentation at one half of the current finite duration before settlement and capture. The scenario SHALL verify the displayed or media time reached that derived target. Start, end, or another timestamp remains valid only when that exact temporal state is the acceptance subject.

This keeps visual evidence independent of intro frames and adapts to fixture duration without hard-coded timestamps. The shared runner remains unaware of media semantics, and scenarios do not assign `currentTime` directly or create a test-only product route.

Alternative considered: wait longer at time zero. Rejected because waiting does not change intentional black intro content and cannot prove a representative decoded frame.

## Risks / Trade-offs

- **Risk: Agent visual judgments vary between runs.** -> Anchor every judgment to the same acceptance item, current artifact, observable defect classes, and explicit uncertainty; do not invent numeric aesthetic scores.
- **Risk: more screenshots increase local runtime and artifact volume.** -> Add only stable states that close identified feature gaps and reuse the current report lifecycle.
- **Risk: screenshots become a substitute for behavior checks.** -> Keep functional and visual results separate, keep visual results advisory, and require independent functional or contract evidence for a code-blocking finding.
- **Risk: transient media frames create noisy image comparisons.** -> Use semantic Agent inspection rather than pixel baselines and wait through a bounded visual-settlement window after readiness before capture.
- **Risk: a hard-coded sample time becomes an intro or outro for a different fixture.** -> Derive the sample from the current finite duration and verify that the owning UI reached the midpoint before capture.
- **Risk: a capture succeeds but the intended state is absent.** -> Require the Agent to confirm state identity from visible pixels and mark mismatches failed or blocked.
- **Risk: local GUI evidence becomes stale.** -> Report the runtime target and artifact references for the current validation run; historical reports cannot prove a new change.

## Migration Plan

No production or user-data migration is required. Update the Skill and local-only contract first, add package-owned screenshot states, run the focused scenarios, inspect the new artifacts, and record the result. Reverting the change removes only development guidance, capture points, tests, and OpenSpec artifacts.

## Open Questions

None. Pixel baselines and automated perceptual diff remain intentionally deferred until stable cross-host rendering requirements justify them.
