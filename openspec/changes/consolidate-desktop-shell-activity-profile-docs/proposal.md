## Why

OpenNeko 已有拟议 Desktop composition 与 Home/Project Profile ADR，也已经分别完成领域
Job 生命周期、Media Library 和 Chara 第一阶段所有权收敛。但这些文档仍混用
`Task`、`BackgroundWork`、全局任务页、Agent Conversation Tab、Project Tab 和已经删除的
Rust Engine/TypeScript client 术语，容易让后续 Desktop 实施恢复被取代的通用 TaskManager、
全局 Activity authority 或旧 Workbench Core。

本变更只收敛架构文档：明确顶部 Project Tabs、Home Attention Inbox、项目内 Activity
projection、领域 Job owner 和三类 Project Profile 的当前成熟度，使新 Desktop 设计建立在
现有 Agent、Canvas、Cut、Chara、Media Library 与 Node/FFmpeg canonical path 上。

## What Changes

- 固定顶部 Tab 只表示当前窗口的 Project 工作集；Home 固定，Agent Conversation、项目内
  Surface 和领域 Job 不进入顶层 Tab。
- 用 `Activity / Attention` 投影替代含义模糊的全局“任务栏”：Home 只聚合可导航摘要，
  Conversation Timeline、Canvas、Cut、Character 和 World 分别展示自己的执行事实。
- 删除拟议 Desktop 文档中的通用 `BackgroundWorkId` 目标模型，改为明确的 Agent Run、
  Tool Call 和 owning-domain Job/Run identity。
- 明确当前 Agent Webview Tab 与 `@neko/ui` Workbench Tabs 只是可复用的会话投影或 UI
  primitive，不是 Desktop Project Tab 状态 authority。
- 明确 Host/domain snapshot、Renderer replica、Window state、View state、component state
  和插件私有 state 的所有权，以及 snapshot-first attachment、revision/CAS 和迟到消息拒绝。
- 建立根 Desktop Roadmap，把开发固定为“前端与子包接入 → 跨平台资格 → MCP/插件/专业
  工具”三个阶段，并为每阶段定义真实能力与发布门禁。
- 记录 Content、Character IP、Interactive World 和 Media Library 的当前成熟度，禁止用
  Profile 名称或空页面宣称未实现能力成功。
- 清理当前 Desktop 目标文档中的 Rust Engine/EngineClient 术语，统一到 `@neko/media`、
  Node/FFmpeg、浏览器媒体客户端和领域窄 port。
- 保留已取代 Workbench Core、旧 Desktop AppHost 和旧 Task Queue ADR 为明确历史材料，
  不恢复其 runtime、registry 或兼容路径。

## Capabilities

### New Capabilities

- `desktop-shell-information-architecture`: 定义 Desktop Project Tabs、Home/Project scope、
  Activity/Attention 投影和三类 Project Profile 的文档级目标边界。

### Modified Capabilities

无。当前稳定 specs 尚未定义 Desktop Shell；本变更不创建运行时 contract。

## Impact

- 架构文档：Desktop composition、Home/Profile UX、架构导航。
- 根文档：新增中英文 Desktop Roadmap，并从 README 与文档导航进入。
- 状态文档：为 2026-07-22 Desktop Host Adapter 审计增加后续失效说明。
- Agent/Job：只同步已接受的 Tool Call、Subagent 与领域 Job 生命周期，不修改运行时代码。
- Content/Character/World：只记录真实成熟度，不新增 project codec、package 或 UI。
- Media：只同步已完成的 Engine/client 退役结论，不修改 `@neko/media`。
- 用户数据与产品行为：无运行时、格式、配置、安装或数据迁移变更。
