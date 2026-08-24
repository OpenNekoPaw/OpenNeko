## Evaluation Scope

- Change/feature: real DSH-native personal and Workspace Skill creation.
- Decision and owning suite: `update` `skill.skill-creator`; `update` `agent-runtime.skill-runtime` only for post-create discovery if its existing assertions own that path.
- Why real Evaluation is required: the change alters Tool registration, approval, filesystem publication, DSH provider discovery and later model-visible Skill behavior.
- Canonical path: visible Composer → DSH turn → first-party CreateSkill Tool → approval → exact Conversation target → staged DSH provider validation → atomic Host publish → DSH scoped discovery.
- Forbidden fallback: Pi SkillHost, ordinary file writer, copied parser, model-selected target, active Workspace, Host registry injection or final-text-only success.

## Cases

- Update Workspace and Assistant positive cases to assert exact DSH source/provider, package fingerprint, published bytes and subsequent discovery.
- Retain invalid name, traversal, same-name and no-overwrite negatives; update them to assert DSH-native diagnostics.
- Add directory resource, flat layout and invocation-policy cases.
- DSH Q0 proves an ordinary open turn can call CreateSkill without loading `skill-creator` when the Tool is eligible and approved.
- Missing observability: creation evidence must include exact Conversation target identity, DSH validation outcome, atomic publication result and post-publish DSH source; if absent, add neutral facts rather than relying on answer text.

## Verification

- Run key-free schema/harness validation before provider-backed behavior.
- Run focused hidden Desktop cases with real provider/model and one visible approval-path case through actual Composer controls.
- Record the basic, reopen, Conversation isolation and project/personal source matrix; unaffected generation/Canvas cells remain documented.
- Missing public isolated-provider validation is `infrastructure-blocked`, not permission to use a copied parser.

## Residual Risk

- DSH rc.8 provider parsing is not exposed as a standalone function, so isolated provider mounting must be proven before implementation acceptance.
- A successfully created lower-priority personal Skill may be shadowed by another DSH source; result reporting must distinguish created identity from current winner.
