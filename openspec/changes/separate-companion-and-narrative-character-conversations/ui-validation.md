## UI Validation Evidence

### Acceptance inventory

| Surface                           | Required result                                                                                                                                                                                            | Current evidence                                                                                                                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Character authoring               | Storyline select/edit/publish/compare/restore/delete; no runtime progress                                                                                                                                  | Webview tests pass                                                                                                                                                                                   |
| Companion memory review           | Stable continuity candidates and entries with explicit accept/reject/delete                                                                                                                                | Webview tests pass                                                                                                                                                                                   |
| Main Presentation                 | Exact owner-qualified surface kind/provider ref; duplicate/unknown/mismatched providers fail locally without fallback                                                                                      | Host registry and Desktop focused tests pass                                                                                                                                                         |
| Narrative context                 | Frozen CharacterVersion and consumer-visible node background only                                                                                                                                          | Renderer projection implemented; Desktop focused tests pass                                                                                                                                          |
| Storyline Timeline                | Read-only authored node order in bottom Workbench, with a distinct identity from RoomEvent timeline                                                                                                        | Webview Timeline and Host Scene tests pass                                                                                                                                                           |
| Room participant manager          | Exact participant, controller, CharacterVersion, node, AgentSession, participant-specific provider/model/TTS/capabilities and eligibility; commands affect one owner only                                  | Read-only Renderer projection exists; Agent-backed configuration commands remain open                                                                                                                |
| Companion Agent composition       | One Character composer, exact CharacterVersion/effective Agent configuration, role-manager provider/model/capability controls, standard reference/Skill/Tool/Approval projections and no native-model lane | Single Character initial turn now uses the canonical Agent lifecycle and Agent-owned configuration; role-manager commands and complete Workbench composition remain open                             |
| Narrative Agent composition       | Exact participant provider/model controls with Skill/Tool activation absent or disabled and an effective empty capability receipt                                                                          | Agent lifecycle freezes the empty capability constraint, rejects references before Character runtime materialization and omits Skill/Tool runtime exposure; visible participant controls remain open |
| Character management presentation | Character presentation contains only TTS and representation controls; no stale Chara-owned provider/model summary remains                                                                                  | Stale chat-provider/model summary removed from Desktop Character management; focused source/test evidence only, no authoritative screenshot                                                          |
| Workspace Chara capability        | Workspace Agent can invoke exact character use/preview/validation without rebinding; validation responder is tool-free and suggestions require confirmation                                                | Only testing primitives exist; production ports, Agent catalog and visible Workspace composition remain open                                                                                         |

### Automated UI evidence

- `pnpm --filter @neko/chara-webview typecheck`
- `pnpm --filter @neko/chara-webview test -- --run` — 4 files, 14 tests passed.
- Focused Desktop Character renderer/runtime tests — 2 files, 54 tests passed.
- `pnpm --filter @neko/host test` — 38 files, 312 tests passed.

### Visible runtime disposition

A visible real-Electron validation was not claimed. The production Character promotion gate remains
active, the one-lane Character UI and canonical Agent-path migration are incomplete, and the shared
dirty worktree currently has unrelated Automation/Canvas type failures. Per fail-visible policy,
screenshots from a test-only bypass or a non-authoritative hidden route are not accepted as UI
evidence. The management presentation removal is therefore functionally covered but visually
blocked: no current authoritative screenshot proves spacing, empty-state balance or narrow-window
layout after the summary was removed.

Overall result remains **blocked** for visible-product acceptance. Automated evidence establishes
contract and functional behavior for the isolated Character surfaces, but it does not establish
pixel-level narrow-window layout, participant-exact configuration commands or Workspace Chara
capability composition.

## 2026-08-25 Character Dialogue presentation repair

### Targeted acceptance evidence

| Surface                          | Acceptance                                                                                                   | Evidence                                                                                                                  | Result            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Character Dialogue mode trigger  | Selected Character exposes a localized mode trigger                                                          | Visible Electron accessibility projection reported `对话模式: 日常`                                                       | Pass              |
| Mode menu                        | Header, two choices and descriptions are complete; no raw i18n key is visible                                | Visible Electron menu exposed `对话模式`, `日常`, `叙事` and both Chinese descriptions; `chat.entryExperience` was absent | Pass              |
| Mode selection                   | Exactly one canonical mode is selected and selection emits `companion` or `narrative`                        | Agent Webview component coverage in both locales                                                                          | Pass              |
| New Character Conversation title | Published title and navigation group use the Global Character display name without changing routing identity | Chara launch, Desktop adapter and Desktop application tests                                                               | Pass (functional) |
| Existing persisted title         | Historical records are not silently rewritten                                                                | Existing visible Conversation retained its old identity-derived title                                                     | Expected residual |

The dedicated visible Electron scenario could not start because an existing OpenNeko development
process already owned the Vite bundle. The existing visible Electron window was inspected instead
without terminating the user process and provided direct functional evidence for the localized mode
control. A fresh new-Conversation pixel capture remains blocked, so the overall proposal-level UI
status above remains unchanged even though this targeted selector repair passed its visible check.

## 2026-08-25 Participant manager read-model slice

### Acceptance evidence

| Surface                      | Acceptance                                                                                                                 | Evidence                                                                                                                     | Result  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------- |
| Dialogue participant details | One expanded role card; no duplicate catalog row or Room search                                                            | Visible real Electron accessibility tree and screenshot                                                                      | Pass    |
| Exact role facts             | Localized version, mode, controller, AgentSession binding, TTS, representation and scheduling state; no raw identity label | Visible Electron showed `v1`, `日常`, `角色 Agent`, `已绑定`, `未配置`, `可参与响应`; focused tests reject missing authority | Pass    |
| Room manager function        | Every agent/human/system participant is selectable and searchable without mutating the snapshot                            | `@neko/chara-webview` interaction tests                                                                                      | Pass    |
| Room dense/narrow pixels     | List, selection and details remain legible in an authoritative visible Room                                                | No current real Room fixture was available in the existing Desktop process                                                   | Blocked |

The Dialogue check used the authoritative running Electron application after HMR and did not create
a test-only route or terminate the user's process. The role name appears once in the right dock,
the details remain readable at the current narrow width, and neither CharacterRun nor AgentSession
identity is visible. Overall status for this targeted slice is **functionally passed, visually
partial**: Dialogue passes visible validation; Room pixel acceptance remains explicitly blocked.

### Conversation context placement repair

The initial composition incorrectly allocated the participant manager a full flexible row and put
Companion continuity in a separate bottom row. This forced `对话上下文` to the bottom edge of the
right Dock, far away from the selected participant facts.

The right manager now uses one vertical scrolling content flow. The participant surface is
content-sized, and continuity follows it immediately without a separate height cap or nested scroll
region. A visible real-Electron capture after HMR confirms `对话上下文 / 长期记忆` starts directly
after `参与状态`, with remaining empty space below. Result: **passed** for the reported Dialogue
placement defect and adjacent composer layout.

## 2026-08-25 Participant message identity slice

### Acceptance evidence

| Surface                     | Acceptance                                                                                                                   | Evidence                                                                                                                                                                               | Result            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Dialogue assistant identity | Assistant messages use the exact Character participant presentation while user messages remain local-user presentation       | Authoritative running Electron accessibility tree exposed `选择 助手验证角色0815四` on the assistant message; Agent Webview test proves the transcript event remains `role: assistant` | Pass              |
| Hover and keyboard profile  | Hover/focus shows bounded name, controller, version, mode, participation and portrait availability without raw identity/path | Visible Electron focus capture showed the card beside the message avatar with `v1`, `日常`, `可参与响应`, `未配置`; no CharacterRun, AgentSession or resource ref was present          | Pass              |
| Portrait-unconfigured state | Missing selected portrait stays local and explicit                                                                           | Visible Electron showed a neutral initial avatar and `头像 未配置`; conversation, composer and right manager remained usable                                                           | Pass              |
| Authorized portrait image   | Exact selected portrait renders from a short-lived `openneko://resource/…` URL and no raw path/ref enters DOM                | Main runtime/contract tests and Desktop renderer integration test                                                                                                                      | Pass (functional) |
| Room author selection       | Activating a Room message avatar selects the same exact participant in the right manager without mutating Room facts         | Chara controlled-selection test and Desktop application integration test                                                                                                               | Pass (functional) |
| Room dense/narrow pixels    | Multiple portrait cards and the selected right-manager details remain legible in a real Room                                 | No authoritative Room exists in the current visible Desktop data                                                                                                                       | Blocked           |

The visible check used the already running real Electron application after HMR. It did not create a
test-only Scene, replace user data or terminate the active process. Direct image review found the
profile card visually attached to the assistant avatar, clear of the composer and right manager,
with readable contrast and no clipping at the tested window size. The current Character has no
configured portrait, so actual portrait pixels and multi-participant Room layout remain explicitly
unverified in a real product Scene. Targeted status is **functionally passed, visually partial**.

### Profile card sizing repair

A later visible capture exposed that the compact avatar selector also matched the sibling profile
card, forcing the card to `20×20` and wrapping values one character per line. The avatar now has an
explicit trigger class and only that trigger receives the compact dimensions. In the authoritative
running Electron application after HMR, keyboard focus displays the complete 240px card with
`v1`, `日常`, `可参与响应` and `未配置` on readable rows. Moving focus to the composer closes the
card while the composer and right participant manager remain available. Result: **passed** for the
reported sizing, wrapping and close-state defect; the previously recorded Room pixel limitation is
unchanged.
