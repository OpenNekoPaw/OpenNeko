## Evaluation Scope

- Change/feature: DSH Skill source/scope parity, independent invocation policies, multi-Skill explicit and model loading, resource guidance and management/runtime consistency.
- Decision and owning suite: `update` `agent-runtime.skill-runtime`; `update` the Extension management deterministic fixtures; `create` no new runtime suite because the existing Skill runtime suite owns injection and source behavior.
- Why real Evaluation is required: selection, multiple Skill injection and resource use can change model-visible prompt composition and final behavior.
- Canonical path: visible Composer or natural-language request → exact Conversation/Workspace binding → DSH scoped registry → DSH explicit injection or model `skill` loader → terminal turn.
- Forbidden fallback: unscoped snapshot, bundled mirror, active/recent Workspace, OpenNeko Skill loader, ordinary-prompt fallback, single-primary selection.

## Cases

- Update the canonical explicit case to prove two user-invocable Skills are injected from one input.
- Add a project-over-bundled case and an adjacent same-name personal/bundled case with full Host identity and package fingerprint.
- Add one model-selected case that loads two applicable Skills without approval and one negative case proving a user-only Skill is absent from the model catalog.
- Add one user-only explicit case and one model-only explicit rejection.
- Add one relative-resource positive case and traversal/missing-resource fail-local case.
- Add deterministic management-vs-session snapshot equality and incomplete-catalog projection tests.
- Missing observability: if current runtime facts cannot distinguish every injected Skill source/fingerprint or requested relative resource, add only a neutral bounded fact to the existing Desktop Evaluation projection; do not infer from final text.

## Verification

- Key-free validation: update strict suite/case artifacts, then run the repository Agent Evaluation harness and all-suite dry-run.
- Real cases: run the focused `agent-runtime.skill-runtime` cases through the complete Desktop owner with an explicit provider/model and one protected visible Composer case.
- Foundational matrix: basic turn and multiple Conversation isolation are affected; compaction, persistence, generation artifacts and unrelated domain Jobs are recorded as unaffected unless lookup cwd changes their Session recovery path.
- Blocked cases must report the exact missing Desktop driver operation, credentials, model authorization or resource evidence; mock output and direct turn injection are not acceptance.

## Residual Risk

- Upstream DSH rc.8 is developer preview and future rank/catalog behavior may change.
- Multiple long Skill bodies may increase token use; this is measured and reported but is not converted into a fixed runtime cap.
