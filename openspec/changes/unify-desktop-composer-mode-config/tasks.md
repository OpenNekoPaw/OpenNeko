## 1. Presentation contracts

- [x] 1.1 Add tests for active-mode model summaries and explicit unconfigured media selections.
- [x] 1.2 Add component tests proving Agent, image, video, and audio modes open the same model panel on the matching default tab.
- [x] 1.3 Add tests proving model and parameter entries open one shared panel at the matching primary and secondary navigation state.

## 2. Unified model configuration

- [x] 2.1 Refactor the Agent-only model menu into a mode-independent shared composer configuration component.
- [x] 2.2 Replace Agent-only and independent model/parameter menu state with canonical config category/section state in the tab-scoped composer realm.
- [x] 2.3 Make the trigger summary and initial panel category follow the active session mode while preserving exact purpose callbacks.

## 3. Direct media modes

- [x] 3.1 Remove the standalone media-model dropdown path from `ModeConfigBar`.
- [x] 3.2 Render mode, model, and parameter shortcuts in the composer toolbar; remove the dedicated top parameter rail and independent parameter overlay.
- [x] 3.3 Implement content-category primary navigation plus model/parameter secondary navigation, localized summaries, disabled states, and overlay accessibility.

## 4. Validation

- [x] 4.1 Run focused InputArea, model configuration, parameter popup, composer realm, and presenter tests.
- [x] 4.2 Run Agent Webview typecheck/build and `git diff --check`.
- [x] 4.3 Run the Neko repository quality review and record unrelated blockers.
- [x] 4.4 Package and validate Agent, image, video, and audio model configuration in Desktop.

## 5. Exact parameters and perception model clarity

- [x] 5.1 Remove the Agent parameter trigger/page and Webview semantic LLM preset defaults/send projection.
- [x] 5.2 Keep parameter triggers/pages only for direct image, video, and audio generation specifications.
- [x] 5.3 Rename media understanding sections to perception model sections and preserve exact `*.understand` callbacks.
- [x] 5.4 Add producer, consumer, filtering, callback, and no-preset regression tests.
- [x] 5.5 Run focused/full tests, typecheck/build, Agent evaluation exclusion validation, strict OpenSpec, and packaged Desktop verification.
