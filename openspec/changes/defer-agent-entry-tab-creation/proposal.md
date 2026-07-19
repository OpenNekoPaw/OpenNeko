## Why

Agent 首页“生成素材”入口在用户尚未选择图片、视频或声音类型时就创建 conversation Tab，导致关闭选择器也遗留一个无意创建的空 Tab。该入口应与角色扮演入口保持一致：选择阶段仍由 tabless entry composer 拥有，只有明确确认后才创建目标 Tab。

## What Changes

- 点击“生成素材”只在首页打开素材类型选择器，不立即创建 conversation 或 Tab。
- 关闭选择器、点击外部区域或输入导致选择器退出时，不创建 conversation，并保留首页草稿。
- 选择图片、视频或声音后只创建一个 conversation Tab，并把所选 session mode、已有输入草稿和媒体模型默认值投影到新 Tab。
- 首页输入处于“生成素材”意图时，发送动作重新打开类型选择器，不得绕过显式选择直接创建 Tab。

## Capabilities

### New Capabilities

- `agent-entry-intent-selection`: 定义 Agent tabless entry composer 对生成素材意图的选择、取消、确认和新 Tab 初始化行为。

### Modified Capabilities

无。

## Impact

- `packages/neko-agent/packages/webview`：`ConversationController`、`InputArea`、`ChatWorkspace` 的 entry intent 与首次 Tab 初始化投影。
- 新增局部 Webview 回归测试和 Extension Development Host 真实交互验收。
- 不修改 Extension/Webview message、Proto、持久 conversation 数据或 Agent runtime。
