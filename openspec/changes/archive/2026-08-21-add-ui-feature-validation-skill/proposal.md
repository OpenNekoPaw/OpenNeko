## Why

OpenNeko has a repository quality gate and a local Desktop functional runtime, but it does not have a focused reusable workflow that requires every new or changed user-visible UI feature to prove its complete affected function set, visual states, and regression boundary before signoff. A project Skill is needed so UI acceptance is derived consistently from the requested behavior and real product path instead of being reduced to a build, a single screenshot, or an ad hoc happy-path check.

## What Changes

- Add a repository-scoped `neko-ui-validation` Skill for post-implementation validation of new or changed user-visible UI behavior.
- Require an acceptance inventory that maps requirements, affected controls, state transitions, failure states, adjacent regressions, and delivery claims to observable checks.
- Require functional and visual passes through the real owning runtime, with Desktop-only behavior validated in the isolated Desktop product path.
- Define fail-visible signoff and a compact evidence report that distinguishes passed, failed, blocked, and not-applicable checks.
- Add deterministic tests for Skill discovery metadata, required workflow stages, and the prohibition on embedding tool protocols or package-private schemas in Skill content.
- Integrate the focused Skill with `neko-quality-review` without duplicating the broader repository review workflow.
- Update the Chinese and English contribution guides and the stable quality-gates ADR so the advisory UI validation policy is part of the repository development standards without duplicating the Skill workflow.

## Capabilities

### New Capabilities

- `ui-feature-validation-workflow`: Defines when UI validation is required, how the affected function set is derived and exercised, and what evidence is required before a UI change can be accepted.

### Modified Capabilities

None.

## Impact

- Adds tracked repository developer guidance under `.codex/skills/neko-ui-validation/`, a narrow `.gitignore` allowlist for that package, and deterministic orchestration tests under `scripts/test-orchestration/`.
- Updates `AGENTS.md` to require the focused Skill after implemented user-visible UI changes and to make failed, blocked, missing, or unexecuted evidence non-passing.
- Updates `CONTRIBUTING_CN.md`, `CONTRIBUTING.md`, and `docs/architecture/adr-code-review-quality-gates.md` so contributor-facing and stable quality policy point to the same advisory workflow owner.
- Updates `.codex/skills/neko-quality-review/` only to delegate focused UI acceptance to the new Skill when applicable.
- Does not change `apps/*` or `packages/*` production ownership, product Agent builtin Skills, runtime contracts, persistent user data, CI composition, or the Desktop functional runner.
- Uses the existing isolated Desktop functional path as runtime evidence when the affected behavior crosses Desktop trust, IPC, focus, CSP, native resource, or lifecycle boundaries; browser-only evidence remains supplemental for those cases.
