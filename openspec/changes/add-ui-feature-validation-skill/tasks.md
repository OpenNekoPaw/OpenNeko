## 1. Skill Package

- [x] 1.1 Initialize `.codex/skills/neko-ui-validation` with the canonical Skill creator and generated UI metadata.
- [x] 1.2 Implement the applicability decision, acceptance inventory, authoritative-runtime selection, functional/visual/regression passes, and fail-visible report contract in `SKILL.md`.
- [x] 1.3 Update `neko-quality-review` to delegate applicable user-visible UI acceptance to the focused Skill without duplicating its workflow.
- [x] 1.4 Recommend the focused Skill for implemented user-visible UI changes in `AGENTS.md` without duplicating the detailed workflow or making it a code gate.
- [x] 1.5 Add an exact `.gitignore` allowlist so the repository-scoped Skill package is tracked.
- [x] 1.6 Update the Chinese and English contribution guides and the accepted quality-gates ADR to make the focused UI validation workflow part of the repository development standards.

## 2. Deterministic Contracts

- [x] 2.1 Add repository tests that verify Skill metadata, positive and negative trigger language, required workflow stages, outcome classes, and quality-review delegation.
- [x] 2.2 Add content-boundary assertions that reject concrete tool tutorials, command blocks, runtime parameters, package-private schemas, and internal version metadata from the Skill package.
- [x] 2.3 Add deterministic assertions that the contribution guides and quality-gates ADR reference the canonical Skill and preserve authoritative-runtime and fail-visible completion rules.

## 3. Validation And Evidence

- [x] 3.1 Run the Skill creator validator, the focused Node test, `pnpm check:test-orchestration`, `openspec validate add-ui-feature-validation-skill --strict`, and `git diff --check`.
- [x] 3.2 Record the Neko Agent Evaluation disposition, deterministic evidence, unexecuted real-runtime scope, and residual risk in the change.
- [x] 3.3 Run the `neko-quality-review` self-review over the scoped diff and record any remaining follow-up without claiming unrelated dirty-worktree changes.
- [x] 3.4 Re-run the focused test, test-orchestration gate, strict OpenSpec validation, and whitespace validation after synchronizing the development standards, then update the recorded evidence.
