# Tasks: Add Workspace Canvas Context Bar

> 实施中。完成后逐项勾选；无法运行真实 Electron UI / Agent Evaluation 时保留未勾选并记录 blocker。

## 1. Contract & owning service

- [x] 1.1 在 `@neko/canvas` domain 定义 host-neutral `CanvasIndexCatalog` / `CanvasTurnTarget` 最小 contract：stable workspace identity、canvas index identity、默认 Board option、轻量 summary、lazy-create 条件与 fail-local 错误语义。
- [x] 1.2 在 `@neko/canvas` domain 定义 `CanvasWorkspaceIndexService` owning service：list canvases、read light index/summary、resolve exact selected canvas；lazy-create `workspace.nkc` 由既有 canonical Board delivery coordinator 仅在合格 typed artifact 投递时执行。
- [x] 1.3 在 `@neko/canvas-node` 提供 workspace adapter：经注入的 workspace path/grant 精确读写 `.nkc` 索引；不扫描文件、不镜像 Board、不推断 active/recent Canvas。
- [x] 1.4 在 `@neko/agent-contracts` 增加 composer Canvas catalog/selection 与 turn intent 字段，仅属于 presentation/turn，不进入 `AgentDomainBinding`。

## 2. Agent runtime turn routing

- [x] 2.1 在 `@neko/agent-runtime` draft/session submit 路径接收精确 Canvas turn intent；不写 binding，不写消息引用。
- [x] 2.2 Turn 边界只读取轻量 Canvas summary 注入 context；完整 Canvas 内容仅由 Agent 任务按需访问。
- [x] 2.3 合格 typed artifact 投递写入精确 selected Canvas；未选择时写入 canonical Board；普通对话/推理/日志不写 Board。
- [x] 2.4 切换 Canvas 只影响后续 Turn；已提交 Turn 使用其创建时的精确 selection。
- [x] 2.5 Board/exact Canvas identity 是本轮首要画布索引；相关或可能由画布回答的请求先查询所选 Canvas，禁止先通过通用目录/文件操作重新发现它；Board 缺失时不创建、不伪装为空成功，无关请求不强制读取完整文档。

## 3. Desktop typed IPC projection

- [x] 3.1 Desktop Main/preload 投影最小 typed IPC：仅读取 catalog/轻量 summary；Canvas selection/turn target 只存在于 Agent submit contract 与 Renderer presentation state，不通过 selection-write IPC。Renderer 不访问文件系统或 Electron。
- [x] 3.2 Desktop adapter 只做 sender/workspace grant 授权和 package service 调用；不保存 active/recent Canvas，不镜像 Board。
- [x] 3.3 通过 Canvas-owned Desktop bridge 投影 Workspace-scoped index invalidation；仅在 sender-bound Resource Browser 成功新增 Canvas 后发布，失败、Cut/普通文件创建不发布。

## 4. Composer UI

- [x] 4.1 新增 Workspace Canvas context bar 独立组件，在 composer shell 上方 sibling rail 显示 Workspace label + 当前 Canvas index（Board 默认）。
- [x] 4.2 入口界面内容与交互保持不变；文件、素材、Canvas 节点引用与附件继续保留在 composer shell 内部。
- [x] 4.3 Workspace Conversation 的 Workspace binding 固定，Canvas index 每次发送前可切换。
- [x] 4.4 非法或缺失 Canvas 选择 fail-local：显示 diagnostic，不回退 Board/active/recent Canvas。
- [x] 4.5 复用现有 i18n/theme 与组件；补齐 aria label、键盘可操作性。
- [x] 4.6 将 Workspace/Canvas rail 收敛为与 composer 一致的整栏宽度和完整圆角，仅 Canvas 选择控件按内容收缩；exact 选项显示带 `.nkc` 后缀的文件名。
- [x] 4.7 通过 Desktop 已有 creative-document authority 支持双击当前 exact Canvas 打开/聚焦，Board 不提前创建。
- [x] 4.8 Workspace 首轮发送前显示独立上下文栏；视觉匹配入口，但组件、功能 class、状态和事件独立，且不接触 Entry Draft/intent/receipt。
- [x] 4.9 将 Canvas selection 从组件本地 state 提升到 `@neko/agent-webview` package-owned presentation
      snapshot，按 exact Conversation/draft Surface + Workspace 隔离，并覆盖界面卸载重建、draft 发布转交、
      sibling Conversation/Workspace 隔离和恢复后发送目标测试。
- [x] 4.10 Workspace/Scene 切换继续读取 canonical composer configuration；收到匹配 Workspace 的 Canvas index invalidation 后重读 catalog，切换已有选项不查询且不触发 Agent turn。

## 5. Tests

- [x] 5.1 补足 owning package contract/service 测试（domain/node 部分：默认 Board 不读/不创建、exact 成功、非法/缺失 fail-local 且 sibling 可用；lazy-create 与投递写入待 5.2）。
- [x] 5.2 补足投递目标测试：未选择 -> canonical Board；选择 -> selected Canvas；切换只影响后续 Turn；普通对话/推理/日志不写 Board。
- [x] 5.3 补足组件测试：Workspace 栏在 composer shell 上方；引用仍在 shell 内；入口行为不变。
- [x] 5.4 运行最小相关测试与 typecheck（package 级）。
- [x] 5.5 补足 exact Canvas 文件名、双击 open/focus、Board no-op、rail 整栏宽度与圆角样式测试。
- [x] 5.6 补足 Workspace 首轮不读取/配置/提交 Entry intent/receipt 且不写 Entry snapshot 的回归测试。
- [x] 5.7 补足 Canvas prompt 路由测试：Board/exact identity、exact authoritative summary、优先查询 selected Canvas、禁止通用目录/文件重新发现、Board 缺失不预创建/不伪装为空成功，以及无 target 不注入。
- [x] 5.8 补足 Main 发布条件、preload strict event decode 和 Desktop Agent consumer 测试：匹配 Workspace 新增后刷新、foreign Workspace 隔离、selection 不重读、未提交不创建 Conversation/Turn。

## 6. UI / Agent Evaluation

- [x] 6.1 按仓库文档判断 Agent Evaluation reuse/update/create/excluded，并把证据要求写入 OpenSpec；不得仅凭最终文本宣称通过。
- [x] 6.2 真实 Electron UI 验收：通过可见 Desktop + Computer Use 验证 Workspace/Canvas 左侧连续排列、透明无描边样式、选项切换与窄 Agent 面板适配；真实 artifact routing 仍由 6.3 覆盖。
- [ ] 6.3 真实 API Agent 行为验收（若可运行）：turn context 与 artifact routing 实际执行证据；无法运行时记录 `infrastructure-blocked` 与 blocker。**infrastructure-blocked**
- [x] 6.4 记录本次 Evaluation disposition：Canvas catalog freshness 仅改变 Desktop UI projection，使用确定性 Main/preload/Renderer 测试；已有 per-turn Canvas target 路由继续 reuse 现有 suite/blocker，不伪装为真实 Agent 行为证据。

## 完成定义

- [x] 所有契约/服务/UI/测试任务完成或明确记录 blocker。
- [x] 无 active/recent fallback、无隐式 workspace、无版本字段、无多路径/兼容分支。
- [x] 交付总结列出修改文件、测试命令、未完成风险。
