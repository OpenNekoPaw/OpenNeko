## Why

Desktop P1.2 已建立 Home、Content Project、Window/View identity、projection recovery 和
fail-visible Agent 插槽，但 Agent 的生产 Webview router 与 composition 仍由 VS Code
Extension 拥有，Electron 没有完整 route coverage、conversation runtime、credential、
storage 或 content composition。若直接在 Desktop 复制 `ChatViewProvider` 或只嵌入
`AgentWebviewRoot`，会产生第二套 router、conversation state 和 Host effect。

## What Changes

- 审计全部 52 条 Agent Webview-to-Host message route，并为 Electron 固定
  `implemented`、`unsupported` 或 `host-inapplicable` 分类；缺失或未知 route
  fail-visible。
- 将可跨宿主的 Agent message orchestration 收敛到 `@neko/agent` 与
  `@neko-agent/types` owning boundary，以窄 Host effects 组合 VS Code 和 Electron。
- 在 Desktop AppHost 中组合 Pi conversation runtime、Pi Session、Product Turn Bridge、
  conversation metadata/storage、CredentialStore interaction、workspace content access、
  permission/approval 和 lifecycle disposal。
- 将完整 `AgentWebviewRoot` 接入 Content Project，并投影 Conversation/Tab、Timeline、
  Tool Call、Approval、Skill、已有 GenerationJob link/status、Home Conversation/Activity
  与 Attention summary。
- Desktop Shell 与嵌入的 Agent Root 默认使用共享浅色主题语义，并通过共享 i18n runtime
  支持 `en` / `zh-cn` locale、日期格式和无障碍文案，不建立 Desktop 私有 theme/i18n runtime。
- Home 采用 creator-first 左侧导航与中央开始创作区；Content Project 复用共享 Workbench
  primitive，将当前唯一 ready 的 Agent Root 作为中央主 workspace，并组合 activity rail、
  capability sidebar 与右侧 Context dock；未接通的 P1.4–P1.6 surface 只显示能力状态和明确
  unavailable，而不是视觉 mock success。
- 优化 Desktop UX 信息层级、最近工作导航、状态表达和最小窗口适配；所有视觉优化必须保留
  真实 Project/Tab/Agent/projection 基础能力，未接入区域不得显示仿输入框、仿画布工具或仿搜索
  等可能被误认为可操作的控件。
- 收敛 Home Agent 入口为更聚焦的单一 composer 面板：强化输入区与底部 Project handoff
  工具条的视觉层级，把重复的“打开项目”按钮与 Project 选择收敛为一个项目控件，并保持响应式
  密度；输入区不提供手动高度调整角标，而是随输入内容在布局边界内自动增减高度；不得为了参考
  视觉新增未接通的模型、Skill、版本或附件控件。
- Content Project 的一级侧边栏、左右 Agent/资源停靠栏和底部 Timeline 使用共享 resize
  primitive 实时调整尺寸；拖拽结束后把归属于具体面板的尺寸一次性提交给 Host-owned
  Workbench projection，避免 renderer 私有持久状态和逐帧 IPC revision 冲突。
- Home conversation 点击必须携带显式 Project/Workspace/Conversation identity：切换正确的
  Project View 后，等待 Agent conversation catalog 与 Tab state 水合，再激活目标 conversation；
  不得回退当前 active conversation。进程重启后，Agent bootstrap 使用 Host-only 持久化 locator
  惰性重连 workspace，并校验稳定 workspace identity。
- 保留 P1.6 对具体 GenerationJob/Quality Desktop port 的所有权；P1.3 不创建 Desktop
  Job runtime、通用 Task authority 或领域执行 fallback。
- 删除或 poison Desktop 可命中的 VS Code command、active editor/workspace、
  `vscode.Webview`、legacy `AgentSession`、demo/mock success path。
- 增加 producer/consumer、identity/revision/route coverage、renderer reload、multi-window、
  cancellation/disposal、Agent evaluation 与 Electron functional validation。

## Capabilities

### New Capabilities

- `desktop-agent-home-integration`: 定义 Desktop Agent composition、完整 route coverage、
  Conversation/Activity projection、Home/Content Project UI、恢复与 canonical-path 验收。

### Modified Capabilities

无。现有稳定 specs 未定义 Desktop Agent runtime；本变更复用 P1.2 Shell contract 和当前
Agent canonical contracts，不改变现有媒体、Entity 或 Preview requirement。

## Impact

- Agent contracts/runtime：`packages/neko-agent/packages/agent-types`、
  `packages/neko-agent/packages/agent`。
- 现有宿主 adapter：`packages/neko-agent/packages/extension`、`apps/neko-tui` 的
  producer/consumer 路径与回归测试。
- Agent UI：`packages/neko-agent/packages/webview` 的完整 Root 与 Host runtime adapter。
- Desktop composition：`apps/neko-desktop` main/preload/renderer/shared bridge、
  Shell domain capability、Home Activity/Attention 和生命周期。
- 共享表现层：复用 `@neko/shared/theme` token 与 `@neko/shared/i18n` core/React binding；
  Desktop 只拥有 Shell 域翻译 bundle 和 Electron theme compatibility adapter。
- 用户数据：复用用户级 conversation catalog、Pi Session JSONL 与 CredentialStore；
  不复制 transcript、secret、trust state 或 workspace facts，不引入双写或自动迁移。
- 依赖：不新增第二套 Agent/provider/runtime framework；若需要 Node/Electron 实现，只通过
  现有 Host ports 或 Agent owning package 的窄 adapter 注入。
