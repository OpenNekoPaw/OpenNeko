## Why

Development 组合仍展示 Character Dialogue 入口和 Agent Entry Character selector，但当前 Renderer 在进入
Agent Entry 后立即丢弃 handoff，DSH Conversation 创建 target 也不携带 Character selection。用户看到的结果是
owner-qualified 拒绝提示，或者从 selector 提交后静默创建普通 Assistant Conversation；已有 Character 数据没有
丢失，但 Character 无法通过产品入口对话。

## What Changes

- Development 的 Character 管理详情“开始对话”将 exact CharacterVersion handoff 交给 Agent Entry，并由 Entry
  显式展示、保留和提交该选择。
- DSH Conversation 创建 contract 增加 Character Dialogue target；Desktop Main 委托 Chara 的
  `CharacterConversationLaunchService` 创建 CharacterRun、Dialogue/Room 与绑定后的 DSH Conversation。
- 首条用户输入只提交给启动结果中的 exact primary Agent Conversation，并携带 Chara 冻结的 Character context；
  启动、绑定或首条提交失败必须可见且不得降级为 Assistant。
- 删除当前“收到 handoff 后立即拒绝并清空”的路径，并增加 producer、consumer、原子性和 no-fallback 测试。
- Release composition 继续隐藏并拒绝 Character 能力；本变更不改变发行可达性。

## Capabilities

### Modified Capabilities

- `character-dialogue-chatroom`: Development 的单 Character 入口通过 Chara-owned launch transaction 绑定唯一
  DSH Conversation，并在首次提交时注入冻结 Character context。
- `desktop-conversation-context-navigation`: Character detail handoff 与 Agent Entry target 使用 exact
  CharacterVersion，不再被丢弃或降级为 Assistant。

## Impact

- `packages/agent/contracts`: 拥有 DSH session host 的 Character creation target wire contract；复用既有
  Character launch binding，不新增平行 DTO。
- `packages/agent/webview`: 拥有 Agent Entry 的 draft selection presentation 与 submit producer。
- `packages/chara`: 继续拥有 Character launch transaction、CharacterRun/Dialogue facts 和 turn context。
- `apps/neko-desktop/src/main`: 只组合 Chara launch service 与 DSH/typed IPC adapter，不拥有 Character 规则。
- `apps/neko-desktop/src/renderer`: 只把 exact handoff 送入当前可见 Agent Entry，并在 Entry 接收后消费。
- 需要 focused Agent Evaluation、真实 Development Electron UI 验证和 L4 quality review。
