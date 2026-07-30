## 1. Composer contract tests

- [x] 1.1 Add failing InputArea tests for the compact Agent toolbar, unified model trigger, direct-media parameter preservation, and busy-state locking.
- [x] 1.2 Add failing model-menu tests for exact chat, understanding, generation, automatic, and no-model selections without multi-select semantics.
- [x] 1.3 Add failing EmptyState and ConversationController tests for bounded catalog-derived Desktop Skill suggestions and explicit unsent invocation.
- [x] 1.4 Extend execution-mode tests to require three explanatory choices and no full-access option.

## 2. Compact Agent composer

- [x] 2.1 Add the unified Agent model configuration menu using existing model, media, parameter, and composer-realm state.
- [x] 2.2 Move Agent-mode controls into the composer toolbar and retain the existing parameter rail only for direct media modes.
- [x] 2.3 Remove superseded Agent-only selector composition while preserving direct media components and exact send projections.

## 3. Empty state and permission presentation

- [x] 3.1 Project up to four enabled Skills into the Desktop empty state and prefill an explicit Skill invocation without sending.
- [x] 3.2 Refine execution-mode labels, descriptions, selected presentation, and accessible menu structure.
- [x] 3.3 Add responsive styles and Chinese/English localization for the compact toolbar, model categories, purpose sections, and Skill suggestions.

## 4. Verification

- [x] 4.1 Run focused Agent Webview React tests and typecheck/build.
- [x] 4.2 Run affected Desktop tests/typecheck and `git diff --check`.
- [x] 4.3 Validate the real Electron Desktop Agent empty state and compact toolbar, plus the model-purpose, direct-media, and execution menus in the shared narrow VS Code Webview, without changing runtime configuration.
- [x] 4.4 Run the Neko quality review, record validation evidence and residual risks, and confirm no provider/model/evaluation behavior changed.
