# Tasks

- [x] Add canonical Entry Draft / owner-bound Composer / Conversation Session contracts and poison tests.
- [x] Update Desktop Scene producers so bound scopes without Conversation project `composer`, never `draft`.
- [x] Expose owner-scoped Composer model and `$`/`/` input catalogs without creating an empty Conversation.
- [x] Route Workspace first-send inputs through the canonical Conversation message contract and preserve files/context.
- [x] Extend exact-owner tests for Workspace, Assistant, Character, Room, and World composer boundaries.
- [x] Run focused contract, runtime, renderer, Desktop, typecheck, UI, and Agent Evaluation checks; record residual risk.
- [x] Make owner-bound Conversation creation and first input acceptance atomic before Session publication.
- [x] Add ordering tests for ordinary, `$` Skill, and `/` Command first inputs and rerun validation.
- [x] Bind an owner-bound Composer to the configured or first available chat model before first send.
- [x] Carry the Composer's exact model receipt into the initial Conversation configuration transaction.
- [x] Add regression coverage for visible default model, selected-model first send, processing state, and terminal response.
- [x] Verify Workspace new-conversation first turn through visible Electron UI with a real provider.

## Verification

- Focused Agent runtime, Webview, Desktop Main/renderer contract, and Host Scene tests passed.
- Agent runtime and Desktop TypeScript checks passed.
- Agent and application boundary checks passed.
- Key-free Agent Evaluation harness and all-suite dry-run passed; this is not real provider behavior acceptance.
- Focused ordering tests prove ordinary, `$` Skill, and `/` Command first inputs use the same reserve, lifecycle first-submit, Session publication, and provider-submit sequence.
- Ordinary Session submission without a lifecycle record fails visibly and cannot invoke first-submit preparation.
- Visible Desktop + real provider validation passed through the Workspace-owned new-conversation control: the Composer displayed `DeepSeek V4 Flash`, the first message created one Conversation, and the same turn returned `UI-OK` without resubmission.
- The terminal processing receipt was projected on the assistant output as `已处理 0秒`; the provider completed before a distinct in-progress frame could be captured.
