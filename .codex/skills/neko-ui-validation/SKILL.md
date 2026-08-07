---
name: neko-ui-validation
description: Produce advisory OpenNeko UI validation evidence through an acceptance inventory, authoritative runtime, functional checks, direct image-capable Agent review, adjacent regression checks, and fail-visible reporting. Use after implementing new UI features, changing layout, interaction, or presentation, fixing UI bugs, or when asked for UI/UX acceptance or graphical verification; classify work with no user-visible impact as not applicable.
---

# Neko UI Validation

Review the complete affected UI function set and produce advisory evidence. Treat requested behavior, the real product path, and observable evidence as authoritative.

## Decide Applicability

- Mark the workflow applicable when implementation adds or changes a user-visible control, view, interaction, layout, visual state, feedback state, or navigation path.
- Mark it not applicable when the completed change has no user-visible behavior or presentation impact. Record the reason and stop.
- Do not treat design exploration, static mockups, or implementation plans as completed UI requiring acceptance.

## Build The Acceptance Inventory

Create one inventory from:

1. the requested user-visible behavior;
2. the controls, views, and shared presentation affected by the implementation;
3. every meaningful state transition those controls can cause;
4. the user-visible claims intended for delivery.

For each item, record the starting state, user action, observable result, visual state to inspect, adjacent behavior at risk, and expected evidence. Cover the initial, changed, and return or cancellation states for reversible interactions. Include loading, empty, error, denied, disabled, dense, and long-content states when the feature can reach them.

Every delivery claim must map to at least one inventory item. Do not add unrelated exhaustive coverage merely to enlarge the matrix.

## Choose The Authoritative Runtime

Use the narrowest real runtime that crosses every affected boundary:

- Use a focused component or browser runtime only when the behavior is fully browser-owned.
- Use the isolated Desktop product runtime when behavior depends on host authorization, cross-runtime messaging, window or focus state, native resources, persistence, security policy, or lifecycle.
- Treat a supplemental preview as supporting evidence only. It cannot replace the owning runtime.

Record the selected boundary and why it is sufficient before execution. If the required runtime or fixture is unavailable, mark the affected checks blocked rather than substituting another successful path.

## Run Functional Validation

- Exercise the inventory through normal user-operable input.
- Verify visible results and state transitions, not only internal state or element presence.
- Complete the full state cycle for toggles, selections, dialogs, navigation, and other reversible controls.
- Verify applicable failure and recovery behavior without converting an error into an apparent success.
- Inspect runtime diagnostics produced during the flow and treat unexplained errors as failures.
- Re-run checks affected by any fix made during validation.

## Run Visual Validation

Inspect the same inventory separately for visual correctness. A functional pass does not prove appearance.

- Open every required current visual artifact and inspect its pixels directly. Confirm that the artifact depicts the intended state before judging it.
- Do not infer visual success from an artifact reference, filename, capture count, runtime status, structural facts, or prior evidence.
- Map each inspected artifact to one acceptance item and record concrete observations, defects, and uncertainty. Do not replace observations with an unsupported aesthetic score.
- Functional readiness does not prove visual settlement. Before capturing a stable state, wait for asynchronous data, media decode, layout, animation, and rendering presentation to settle.
- Judge blank-looking media against the expected source content and capture timing. An expected black intro frame is not a rendering failure; unresolved loading or source-timing ambiguity is blocked rather than assumed to pass or fail.
- For stable evidence of seekable video or a video timeline, derive the midpoint from its current finite duration, reach it through the normal user seek control, verify the presented time, and then settle and capture. Use another timestamp only when that exact temporal boundary is under test.

- Inspect the initial viewport and each state where the feature is meant to be perceived.
- Check fit, clipping, overlap, text containment, hierarchy, spacing, alignment, readability, contrast, layering, focus visibility, and feedback clarity.
- Check supported themes and a smaller supported window or viewport when the affected surface is responsive.
- Inspect the densest realistic state and relevant loading, empty, error, disabled, selected, open, and post-interaction states.
- Inspect motion or transitions while active when they are part of the behavior.
- Treat technically present but obscured, unstable, unreadable, or imperceptible UI as failed.
- Treat missing, stale, unexpectedly blank, corrupted, unreadable, incomplete, or state-mismatched visual evidence as blocked unless the visible defect already establishes failure.

Capture evidence for the state being judged. A screenshot proves only that captured state; it does not prove interaction, persistence, lifecycle, or the path used to reach it.

## Protect Adjacent Behavior

Identify the smallest existing workflow that shares the changed component, state owner, interaction pattern, or runtime boundary. Exercise it and record whether it remains functional and visually coherent. Prefer existing owning-package tests and product scenarios over copied validation paths.

## Decide The Result

Classify every required inventory item and the overall result as one of:

- `passed`: the authoritative functional, visual, and applicable adjacent evidence succeeded;
- `failed`: observed behavior or presentation violates an acceptance item;
- `blocked`: required evidence could not be produced through the authoritative runtime;
- `not-applicable`: the completed change has no user-visible impact, with the reason recorded.

Do not declare UI validation passed while any required item is failed, blocked, missing, or unexecuted. Preserve observed failures, missing evidence, and residual risk without replacing them with assumptions.

Keep this result advisory. A `failed`, `blocked`, missing, or unexecuted UI item remains visible in the UI report, but it does not change code-quality gate status or block implementation completion, commit, merge, or release. Keep graphical execution and visual judgment out of generic continuous-integration and code-gate workflows.

## Report

Use this compact structure:

- **Scope:** affected feature, UI surfaces, and applicability decision.
- **Runtime:** selected authoritative boundary and why it covers the change.
- **Inventory:** user actions, states, expected observations, and adjacent risks checked.
- **Evidence:** functional results, reviewed visual states, and artifact references.
- **Visual findings:** artifact-to-inventory mapping, inspected state, concrete observations, defects, and uncertainty.
- **Result:** passed, failed, blocked, or not-applicable.
- **Residual risk:** unexecuted states, environment limits, and uncertainty.
