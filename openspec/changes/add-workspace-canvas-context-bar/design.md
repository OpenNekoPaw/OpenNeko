# Design: Add Workspace Canvas Context Bar

## Context

Workspace Agent composer 当前已有 Workspace 绑定，但缺少精确的 Canvas index 选择与 turn 级
路由。现有 Board delivery 只覆盖 canonical Workspace Board；本变更在不改变 Board authority
和入口界面的前提下，为 Workspace 增加 composer shell 上方的独立上下文栏。

## Ownership and boundaries

- Canvas 索引目录、轻量 summary、lazy-create 与 typed artifact 精确写入由
  `@neko/canvas` domain 定义 contract，`@neko/canvas-node` 提供 Node workspace adapter。
- Desktop Main/preload 只投影 typed IPC；Renderer 不扫描文件、不访问 Node/Electron。
- Agent composer 持有 Canvas selection 为 presentation state；发送时把精确 selection
  作为 turn intent 交给 `@neko/agent-runtime`，runtime 只消费契约字段，不写入
  `AgentDomainBinding`，不生成消息引用。
- `@neko/agent-webview` 通过 Renderer 根部组合的 package-owned、可丢弃 presentation snapshot
  保存 selection。已发布会话以 Conversation + Workspace 为 scope；首轮前以 Agent Surface draft +
  Workspace 为 scope。只有同一 mounted draft 的 `undefined -> exact Conversation` 转换可以把 draft
  selection 转交给该 Conversation；普通重开不得从 draft、active 或 recent selection 推断。
- 跨会话复用通过用户选择同一 Canvas identity 实现；不保存 active/recent Canvas 推断。

## Canonical path

```text
AgentWebview composer canvas selector
  -> @neko/agent-contracts typed composer canvas catalog/turn intent
  -> @neko/agent-runtime initial/session submit + turn context projection
  -> @neko/canvas domain CanvasIndexCatalog/CanvasTurnTarget contract
  -> @neko/canvas-node workspace index/read/write adapter
  -> Desktop Main/preload typed IPC projection
```

失败语义：

- 非法或缺失 Canvas identity 在 owning boundary 直接拒绝当前请求/选择，返回
  diagnostic，不 fallback 到 Board、active/recent Canvas 或空成功。
- Board 是 canonical 默认显示与默认投递目标；选择具体 Canvas 后本轮精确使用该
  Canvas，不镜像 Board。
- 默认显示 Board 不触发 `workspace.nkc` 读取或创建。

## Key decisions

1. `AgentDomainBinding` 不变。Canvas selection 不进入 binding；已有 Workspace
   Conversation 的 Workspace binding 固定。
2. Workspace Canvas context bar 位于 `agent-composer-shell` 上方，与文件、素材和节点引用
   分离。它可以匹配入口上下文栏的视觉规范，但必须拥有独立组件、功能 class、状态和事件；
   不读取、保存或提交 Entry Draft snapshot、Entry target intent 或 receipt，也不修改入口 DOM。
3. Workspace context bar 仅显示 Workspace label + Canvas index（逻辑默认 Board 为
   可见选项）；不显示读写状态、范围或权限信息。
4. Turn 边界只读取轻量 Canvas index/summary；完整 Canvas 内容仅由 Agent 任务按需访问。
   默认 Board 或具体 Canvas 被选中时，其 canonical/exact identity 作为本轮首要画布索引；具体
   Canvas 同时注入轻量 summary。与画布内容相关或可能由画布回答的请求必须先通过 Canvas query
   capability 查询所选 identity，不得先用通用目录/文件工具重新发现所选 Canvas。Board 不存在时
   查询保持只读且不得创建或伪装为空结果；与画布无关的请求不因此强制读取完整文档。
5. 只有既有合格 creator-visible typed artifact 投递才由 Canvas owner lazy-create
   `workspace.nkc`；普通对话、推理、日志不写 Board。
6. 单一 canonical contract，不引入版本字段、active/recent fallback、多路径或兼容分支。
7. Workspace rail 与入口上下文栏保持一致的整栏宽度、间距、背景、阴影和圆角视觉；只有 Canvas 选择控件按内容收缩。视觉一致不构成功能 class、组件或状态复用。
8. Canvas catalog 的用户可见 label 是 exact workspace-relative 文件名（含 `.nkc` 后缀），文档内部 `name` 仍仅属于轻量 summary，不取代文件 identity。
9. 双击打开仅适用于 exact Canvas；Agent Webview 只发出已选 exact identity，Desktop 使用现有 creative-document open/focus authority 授权并创建或聚焦 Workbench View。Board 默认项不因双击而提前创建文件。
10. 界面切换遵循 Window scene 生命周期：Agent Root 可以卸载，selection snapshot 继续由稳定 Renderer
    provider 持有；重新进入时按 exact scope 重建。snapshot 不保存 Canvas 内容、Conversation binding、
    runtime handle 或 durable project fact，应用完整重开后可丢弃。

## User-data impact

- 不迁移、不重写、不删除既有 Canvas、Board、conversation 或 workspace 数据。
- 用户未显式选择 Canvas 时，逻辑默认 Board 仍作为可见、可切换的选择项。
- Canvas selection 属于可恢复 presentation/turn 状态；不持久化为 immutable binding。
- Workspace 首轮尚未创建 Conversation 时只持有 Workspace presentation state；Host 的 technical draft phase 不授予 Entry 业务语义。
