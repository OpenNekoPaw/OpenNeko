# Add Workspace Canvas Context Bar

## Status

proposal

## Objective

为 Agent composer 增加 Workspace Canvas 上下文栏：

- Workspace 使用独立上下文栏，作为 composer shell 的上方 sibling rail，位于输入框上方；入口界面的既有内容、交互与上下文栏保持不变。
- Workspace context bar 仅展示稳定 Workspace 与当前 Canvas index，不展示读写状态、范围或权限信息。
- 文件、素材、Canvas 节点引用和附件继续留在输入框内部，不与上下文栏混淆。
- Workspace Conversation 的 Workspace binding 固定，Canvas index 可在每次发送前切换，不得改变 conversation owner。
- 默认显示逻辑 canonical Workspace Board；不因选择或进入会话创建空 `workspace.nkc`，只在既有合格 creator-visible typed artifact 投递发生时由 Canvas owner lazy-create。
- 选择具体 Canvas 后，本轮按需读取其轻量索引/摘要，并把合格 typed artifacts 精确写入该 Canvas；不镜像 canonical Board，不依据 active/recent Canvas 推断。
- Canvas selection 属于 Workspace composer presentation state 或精确 turn intent，不进入 `AgentDomainBinding`，也不变成消息引用；跨会话复用时通过选择同一 Canvas identity 复用。
- Composer selection 必须由 `@neko/agent-webview` 的 package-owned presentation snapshot 按精确
  Conversation + Workspace 保存；首轮创建前按 Agent Surface draft + Workspace 保存，并且只在同一
  mounted draft 被发布为 Conversation 时转交。界面切换卸载可见 Agent Root 后不得丢失选择，也不得
  把一个会话的选择泄漏给 sibling Conversation 或 Workspace。
- 保持唯一 canonical contract/owner/handler/projection 路径，fail-visible、fail-local；不引入 active/recent fallback、隐式工作区、版本字段、多路径或兼容分支。
- Workspace 与入口可以匹配同一视觉规范，但必须保持独立组件、功能 class、状态和事件；补足 owning package contract/service/组件/投递目标测试。
- Workspace/Canvas rail 保持与 composer 输入框一致的栏宽，并使用完整圆角容器；只有 Canvas 选择控件按内容收缩，不呈现为整栏小胶囊或贴边长方形区域。
- exact Canvas 选项显示带 `.nkc` 后缀的 workspace-relative 文件名；用户双击当前 exact Canvas 时，通过 Desktop 已有 creative-document authority 打开或聚焦该文件。
- Canvas catalog 以当前授权 Workspace 中的 `.nkc` 文件为可重建只读索引；切换 Workspace/Scene 与成功新增 Canvas 时重读 canonical catalog，在已有选项之间切换只更新 presentation selection，不重扫目录。
- Catalog 仅服务 Composer UI；Agent runtime 不接收整个文件列表，只在用户提交后、模型执行前由 Host 验证并注入本轮选中的 Board/exact Canvas target 及轻量 summary。

## Affected packages and ownership

| Scope                                               | Owner                            | Role                                         |
| --------------------------------------------------- | -------------------------------- | -------------------------------------------- |
| Canvas index catalog/selection/turn target contract | `@neko/canvas` domain            | L0/L1 host-neutral contract + owning service |
| Canvas node workspace index/read/write adapter      | `@neko/canvas-node`              | Node workspace adapter                       |
| Agent composer canvas context UI                    | `@neko/agent-webview`            | Browser UI presentation                      |
| Agent draft/session submit path                     | `@neko/agent-runtime`            | Host-neutral turn intent routing             |
| Desktop typed IPC projection                        | `apps/neko-desktop` Main/preload | Thin Electron trust/adapter boundary         |

## Non-goals

- 不修改 AgentDomainBinding 的既有字段与语义。
- 不把 Canvas selection 持久化为 conversation owner、消息引用或领域 binding。
- 不建立 Board 镜像、active/recent Canvas 推断、隐式 workspace 或回退链。
- 不实现普通对话/推理/日志的 Board 写入。
- 不提前创建或迁移 `workspace.nkc`。
- 不把 Workspace Canvas catalog 整体注入 Agent Session 或模型上下文。
- 不修改入口界面的内容、交互、Entry Draft snapshot、Entry target intent 或 receipt。

## Verification constraints

- 默认逻辑 Workspace Board 不提前创建。
- 切换界面后重新挂载同一 Conversation 时恢复精确 Canvas selection；draft 发布后的首轮仍使用发送时
  选择，且 sibling Conversation/Workspace 保持隔离。
- 选定 Canvas 精确读取与写入。
- 切换只影响后续 Turn。
- 引用仍在输入框内。
- Workspace 栏在输入框上方，入口界面保持变更前行为。
- 非法或缺失 Canvas fail-local 且不回退。
- Renderer 不扫描文件、不访问 Node/Electron。
- Agent Evaluation 先判断 reuse/update/create/excluded，证据写入 OpenSpec；本变更涉及 Turn context 与 artifact routing，不得仅凭最终文本宣称真实行为通过。
