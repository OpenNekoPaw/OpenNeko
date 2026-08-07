## 1. Agent Visual Review Workflow

- [x] 1.1 Extend `.codex/skills/neko-ui-validation/SKILL.md` and its UI metadata so every required visual artifact is directly inspected by an image-capable Agent and mapped to concrete findings, uncertainty, and a fail-visible result.
- [x] 1.2 Update `AGENTS.md`, the Chinese and English contribution guides, and the quality-gates ADR to require actual visual-artifact review without duplicating the Skill workflow or making desktop-control capabilities policy owners.
- [x] 1.3 Extend deterministic Skill tests for direct pixel inspection, artifact traceability, uncertainty handling, tool-protocol isolation, and the single-workflow ownership decision.

## 2. Focused Visual Coverage

- [x] 2.1 Add app-owned compact/restored Sidebar and Settings screenshot states to `desktop-workbench-scenes` and return every new artifact in scenario evidence.
- [x] 2.2 Add Cut-owned ready, playback/seek, and post-authoring screenshot states without replacing trusted interaction, media, persistence, or export assertions.
- [x] 2.3 Add Preview-owned image, audio, video, PDF, GLB, and glTF ready-state screenshots before each viewer closes and return the complete matrix evidence.
- [x] 2.4 Add deterministic scenario coverage assertions that fail when required Sidebar, Settings, Cut, or Preview capture states are removed or stop contributing to evidence.

## 3. Validation And Evidence

- [x] 3.1 Run the Skill creator validator, focused orchestration tests, the full test-orchestration gate, strict OpenSpec validation, formatting checks, and `git diff --check`.
- [x] 3.2 Run focused Cut, Preview, and Desktop Workbench Electron scenarios through the authoritative development runtime; preserve failed or blocked results and current artifact references.
- [x] 3.3 Directly inspect every newly captured screenshot with an image-capable Agent, record per-state findings and the overall UI result, and use supplemental desktop interaction only for uncaptured transient states.
- [x] 3.4 Record the product Neko Agent Evaluation disposition, scoped quality review, unexecuted runtime scope, and residual risk in `verification.md`.

## 4. Visual Settlement Follow-up

- [x] 4.1 Update the UI validation Skill and OpenSpec requirements so functional readiness, visual settlement, expected black media content, and unresolved loading ambiguity are distinguished explicitly.
- [x] 4.2 Add bounded visual-settlement waits before the focused Sidebar, Settings, Cut, and Preview captures without changing their functional assertions or package ownership.
- [x] 4.3 Extend deterministic coverage tests to reject immediate capture after readiness, then rerun focused tests, authoritative Electron scenarios, and direct Agent image inspection.
- [x] 4.4 Replace the prior visual findings with findings from the settled artifacts and preserve any defects that remain visible.

## 5. Representative Video Frame Follow-up

- [x] 5.1 Update the UI validation Skill and OpenSpec requirements so stable seekable video evidence uses a duration-derived midpoint unless a specific temporal boundary is under test.
- [x] 5.2 Update the Cut and Preview package-owned Desktop scenarios to reach and verify midpoint frames through their user-operable seek controls before settled capture, and add deterministic regression coverage.
- [x] 5.3 Run focused deterministic and Electron scenarios, directly inspect the current midpoint artifacts, and replace affected findings in `verification.md` without hiding unrelated defects.

## 6. Advisory UI Validation Boundary

- [x] 6.1 Update the UI validation and quality-review Skills, repository development standards, and ADR so UI results remain accurate but non-blocking reference evidence.
- [x] 6.2 Move the UI Skill and screenshot-coverage contract out of generic test orchestration, add an explicit local entry, and keep a generic negative check proving all local UI entries remain unreachable from gates and workflows.
- [x] 6.3 Run the local UI contract, generic orchestration checks, Skill validation, strict OpenSpec validation, formatting, and diff checks; update verification with the advisory result and remaining risk.
