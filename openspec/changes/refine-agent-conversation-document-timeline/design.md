## Context

Agent Webview 已通过 canonical Timeline 将一个助手消息投影成按时间排序的 `content_block` 和 `process_group` 列表项，并用虚拟列表保持长会话性能。当前每个助手内容块仍重复创建消息行、头像、标题和 85% 宽度气泡；未锚定 Subagent 工作项则长期展示在消息列表上方。Tool、WorkItem、附件和 composite artifact 已有结构化事实，展示层不需要也不得解析 Markdown 来重建这些状态。

本变更同时服务 Desktop Dock 与 VS Code Webview。实现必须复用 Agent Webview 和现有 `@neko/ui`/Agent 组件，不新增宿主专属会话状态、任务 DTO、资源路径转换或设计系统。

## Goals / Non-Goals

**Goals:**

- 让助手最终回答成为适合长内容阅读的全宽文档流。
- 保留用户指令、系统通知、审批、错误、运行进度和生成 Job 的语义差异。
- 用同一消息身份形成稳定的轮次视觉边界，同时维持虚拟列表 item identity 和 viewport restoration。
- 只把未锚定且仍活动或失败待关注的 WorkItem 固定在会话顶部。
- 让结构化 Tool 产物以明确的“本轮产物”语义展示，且继续通过现有 Tool result、artifact transfer 与 ResourceRef/ContentLocator 路径打开。

**Non-Goals:**

- 不修改 Pi Timeline、Extension/Webview transport、AgentSession 或 Tool/WorkItem 生命周期。
- 不新增通用 Task、TaskCard、跨领域 Activity authority 或会话持久化字段。
- 不从助手 Markdown 中解析文件名、进度或任务状态。
- 不重新设计生成媒体、Canvas artifact、Diff 和审批卡片的领域内部交互。
- 不为 Desktop 复制一套 Agent ChatView。

## Decisions

### 1. 使用混合文档时间线，而不是全气泡或全纯文本

助手 Markdown 使用透明、全宽的 document block；用户消息保留右对齐紧凑气泡。系统通知继续使用弱化状态胶囊，审批、失败、Generation Job、Diff 和结构化 artifact 继续使用语义卡片。

选择该方案是因为内容与执行状态具有不同交互职责。把所有内容改成纯文本会隐藏运行、审批和错误边界；继续使用所有气泡则会损失窄 Dock 的阅读宽度。

### 2. 展示层以 owner message 形成轮次视觉连续性

现有 `MessageListProjectionItem.ownerMessageId` 继续作为滚动恢复和轮次归属依据。内容块不再分别模拟独立助手消息：首个可见块显示一次助手身份，后续块使用同一文档缩进和间距。实现只调整组件结构、CSS class 和尺寸估算，不改变 Timeline item key、顺序或消息归属。

不把整个轮次合并为一个虚拟列表 item，因为流式长回答会造成单项高度持续剧烈变化，也会削弱现有的块级测量与滚动恢复。

### 3. 执行过程与行动状态分层

已成功且没有用户可见输出的 Tool、已完成 Thinking 继续由 `projectContentBlocksDisplay` 合并为默认折叠的过程摘要。运行中 Tool、待审批 Tool、失败 Tool、Generation Job 和带显式附件/artifact 的 Tool 保持独立可见。

这沿用当前 canonical projector 的状态判断，不通过 CSS 隐藏或复制数据。过程展开仅改变本地可恢复展示状态，不拥有执行状态。

### 4. 会话顶部工作项架只承担注意力队列

`selectUnanchoredWorkItems` 拆成可测试 presenter：先排除任何已被消息 `workItemIds` 锚定的项目，再只保留 `queued`、`processing` 和 `failed`。`completed` 与 `cancelled` 的未锚定项目不再固定展示；消息已锚定工作项仍只在其 Tool/消息上下文出现。

失败项目保留是因为仍需要用户注意；当前 Subagent contract 没有 dismissed/acknowledged 状态，本变更不发明该状态。

### 5. “本轮产物”是结构化 Tool 输出区域

Tool 展示在存在 `attachments`、artifact transfer、可打开文件输出或生成媒体时显示本地化“本轮产物”标题，并在标题下复用现有 renderer、打开动作和稳定资源投影。标题只是视觉归组，不创建新的 artifact DTO，也不改变 Board delivery。

同一 Tool 输出只渲染一次。跨多个 Tool 的全轮次去重需要稳定的 terminal artifact delivery projection，目前该 projection 由 Workspace Board 消费而未进入 Conversation Timeline，因此本变更不从 Markdown 或结果 JSON 猜测跨 Tool 等价性。

### 6. 样式复用现有主题变量并明确可访问性

新增样式继续使用 Agent/VS Code 主题变量。助手身份标签和用户气泡使角色区分不只依赖颜色；过程 disclosure 使用原生 button、`aria-expanded` 与可见 focus；活动工作项架提供可读标题和 live/status 语义，但不抢占焦点。

## Risks / Trade-offs

- **虚拟列表估算与真实高度偏差** → 同步调整 document/process 的估算常量，并用 presenter 与 Webview 运行态验证滚动恢复和流式 follow-tail。
- **多个产物 Tool 重复出现“本轮产物”标题** → 当前按 Tool 的稳定身份归组，避免错误跨 Tool 去重；后续只有在 Timeline 提供 terminal artifact collection 时再提升为真正的 turn-level rail。
- **去除助手气泡后角色边界减弱** → 首块保留助手 identity/header，文档块使用一致左侧轨道与轮次间距，用户输入继续右对齐。
- **已完成未锚定 Subagent 不再固定可见** → 它仍存在于 runtime/history 事实中；当生产路径要求历史入口时，应由显式 Activity/历史投影承载，而不是让顶部注意力架成为事实存储。

## Migration Plan

1. 为文档块、活动工作项筛选和产物标题补充聚焦测试。
2. 调整 ChatView presenter 与组件，保持原有 Timeline item identity。
3. 更新 CSS 和 i18n，并验证窄 Dock、宽 Webview、深浅主题与键盘交互。
4. 运行 Agent Webview 聚焦测试、typecheck/build、`git diff --check`。
5. 打包并重载 Desktop，在隔离测试项目中验证真实 Agent 表面；历史会话若缺少稳定轮次身份，则保留原始消息边界并记录残余风险，不以启发式合并伪造轮次事实。

回滚只需恢复展示组件与样式；没有持久数据或协议迁移。

## Open Questions

- 当 Conversation Timeline 正式提供 terminal creator-visible artifact collection 后，是否将多个 Tool 的产物提升为单一 turn-level rail；该问题不阻塞当前按 Tool 结构化归组。
