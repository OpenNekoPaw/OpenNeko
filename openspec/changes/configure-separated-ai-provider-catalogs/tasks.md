## 1. Canonical Contract

- [x] 1.1 Add renderer-safe dialogue/generation Provider presets and model templates.
- [x] 1.2 Extend the strict Settings contract with exact Provider type, optional dialogue protocol and optional
      model template identity.
- [x] 1.3 Add contract tests for native MiniMax/ByteDance requests, secret exclusion and cross-family rejection.

## 2. Host Settings

- [x] 2.1 Project native generation Providers instead of filtering them through DSH protocols.
- [x] 2.2 Save exact preset/type metadata, make Provider type immutable and validate family/type/protocol.
- [x] 2.3 Apply template-owned model capabilities and fail visibly for unsupported MiniMax models.
- [x] 2.4 Reload application and all cached Workspace ConfigManager instances after Settings mutations.

## 3. Desktop Settings UI

- [x] 3.1 Make each add action choose only presets belonging to its dialogue/generation directory.
- [x] 3.2 Prefill Provider name, official URL, type/protocol and credential requirements from the selected preset.
- [x] 3.3 Offer matching built-in model templates while retaining an explicit supported custom-model path.
- [x] 3.4 Update localized copy and focused Renderer tests for both directories and preset/model states.

## 4. Verification

- [x] 4.1 Run focused Host contract/service/ConfigManager authority tests and Desktop Settings tests.
- [x] 4.2 Run typecheck, OpenSpec validation, legacy/unused audits and relevant local quality gates.
- [x] 4.3 Update/reuse the mapped Agent Evaluation suites, run key-free validation, and record real-provider
      blockers without treating dry-run evidence as behavior acceptance.
- [x] 4.4 Validate the visible Desktop Settings flow and inspect dialogue/generation preset/model states directly.
- [x] 4.5 Record quality review, UI validation evidence, verification commands and residual risks.
