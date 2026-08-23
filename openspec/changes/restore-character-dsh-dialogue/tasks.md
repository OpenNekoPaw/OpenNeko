## 1. Contract and Producer

- [x] 1.1 Extend the canonical DSH creation target with exact Character Dialogue binding and strict parser tests.
- [x] 1.2 Make Agent Entry preserve detail handoff/selector state and submit the exact Character target; poison-test Assistant fallback.

## 2. Chara Composition

- [x] 2.1 Compose `CharacterConversationLaunchService` from existing Chara repositories and DSH Agent adapter in Desktop Main.
- [x] 2.2 Delegate Character-target creation and first turn to the Chara owner, attach only the returned exact Conversation, and fail locally on launch/turn errors.
- [x] 2.3 Delete the Renderer immediate-rejection path and add handoff-consumption/scene tests.

## 3. Verification

- [x] 3.1 Run focused Agent contracts/webview, Chara application, Desktop adapter/session-host and shell tests.
- [ ] 3.2 Update and key-free validate the launch-binding Agent Evaluation; run visible Development Electron Character dialogue acceptance when provider infrastructure is available.
- [ ] 3.3 Run affected typechecks, architecture/boundary/OpenSpec gates and `git diff --check`; record actual commands and residual risk.
- [ ] 3.4 Perform `neko-ui-validation` and L4 `neko-quality-review` with exact owner/no-fallback evidence.
