# Design: Add Workspace Canvas Context Bar

## Context

Agent composer 当前已有 Workspace 绑定和 Entry 绑定 UI，但缺少精确的 Canvas index
选择与 turn 级路由。现有 Board delivery 只覆盖 canonical Workspace Board；本变更在不改变
Board authority 的前提下增加显式 Canvas selection，并把 composer 上下文栏统一为
composer shell 上方的 sibling rail。

## Ownership and boundaries

- Canvas 索引目录、轻量 summary、lazy-create 与 typed artifact 精确写入由
  `@neko/canvas` domain 定义 contract，`@neko/canvas-node` 提供 Node workspace adapter。
- Desktop Main/preload 只投影 typed IPC；Renderer 不扫描文件、不访问 Node/Electron。
- Agent composer 持有 Canvas selection 为 presentation state；发送时把精确 selection
  作为 turn intent 交给 `@neko/agent-runtime`，runtime 只消费契约字段，不写入
  `AgentDomainBinding`，不生成消息引用。
- 跨会话复用通过用户选择同一 Canvas identity 实现；不保存 active/recent Canvas 推断。

## Canonical path

```text
AgentWebview composer canvas selector
  -> @neko/agent-contracts typed composer canvas catalog/turn intent
  -> @neko/agent-runtime draft/session submit + turn context projection
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
2. Entry 与 Conversation 的 Canvas selector 复用同一 presentational rail，位于
   `agent-composer-shell` 上方，与文件/素材/节点引用分离。Workspace/Canvas rail 与
   Entry binding rail 共同复用唯一的 canonical composer context rail 基础样式；
   Workspace/Canvas 组件只扩展 Workspace label、Canvas selector 与 diagnostic 的内部
   布局和交互状态，不复制容器几何或视觉声明。入口创作模式复用同一 rail，但仅显示
   Workspace label。
3. Workspace context bar 仅显示 Workspace label + Canvas index（逻辑默认 Board 为
   可见选项）；不显示读写状态、范围或权限信息。
4. Turn 边界只读取轻量 Canvas index/summary；完整 Canvas 内容仅由 Agent 任务按需访问。
5. 只有既有合格 creator-visible typed artifact 投递才由 Canvas owner lazy-create
   `workspace.nkc`；普通对话、推理、日志不写 Board。
6. 单一 canonical contract，不引入版本字段、active/recent fallback、多路径或兼容分支。

## User-data impact

- 不迁移、不重写、不删除既有 Canvas、Board、conversation 或 workspace 数据。
- 用户未显式选择 Canvas 时，逻辑默认 Board 仍作为可见、可切换的选择项。
- Canvas selection 属于可恢复 presentation/turn 状态；不持久化为 immutable binding。
