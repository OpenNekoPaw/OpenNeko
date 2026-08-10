## Why

Agent 对话面板当前混用无边框回复、聊天气泡和大面积错误卡片，消息层级不一致；同时回复复制仍读取可能为空的 `message.content`，无法覆盖由结构化 content blocks 渲染的可见回答。需要统一为接近 Codex 的低装饰对话样式，并让复制行为与用户实际看到的内容一致且失败可见。

## What Changes

- 保留用户输入的浅色、右对齐、无描边紧凑背景，用它表达发言权，而不是把所有消息都改成无背景文本。
- 保持 Agent 最终回复为左对齐无气泡正文，并将执行过程呈现为弱化的行内活动信息。
- 将 Agent 错误从整块红色描边卡片改为紧凑、左对齐、可扫描的行内诊断，保留错误语义和可读性。
- 复制操作使用与可见 Agent 回答一致的 canonical 文本投影，覆盖结构化 content blocks；成功和失败都提供可观察反馈。
- 增加消息样式、复制内容与失败反馈的组件测试和真实 Desktop UI 验收。

## Capabilities

### New Capabilities

- `agent-conversation-presentation`: 定义 Agent 对话中用户输入、Agent 输出、执行活动、错误诊断和消息复制的统一呈现及交互要求。

### Modified Capabilities


## Impact

- Owning responsibility: `packages/agent/webview` 继续拥有 Agent transcript 的 React 呈现、浏览器剪贴板交互和局部反馈状态；Desktop Main security policy 继续拥有浏览器权限授权。
- Affected code: `ChatView/MessageItem`、`MessageActions`、相关 presenter、Agent Webview 样式与组件测试，以及 Desktop 同源 renderer permission policy。
- Desktop composition、Agent runtime、package-owned IPC contract 和持久化事实不改变；Desktop 仅精确授权同源的 sanitized clipboard write，不开放 clipboard read 或其他浏览器权限。
- 不新增依赖，不新增 contract/schema 版本字段，也不引入替代 transcript 或 clipboard authority。
