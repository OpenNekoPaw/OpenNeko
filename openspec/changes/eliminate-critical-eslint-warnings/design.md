## Context

The repository currently emits 30 `react-hooks/rules-of-hooks` warnings from five files and 14 production `@typescript-eslint/no-explicit-any` warnings from five files. The Hook violations come from three structural causes: an early return before later Hooks, registry entries represented as render-call functions even though they own Hook state, and a test harness choosing between two Hook calls conditionally. The explicit `any` sites bypass contracts that already exist in Canvas operations, Cut project/keyframe types, shared Engine probe results, and generic object helpers.

Responsibility analysis: each owning Webview component remains responsible for its render state and Hook lifecycle; the Preview renderer registry only selects React component identities; Cut message handling projects an already typed project contract; Canvas operation history owns typed before/after snapshots; Tools consumes the Engine client's shared probe contract.

Dependency analysis: changes remain inside existing L2 Webviews, Extension host services, and L0/shared types. No Webview gains Node or VS Code imports, no Extension gains React, and no feature package imports another feature package's internals.

Interface analysis: the Preview registry stores `React.ComponentType<PreviewRendererProps>` rather than an arbitrary callable returning `ReactNode`. Existing `ProjectData`, `TimelineTrack`, `EffectParameterKeyframe`, `ProbeResult`, `Partial<CanvasNode>`, and `Record<string, unknown>` contracts replace `any` without introducing parallel DTOs.

Extension analysis: future preview roles must register a React component, which makes Hook ownership explicit. Future message and operation changes must extend the owning contract instead of escaping through `any`.

Testing analysis: focused component tests prove role switching, hidden/unsupported branches, and renderer behavior; store/message/service tests prove typed paths; ESLint proves the exact rules have zero violations; Extension Development Host smoke checks the affected Canvas/Cut/Tools Webview surfaces.

## Goals / Non-Goals

**Goals:**

- Eliminate all current `react-hooks/rules-of-hooks` warnings without suppressions.
- Eliminate all current production `@typescript-eslint/no-explicit-any` warnings by reusing canonical contracts.
- Preserve existing Canvas preview/content, Cut shape/project/keyframe, Tools media probe, and shared hook-test behavior.
- Promote both rules to blocking severity once their violation counts are zero.
- Add path-level tests that exercise renderer selection and conditional branches after the refactor.

**Non-Goals:**

- Do not clean `react-hooks/exhaustive-deps`, security, unused-variable, console, or non-null-assertion warnings in this change.
- Do not change project file formats, Webview message schemas, Engine wire contracts, or public user behavior.
- Do not add compatibility render paths, lint disable comments, default-success fallbacks, or package-local duplicate DTOs.

## Decisions

### 1. Hook-owning registry entries are React component types

`PreviewRenderer` becomes a React component type and `PreviewSurface` continues to instantiate the selected entry through JSX. Hook-owning renderer implementations use component naming and are never called as ordinary functions.

Keeping the existing callable type was rejected because it permits direct invocation and makes Hook lifecycle depend on whichever registry role happens to be selected by the parent render.

### 2. Conditional applicability is separated from Hook ownership

Components that can reject their input before rendering use a small outer selector and an inner Hook-owning component, or compute a single unconditional Hook input where no extra component boundary is needed. No Hook is moved into a conditional branch and no lint suppression is added.

Moving early returns below expensive or semantically invalid Hook work was rejected where it would initialize media or editor state for an unsupported input.

### 3. Existing contracts replace explicit `any`

Canvas uses typed partial node snapshots, Cut iterates typed project tracks/elements and uses the keyframe value contract, generic helpers accept `Record<string, unknown>`, and Tools returns the Engine client's `ProbeResult`. Real untrusted message boundaries use narrowing before typed projection.

Adding new local DTOs or broad type assertions was rejected because the owning contracts already exist and are the canonical source of truth.

### 4. Critical rules become errors only after zero-warning validation

Production `no-explicit-any` and `rules-of-hooks` are promoted from warning to error in the shared ESLint configuration. The existing test-only explicit-`any` override remains scoped to tests; Hook ordering remains enforced in tests.

Promoting every remaining warning in the same change was rejected because the other warning classes require separate behavioral and security audits.

## Risks / Trade-offs

- [Renderer identity changes can reset local state] → Keep stable module-level component identities in the registry and add role-switching tests.
- [Hook fixes can alter invisible or unsupported branches] → Preserve outer guards and test both accepted and rejected inputs.
- [Replacing `any` exposes incomplete contracts] → Update the owning existing contract only when required; fail compilation rather than add a fallback DTO.
- [Lint severity can block unrelated touched files] → Promote only rules proven at zero violations across the repository.
- [Webview unit tests cannot prove VS Code lifecycle behavior] → Run focused Extension Development Host validation through the repository debugger workflow.

## Migration Plan

1. Refactor Hook ownership and add focused regression tests.
2. Replace production explicit `any` with canonical types and run affected package typechecks/tests.
3. Verify both rule counts are zero, then promote their ESLint severity to error.
4. Run repository quality gates and local Extension Development Host smoke.
5. Roll back the single change if runtime smoke finds behavior drift; no data migration or compatibility path is required.

## Open Questions

None. Exhaustive dependency and remaining warning classes are intentionally deferred to later changes.
