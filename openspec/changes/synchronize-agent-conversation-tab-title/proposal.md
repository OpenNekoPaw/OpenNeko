## Why

Agent 首条用户消息会更新 Pi conversation catalog 中的会话标题，但当前打开的
`TabState.openTabs[].title` 仍保留创建时的 `New conversation`。Header 只渲染 Host
投影的 TabState，因此会话内容已经开始运行时，标签仍显示“新对话”。

## What Changes

- 在消息准备和 Agent/media dispatch 前初始化 canonical conversation title。
- 由 ConversationBridge 持久化标题，并通知 ChatViewProvider 同步所有绑定该
  conversation 的普通 Tab。
- 继续通过 Host-owned revisioned TabState 持久化和投影标签；Webview 不从消息内容
  本地推断标题。
- 为首条消息、既有标题和同 conversation 多 Tab 增加路径级回归测试。

## Capabilities

### New Capabilities

- `agent-conversation-tab-title`: 会话权威标题与 VS Code Agent Header 标签的一致投影。

## Impact

- `packages/neko-agent/packages/extension`: ConversationBridge、消息 turn preflight、
  ChatViewProvider TabState 同步及测试。
- 不修改 Webview message schema、Pi transcript schema、Prompt、Skill、provider 或
  Generation Job contract。
