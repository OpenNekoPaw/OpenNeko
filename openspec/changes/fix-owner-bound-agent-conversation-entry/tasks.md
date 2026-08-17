# Tasks

- [x] Add producer and poison tests for Entry-only `submitDraft` reachability.
- [x] Restore owner-bound Conversation creation under Agent runtime ownership.
- [x] Route Workspace first-send inputs through the canonical Conversation message contract.
- [x] Update Desktop Scene wiring to project the exact created Conversation without Draft fallback.
- [x] Run focused contract, runtime, renderer, Desktop, typecheck, UI, and Agent Evaluation checks; record residual risk.

## Verification

- Focused Agent runtime, Webview, Desktop Main/renderer contract, and Host Scene tests passed.
- Agent runtime and Desktop TypeScript checks passed.
- Agent and application boundary checks passed.
- Key-free Agent Evaluation harness and all-suite dry-run passed; this is not real provider behavior acceptance.
- Visible Desktop + real provider validation is blocked because this run has no explicit provider/model cost authorization.
