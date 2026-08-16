## Why

Electron Desktop 的 Agent 入口在冷启动、首次挂载和项目主面板状态下出现一组相互放大的回归：最近会话延迟出现、Agent 初始化串行卡顿、portal 组件透明、会话事件未进入可见 Tab，以及 Chat + Main 布局不可选。首轮修复只证明了样式源码、固定 Tab 和空 Main placeholder 的局部契约，真实 Electron 截图仍显示透明 Popover、空白执行中会话和 `desktop-canvas-not-mounted`。这些问题破坏了 Desktop 唯一宿主的核心会话与创作路径，需要以运行态 computed style、跨 realm 会话投影和真实 Main View owner 一次性恢复。

## What Changes

- 让 Desktop Agent Home 在窗口首次快照前读取所有已登记 Project workspace 的持久会话目录，不再依赖某个 Project 已经打开或 Agent runtime 已经 attach。
- 用户提交新消息时，当前 Conversation viewport 回到 follow-tail，确保本轮用户消息、执行进度和流式输出持续可见；用户在无新提交时主动滚动到旧消息仍保留 detached 语义。
- Workspace 文件被外部删除时，对应的干净 Workbench 文档 View 由 owning runtime 自动关闭；存在未保存内容时保留 View 并显示局部失效/冲突诊断，不静默丢弃用户数据。
- 让 renderer 启动门禁预加载 Agent UI chunk，具体 Project/View bootstrap 仍按 owner 在
  Agent Surface 挂载时请求，并保证 Host 事件订阅先于子组件发出的初始化请求。
- 为 Desktop portal surface 提供由 `@neko/ui` primitive 和 Desktop theme contract 共同拥有的稳定、不透明背景，并在生产 renderer 的 portal DOM 上验证最终 computed style。
- 让 Agent 全局错误与当前会话错误通过 package-owned portal 提示层绘制，不再被 Workbench Dock/Main 的裁剪边界截断；隐藏 Tab 不得把诊断投影到窗口层。
- 保证创建、恢复和发送会话时，tabless pending send、Tab state、optimistic user message 与 authoritative Timeline projection 按显式 conversation identity 进入同一可见 runtime；pending send 只能在 owning conversation 已持久接收消息后消费。
- Project 首次打开或恢复到没有 Main View 时，由 Host workbench owner 打开 canonical Workspace Canvas `neko/boards/workspace.nkc`；当前会话中用户关闭最后一个 Main Tab 后则显示不含失败 diagnostic 的显式空状态。
- Character/World 只作为精确创作目标进入 Secondary Main，不得替换工作区默认的 Board 或空状态；关闭特殊目标后必须恢复原 Primary Main，独立角色库也不得继承先前 Project authority 或资源栏。
- Desktop 启动恢复若发现持久 Workspace Scene 与当前 Project presentation 属于不同 Workspace，只局部重置失配 Scene 并保留精确 Project Tab/Board，同时投影可观测 warning；不得让非 authoritative presentation 阻止应用启动。
- 将项目 Resource Browser 作为独立 Workbench Main View 打开、聚焦、关闭和恢复；一级导航只发出 open/focus intent，不再把 Resource Browser 作为 project dock owner。
- 修复共享 resize primitive 在 React StrictMode effect 重放后误判为已卸载的问题，保证侧边栏、Dock、Main split 与 Timeline 的拖拽提示状态在指针会话结束后清除。
- 修正 Desktop Agent 与 Resource Browser Dock 的主题作用域，使三个 Workbench 主区域统一使用纯白 Main surface；同时消除 Agent 对话区与输入区的分区底色，并去除“资源管理”Dock 内重复的 package 标题栏。
- 精简 Home 应用一级侧栏的品牌 chrome，使标题行只显示可交互的 `OpenNeko` 文字且不再渲染品牌或折叠图标；同时让右侧 Agent 创作入口在可用主区域中居中展示。
- 收敛 Home Agent 入口标题 chrome，移除标题前重复的 Agent 图标，并让标题与副标题共享居中文本轴；任务与模板功能图标继续保留。
- 将 Agent 运行状态投影到所属会话的 transcript 时间线，复用既有 thinking、Tool Call、Process Record 与 streaming message 展示；移除 composer 上方独立的“思考中/执行中”状态条。
- 让 active Turn 的权威 Agent state snapshot 在 submission receipt 可消费前有序发布，并把当前处理状态、耗时和默认可见发送时间绑定到最新用户消息；排队消息继续只由 composer queue 展示，但逐项显示等待状态与创建时间。
- 保证已提交的用户消息在 optimistic commit、Host/Timeline 投影、完成与恢复期间持续保留，并让全部 transcript 记录共享与 composer 对齐的居中最大宽度内容轨道。
- Desktop 工作区 Agent 不再展示 package-owned 角色对话 Header 入口；角色会话的发起归属工作区资源管理中的实体管理动作。
- 让只有 Pi catalog/context、尚无 first-submit lifecycle record 的既有会话按原 identity 恢复，
  bootstrap 不再把 lifecycle-only initial message 当成所有会话的前置条件。
- 让持久 Pi transcript 与实时 Timeline 通过 turn 的持久 transcript identity 汇合，完成后只展示一条
  assistant 记录；禁止按文本内容去重。
- 把一次可见真实 API 首发扩展为隔离 Electron 全流程：创建与切换会话、重启恢复、记录去重、
  工作区资源/实体恢复和 EPUB 按需加载均通过真实控件验收。
- 收敛 Agent connection replacement 生命周期：业务消息继续要求 exact active Scene，旧 connection
  仅可释放自己创建的 projection attachment；preload 丢弃已退休 connection 的迟到事件且不污染
  当前会话，未知 connection 仍 fail-visible。
- 保留缺失 canonical context、owner 冲突或所属 Project 失效的历史会话与 Project 展示，但将其
  投影为明确不可用项；主导航不得打开它们，Main/package service 也必须在读取会话 context、恢复
  Workspace 或写入 Scene 前拒绝。删除会话和移除最近 Project 仍作为显式人工清理操作保留。
- Desktop 功能验收必须把 HOME、全局 SQLite、Electron userData 和 Workspace 全部放在同一个
  临时 fixture root 内；隔离条件不成立时在打开任何数据库前失败，不得读取或写入用户数据库。
- 将“未知 Shell/Application Settings 元数据已原样保留”收敛为每次 Renderer 启动只出现一次的
  非阻塞通知；通知自动消失并可手动关闭，Scene/Project 切换不得让它重新出现。数据拒绝、运行错误
  和失效记录诊断继续保持 fail-visible，不得被同一超时隐藏。
- Project catalog 在开放导航前读取并校验 canonical `neko/project.json` identity；缺失、损坏或与
  registry identity 冲突时保留 Project 并投影为不可用。失效会话的显式删除通过 Agent 全局
  conversation authority 完成，不得为清理操作解析或 attach 已失效的 Workspace。
- 将无法按当前 contract 解析的单条 Window presentation 局部隔离为本次启动 diagnostic，并在
  canonical Shell commit 中只保存有效 Window；不得把失效 Window 原始记录重新写回，导致每次启动
  重复提示。Project、Conversation、文件和合法 sibling Window 保持不变。
- 让 Agent composer 的提交契约按 exact submission identity 等待 Host 完成 preflight，并仅在
  `startTurn()` 已创建 authoritative queue/turn identity 后返回受理；bridge、preflight、enqueue、
  conversation 切换、重复提交、缺失 owner 或输入解析失败时保留原草稿、附件、引用与 context，禁止
  把未发送输入清空成成功状态。新会话 pending send 也只在真实提交被受理后消费。
- 让 runtime 释放 queued composer item 进入 active turn 时投影 exact `releasedItem` 与同序 queue
  snapshot，使同一用户消息及其附件、Canvas/context payload 与应用内 file reference 从排队态连续转为
  transcript 消息；不得用空 snapshot、pending count、文本匹配或等待最终 transcript 回写填补可见性。
- 让 Pi live Timeline 与持久 transcript 使用同一个 canonical ToolResult projection，完整保留 stable
  `ContentLocator`、attachments、perception cards 和 artifact transfer；历史 Conversation 消息也必须经过
  Host resource authorization 后再进入 Webview，授权失败显示 item-local diagnostic，禁止退回 raw path、
  文件名猜测或无诊断占位。
- 让 `ReadImage` 和 Workspace Board source artifact identity 从 canonical locator 派生，避免不同文档中的
  同名图片产生重复 artifact identity 并阻断整个 turn 的 Canvas 交付；单个无效资源仍按 owning batch
  fail-visible，不得伪装成同步成功。
- 将待处理 Tool approval 从历史 Tool Call 的内联按钮提升为 composer 上方的 conversation-scoped
  审批面板；历史记录继续显示等待状态和 Tool 事实，但不保留第二套可操作审批入口。
- 让 Desktop preload 对 Canvas projection event 采用单调递增的完整快照语义：精确 identity 校验后接受任何
  `sequence` 严格大于已投递序列的事件，即使发生序列跳号；陈旧/重复序列和陌生 identity 仍被拒绝，避免
  terminal Agent 交付在已打开 Canvas 上丢失。
- 保持已打开 Canvas 的 package-owned viewport 在 document-only 完整快照期间稳定：同一文档只执行一次
  viewport seed，未变化的 Host presentation 不重复覆盖本地 pan/zoom，viewport snapshot policy 也不得因节点
  或连接更新重建并触发伪 `close` flush。
- 将已挂载 Media Library 内容的 durable identity 统一为规范化 workspace-relative
  `WorkspaceFileContentLocator`（`neko/assets/<libraryName>/<relativePath>`），删除把该投影路径判为非
  durable 的规则及为此流程持久化 `MediaLibraryContentLocator` 的特殊转换；挂载关联、校验、恢复与授权收敛到
  mount manager 和 Host path guard，普通文件与挂载文件共享同一内容读取路径。

## Capabilities

### New Capabilities

- `desktop-agent-shell-reliability`: 定义 Desktop 冷启动 Agent catalog、Agent Root 初始化、会话可见投影、portal 主题表面和 Chat/Main 布局的可靠性要求。

### Modified Capabilities

无。

## Impact

- `apps/neko-desktop` Main AppHost、Shell service、preload/renderer Agent adapter、Workbench renderer 与 Desktop CSS。
- `packages/agent/runtime` 的持久 conversation catalog 读取边界。
- `packages/agent/runtime` 的 lifecycle initial-message projection 与 session bootstrap history 合并契约。
- `packages/agent/webview` 的 Root 订阅时序和 conversation/tab 投影测试。
- `packages/agent/webview` 的 MessageList 执行活动投影、工具记录去重和运行态可访问性测试。
- `packages/agent/webview` 的用户消息持久可见性、统一 transcript rail，以及 Desktop Dock Header action 可见性契约。
- `packages/ui` 的 Popover surface contract、共享 resize lifecycle 与样式测试。
- Desktop theme scope 对 Agent/Assets package Root 的 surface token 投影与 production computed-style 验收。
- Desktop Workbench Main View contract、Canvas/Assets 组合、聚焦测试、真实 Electron 验收和相关架构/状态文档。
- Agent Home unavailable contract、Desktop Primary Sidebar 禁用态、Scene transition 拒绝路径和
  功能验收数据库隔离门禁。
- Desktop 启动通知生命周期、Workspace identity catalog inspection，以及不依赖 Workspace runtime
  的 Agent conversation 清理入口。
- Desktop Shell Window presentation 的逐项隔离、canonical 持久化和应用重启验收。
- Agent composer send-consumption contract、pending approval presenter、composer-adjacent approval surface
  及其 Webview/Electron 验收。
- Agent ToolResult live/history projection、Desktop resource authorization、ReadImage perceptual identity 与
  terminal Workspace Board artifact delivery。
