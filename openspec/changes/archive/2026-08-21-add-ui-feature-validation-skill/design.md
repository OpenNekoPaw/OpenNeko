## Context

OpenNeko already has three relevant but separate assets: `neko-quality-review` classifies repository risk, the Desktop functional runtime can exercise isolated production UI paths, and package tests cover deterministic component and contract behavior. None of them currently defines the reusable acceptance method that turns a UI feature change into a complete, reviewable set of functional and visual checks.

The new workflow is a repository developer Skill under `.codex/skills`, not a product Agent builtin Skill under `packages/skills`. It must therefore guide Codex development work without changing product Skill discovery, Agent prompt composition, Desktop runtime contracts, or CI ownership. The repository's prompt boundary also prohibits putting concrete tool tutorials, command schemas, polling protocols, or package-private contracts in Skill content.

Five-layer analysis:

- **Responsibility:** the Skill owns UI acceptance planning, coverage judgment, evidence interpretation, and signoff language. Owning packages continue to own tests and fixtures; the Desktop functional platform owns runtime execution.
- **Dependency:** the Skill is instruction-only and depends on repository evidence discovered at task time. It does not import production modules or introduce a runtime dependency.
- **Interface:** the trigger description selects applicable UI changes; the body defines one canonical workflow; the output is a compact validation report with explicit outcome classes.
- **Extension:** new UI domains extend their owning tests or functional scenarios. Stable cross-domain acceptance principles can be added to the Skill without adding tool-specific branches.
- **Testing:** deterministic repository tests validate metadata, required stages, output outcomes, and content boundaries. Actual feature work must produce runtime evidence proportional to the affected path.

## Goals / Non-Goals

**Goals:**

- Trigger focused UI validation after implementing or materially changing user-visible behavior.
- Derive coverage from requirements, changed controls and states, adjacent behavior, and intended delivery claims.
- Require both functional correctness and visual inspection through the authoritative runtime boundary.
- Prevent a build, unit test, browser-only preview, or isolated screenshot from being presented as complete Desktop acceptance.
- Keep failure and unavailable evidence visible in the final validation result.
- Compose with `neko-quality-review` without duplicating its repository-wide architecture review.

**Non-Goals:**

- Add a browser driver, screenshot service, image comparison engine, or Desktop automation protocol.
- Add GUI execution to CI or generic quality commands.
- Define package-private selectors, scenarios, commands, fixture data, or UI implementation details.
- Require graphical validation for changes with no user-visible UI impact; those changes must be classified as not applicable with a reason.
- Modify product Agent Skill discovery, capability routing, or runtime prompts.

## Decisions

### 1. Add one focused repository Skill

Create `.codex/skills/neko-ui-validation/` with `SKILL.md` and generated `agents/openai.yaml`, and add an exact `.gitignore` allowlist so the repository-scoped package is distributed with the checkout. Keep the Skill instruction-only because execution mechanisms and scenario implementations already have canonical owners.

Alternative considered: expand `neko-quality-review` with the full workflow. Rejected because it would make a broad review Skill carry a specialized, frequently invoked acceptance procedure and duplicate coverage concepts across review stages.

### 2. Trigger on user-visible behavior, not every code change

The metadata SHALL cover new UI features, changes to layout or interaction, UI bug fixes, and explicit UI/UX acceptance requests. The workflow SHALL first determine applicability. Non-UI changes produce a short not-applicable result rather than launching unrelated graphical checks.

Alternative considered: trigger after every new feature regardless of surface. Rejected because headless domain changes do not gain evidence from UI checks and this would make the Skill noisy and expensive.

### 3. Build one acceptance inventory before execution

The inventory is derived from four sources: requested behavior, actual affected UI and controls, states and transitions reachable from those controls, and claims intended for delivery. Every inventory item maps to a functional check, a visual state when appearance matters, an expected observation, and evidence.

This prevents ad hoc testing from covering only the happy path or only the most visible screenshot. The inventory is planning evidence, not a second test registry or persistent product fact.

### 4. Select the authoritative runtime by boundary

Validation SHALL use the narrowest runtime that still crosses every affected boundary. Browser or component evidence is sufficient only for browser-owned behavior. Desktop trust, preload, IPC, focus, CSP, native resource, window, persistence, or lifecycle behavior requires the isolated Desktop product runtime. Supplemental surfaces cannot substitute for the owning runtime.

The Skill states this as a boundary decision and success condition. Concrete launcher names, parameters, selectors, and operation sequences remain in runtime documentation and capability prompts.

### 5. Separate functional, visual, and regression judgments

Functional validation exercises real user controls and verifies visible outcomes and state transitions. Visual validation inspects each relevant state for fit, hierarchy, readability, theme, focus, density, motion, clipping, overlap, and error presentation. Regression validation checks the smallest adjacent existing workflow that shares the changed component, state, or runtime path.

A screenshot proves only the captured visual state. It does not prove interaction, lifecycle, persistence, or canonical-path correctness.

### 6. Use fail-visible outcome classes

Each acceptance item and the overall result is classified as `passed`, `failed`, `blocked`, or `not-applicable`. `blocked` and unexecuted required checks prevent a passing signoff. The report includes the runtime boundary, inventory coverage, evidence, observed failures, unexecuted items, and residual risk.

Alternative considered: allow partial evidence with a warning and still pass. Rejected because it would convert missing runtime evidence into hidden success.

### 7. Keep validation layers distinct

`neko-quality-review` delegates applicable UI acceptance to `neko-ui-validation` and consumes its result as advisory review evidence. The new Skill does not repeat architecture, package ownership, TypeScript, or general repository checks.

The root `AGENTS.md` provides the durable recommendation for implemented user-visible UI changes. It references the Skill as the single workflow owner and does not copy the detailed procedure or make its result a code gate.

This change affects a Codex repository-development Skill only. It does not change Neko Agent prompt composition, Skill Host discovery, or product behavior, so real Neko Agent Evaluation is excluded. Deterministic Skill validation and trigger/content contract tests are the authoritative evidence for this change.

### 8. Promote the trigger into repository development standards

The Chinese and English contribution guides SHALL tell feature developers when the focused Skill is recommended and what evidence categories its own report must cover. The stable quality-gates ADR SHALL record the same advisory policy, authoritative-runtime boundary, and fail-visible outcome rule. These documents reference `.codex/skills/neko-ui-validation/SKILL.md` as the single procedure owner instead of restating its detailed inventory or execution method.

Alternative considered: keep the recommendation only in `AGENTS.md`. Rejected because contributor entry documentation and the accepted quality policy would then omit the advisory workflow, making it easier to miss and allowing the standards to drift.

## Risks / Trade-offs

- **Risk: broad implicit triggering creates validation noise.** -> Require an explicit applicability decision and exclude non-UI work with a reason.
- **Risk: implicit Skill selection is skipped during a later implementation.** -> Make the recommendation explicit in `AGENTS.md` while keeping the procedure canonical in the Skill.
- **Risk: generic wording produces shallow screenshot-only checks.** -> Require the acceptance inventory, normal user input, state transitions, a separate visual pass, and adjacent regression coverage.
- **Risk: the Skill duplicates runtime protocols.** -> Add a deterministic content-boundary test that rejects concrete tool names, command blocks, runtime parameters, and package-private schema terms.
- **Risk: visual judgment varies between agents.** -> Anchor judgment to observable failure classes and requested behavior; preserve screenshots and explicit uncertainty instead of inventing a score.
- **Risk: exhaustive matrices slow every change.** -> Scale coverage to affected boundaries and risk while requiring every claimed user-visible behavior to have evidence.
- **Risk: project Skill changes are mistaken for product Agent behavior changes.** -> Keep the Skill under `.codex/skills`, exclude it from product Agent Evaluation, and test that no product runtime or builtin catalog path changes.
- **Risk: policy wording drifts across development documents.** -> Add deterministic assertions that both contribution guides and the accepted quality ADR reference the canonical Skill and preserve fail-visible acceptance semantics.
