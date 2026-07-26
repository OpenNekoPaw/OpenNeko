## Context

Agent Webview 已使用一个 Header、TabBar 和 ConversationController 展示普通 Agent、
Character Dialogue 与 Embody Character。角色会话由 `@neko/chara` controller 拥有；
Agent Chat shell 只展示带显式 kind 的 tab projection。当前无标签入口页通过
roleplay-scoped Project Search 展示 confirmed character Entity 和可确认 Candidate，并分别调用
`startCharacterDialogueFromSlash` 或 `confirmRoleplayCandidate`。

Header 目前只有普通新会话、历史记录和账户入口。新增角色按钮必须复用上述路径，不能把
角色扮演建模为普通 `SessionMode`、创建临时 ordinary conversation，或在 Webview 中拥有
角色 session。

## Goals / Non-Goals

**Goals:**

- 从任意 Agent tab 状态直接打开角色选择菜单。
- 保持角色搜索、Candidate 确认、stable Entity handoff 和 Chara session owner 单一路径。
- 复用角色条目投影和选择 action，避免 Header 与 composer 产生两套资格判断。
- 保持 Header 紧凑尺寸、键盘语义、焦点和窄侧栏布局稳定。
- 用确定性测试和 Extension Development Host 验证真实 Webview 消息与角色 tab 创建。

**Non-Goals:**

- 不新增独立 Chara Webview、角色历史数据库或 CharacterProject/CharacterVersion。
- 不改变角色 Prompt、provider/model binding、Pi runtime 或 Chara controller。
- 不把 Embody Character 加入本次入口，也不把角色扮演加入媒体 `SessionMode`。
- 不改变 Project Search、Entity facade 或 Webview message schema。

## Five-layer analysis

| Layer | Decision |
| --- | --- |
| Responsibility | Header owns menu visibility; ConversationController owns UI orchestration; existing Webview roleplay action maps selection to Host message; Chara continues to own the role session. |
| Dependency | Header and shared roleplay list depend only on Webview types/presenters; no Webview import of Extension, Chara implementation or VS Code API. |
| Interface | Add internal render props for roleplay items, request and selection. Public Agent/Extension/Chara contracts remain unchanged. |
| Extension | Future Header and tabless entry surfaces consume one roleplay item projector/list and one selection action; new role modes require an explicit design rather than widening `SessionMode`. |
| Testing | Header interaction, controller message-path tests, existing InputArea path tests, Webview build/test and Extension Development Host acceptance. |

## Decisions

### 1. Keep one panel and separate session kinds

The roleplay button is placed between ordinary new chat and history. It opens a role selector and never
changes the active ordinary conversation into a role session. A successful selection creates the existing
`character-dialogue` tab projection.

Alternative rejected: adding roleplay to the Agent/image/video/audio selector. That selector changes turn
execution mode inside an ordinary conversation, while roleplay creates a Chara-owned session with different
identity and recovery semantics.

### 2. Reuse the current roleplay search and handoff

Opening the menu issues the existing tabless roleplay search:

```text
Header button
  -> searchProjectFiles("", purpose = "roleplay")
  -> canonical Entity/Candidate projections
  -> exact selected item
     -> confirmed Entity: startCharacterDialogueFromSlash
     -> Candidate: confirmRoleplayCandidate
  -> Chara-owned Character Dialogue session
```

The selection helper and roleplay item list are package-local reusable Webview components. Header does not
interpret Entity facts, trust projected labels as identity, or construct a session itself.

Runtime acceptance exposed that the Entity Project Search adapter filtered only `searchText` before
applying `limit`, while Host confirmation re-resolves the exact selected `ProjectSearchItem.id`. The
adapter therefore treats exact item identity as a first-class match before applying its limit. The central
Project Search service remains the catalog authority; no Candidate cache or label lookup is added to the
Webview or Chara controller.

Alternative rejected: a Header-specific command or new message type. It would duplicate the existing
validated route and create a second compatibility surface.

### 3. Use a compact icon menu

The Header uses the existing shared `MannequinIcon` with localized tooltip and accessible name. The button
has a fixed action size and active state while its menu is open. The menu uses existing Header overlay
tokens, closes on outside click or Escape, and lists the same confirmed/Candidate distinction as the
tabless entry.

No new design-system primitive is added: this is an Agent-specific menu with domain semantics, while its
button and overlay reuse existing Agent Header styles and shared icon assets.

### 4. Do not bind the action to the active conversation

Roleplay search and selection carry stable Project Search/Entity identity and do not require the current
ordinary conversation ID. An active Agent turn continues independently; opening the role selector does not
cancel, mutate or append to that conversation.

### 5. Product development staging must execute current workspace sources

The composed `Debug Dev (All)` configuration already points at one staged product extension. Its stage
builder invokes Turbo directly with `--force` for the retained feature package set before composing the
product. This is scoped to the local Extension Development Host path: feature bundles import source-only
workspace packages such as Entity, Chara and Search, while their source changes are not represented by
upstream build tasks in the current Turbo graph. A cache hit can therefore restore an Agent bundle that
predates the source under acceptance.

Release builds retain their existing cache policy. Updating `.vscode` or adding another launch
configuration would not repair stale bundle contents and would create a second development path.

## Risks / Trade-offs

- [Global mention results can be stale while a new roleplay search is pending] -> Opening always requests
  the canonical roleplay scope, clears the previous menu projection and consumes only playable character
  projections; stale or invalid selection remains rejected by Host re-resolution.
- [An extra Header action can squeeze tabs in narrow sidebars] -> Keep the button at the established icon
  size, make actions non-shrinking and verify the smallest practical Extension Host sidebar width.
- [Header and tabless entry could drift] -> Share item projection/rendering and selection action, and assert
  both surfaces hit the same Host messages.
- [Candidate confirmation can fail asynchronously] -> Close the menu after selection and preserve existing
  fail-visible Host diagnostic; do not create an optimistic role tab.
- [Product-composed EDH can execute a stale feature bundle] -> Force feature compile only in the product
  development stage and keep a static orchestration test proving the stage cannot silently re-enable a
  cached compile.

## Migration Plan

This is an additive prelaunch Webview change with no persisted schema or user-data migration. Rollback
removes only the Header entry; existing tabless roleplay and Chara sessions remain unchanged.

## Open Questions

None for the scoped Character Dialogue entry. A combined Character Dialogue/Embody launcher requires a
separate product decision because the two modes have different user ownership semantics.
