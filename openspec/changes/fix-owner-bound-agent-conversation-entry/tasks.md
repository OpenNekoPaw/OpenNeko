# Tasks

- [x] Add canonical Entry Draft / owner-bound Composer / Conversation Session contracts and poison tests.
- [x] Update Desktop Scene producers so bound scopes without Conversation project `composer`, never `draft`.
- [x] Expose owner-scoped Composer model and `$`/`/` input catalogs without creating an empty Conversation.
- [x] Route Workspace first-send inputs through the canonical Conversation message contract and preserve files/context.
- [x] Extend exact-owner tests for Workspace, Assistant, Character, Room, and World composer boundaries.
- [x] Run focused contract, runtime, renderer, Desktop, typecheck, UI, and Agent Evaluation checks; record residual risk.
- [x] Make owner-bound Conversation creation and first input acceptance atomic before Session publication.
- [x] Add ordering tests for ordinary, `$` Skill, and `/` Command first inputs and rerun validation.

## Verification

- Focused Agent runtime, Webview, Desktop Main/renderer contract, and Host Scene tests passed.
- Agent runtime and Desktop TypeScript checks passed.
- Agent and application boundary checks passed.
- Key-free Agent Evaluation harness and all-suite dry-run passed; this is not real provider behavior acceptance.
- Focused ordering tests prove ordinary, `$` Skill, and `/` Command first inputs use the same reserve, lifecycle first-submit, Session publication, and provider-submit sequence.
- Ordinary Session submission without a lifecycle record fails visibly and cannot invoke first-submit preparation.
- Visible Desktop + real provider validation is blocked because this run has no explicit provider/model cost authorization.
