## Why

Agent 会话当前同时使用助手气泡、独立内容块、过程卡片和会话顶部工作项架，导致长回答阅读宽度不足、轮次边界模糊，并可能让同一工作项在多个位置重复出现。Desktop 窄 Dock 已完成输入区收敛，现在需要让会话正文、执行状态和创作产物形成一致且可追溯的文档式时间线。

## What Changes

- 将助手 Markdown 回答从对话气泡改为全宽文档流，同时保留紧凑且可辨识的用户消息气泡。
- 将同一助手消息的正文、执行过程、状态卡片和关联工作项组织为统一的轮次视觉层级，避免每个内容块重复头像和标题。
- 将已完成的思考与工具记录默认折叠为“执行过程”摘要；运行中、待审批和失败状态继续使用可操作的语义卡片。
- 会话顶部只展示未锚定且仍需关注的活动工作项；已完成或已取消的未锚定工作项不再长期占用顶部空间。
- 保持 Timeline、Tool Call、WorkItem 和稳定资源引用为唯一事实来源；不得从 Markdown 文本推断任务或创作产物。
- 补充文档式时间线、活动工作项筛选、可访问性、虚拟滚动尺寸估算和 Desktop Agent 运行态验收。

## Capabilities

### New Capabilities

- `agent-conversation-document-timeline`: 定义 Agent 会话中文档式助手回答、语义执行状态、活动工作项和结构化产物的展示与交互要求。

### Modified Capabilities

<!-- None. This change introduces a presentation capability without changing an existing stable spec. -->

## Impact

- 主要影响 `packages/neko-agent/packages/webview` 的 ChatView 组件、展示 presenter、样式、国际化和测试。
- 不改变 Agent runtime、Timeline transport、Tool Call/WorkItem 状态机、Host message contract 或资源访问边界。
- Desktop 与 VS Code 仍复用同一 Agent Webview 展示实现，只允许宿主层提供既有视觉变量和容器尺寸。
- 本变更以打包后的 Desktop Agent 表面作为运行态验收宿主，验证会话状态、窄宽度布局和恢复后的真实时间线投影。
