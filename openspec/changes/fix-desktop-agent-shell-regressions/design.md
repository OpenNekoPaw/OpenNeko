## Context

Desktop Shell 在第一次窗口快照时已经拥有 Project catalog，但 Agent Home 当前只遍历已经创建的 `DesktopAgentWorkspaceRuntime`。因此持久 Pi catalog 中属于已登记 Project 的会话在冷启动时不可见，直到打开 Project 触发 `attachWorkspace`。

Agent Surface 又把两个独立的准备步骤串行化：renderer 等待 Main `getBootstrap` 后才开始 `lazy()` Agent Webview chunk。Root 挂载后，Host bridge 订阅使用 passive effect，而子级 `ConversationController` 也在 passive effect 中请求 conversation、tab、config 和 Skill snapshot。初始化响应存在订阅尚未建立的丢失窗口。真实用户数据表明最新空白会话已写入 catalog，但没有 Pi leaf 或 turn checkpoint，符合“new conversation 成功、pending send 因 config snapshot 丢失而未消费”的路径。

Workbench display menu 使用 Radix portal。首轮实现已把 semantic class 编入 production renderer bundle，但真实 Electron 仍显示透明表面，证明源码/产物字符串检查不足以验证 portal 的最终 token、层叠与实际窗口 bundle。布局菜单虽然允许空 Main 选择 `chat-main`，却只渲染 `desktop-canvas-not-mounted` placeholder；这与项目打开即进入创作 Canvas 的产品路径不一致。

Agent 全局错误与会话错误虽然使用 `position: fixed`，DOM owner 仍位于 Agent Dock 内。Workbench Dock、package panel、Agent workspace 和 Agent Root 都以 `overflow: hidden` 维护分栏、圆角和 resize 边界，导致超过窄 Agent pane 的错误提示在相邻 Resource Browser Main 前被裁剪。两处提示还复制了同一视觉结构，且隐藏 Tab 依靠祖先 `hidden` 抑制显示；直接改为 portal 而不绑定可见 Tab 会让已保留的隐藏会话重新向窗口投影错误。

Workbench 的侧边栏、Dock、Main split 与 Timeline 共用 `@neko/ui` 的 `useResizable`。该 hook 用 ref 阻止真实卸载后的 state update，但 effect 只在 cleanup 把 ref 置为未挂载，没有在 setup 恢复。Desktop renderer 本身运行在 React StrictMode 下；开发期 effect 重放后，仍然挂载的 resize owner 会被永久误判为已卸载，因此 pointerup 已完成尺寸提交和 `onResizeEnd`，却跳过 `setIsResizing(false)`，最终留下 `data-resizing="true"` 与持续可见的提示线。

Desktop light theme 已定义 `main=#ffffff`、`surface=#fafafa`、`surface-muted=#f3f3f2` 三层表面。创作 Main 使用纯白 `main`，Agent 与 Resource Browser 的外层 Dock 及 package Root 却分别读取 `surface` 或全局 `--neko-sideBar-background=surface-muted`，形成三个主区域底色不一致。Agent composer rail 还额外绘制顶部分隔线，Resource Browser 则在 Desktop Dock 标题下再次渲染 package 标题栏，进一步制造视觉割裂。全局 sidebar token 仍服务应用导航，不应为修复这两个 Workbench consumer 而改变。

Home 一级侧栏品牌行同时渲染 `N` 品牌块、`OpenNeko` 与面板图标，和下方已有图标导航形成重复 chrome。右侧 Agent launchpad 虽然横向居中，但依靠固定顶部 padding 定位，在高窗口中明显偏上。品牌行仍需保留 sidebar 展开/折叠能力，因此不能简单删除交互入口。

Agent launchpad 标题仍在独立的 raised icon tile 后显示“与 OpenNeko 一起创作”，但下方常用任务与模板已经提供足够的功能图标语义。标题图标不承担 action 或状态，仅重复装饰层级，并让标题、副标题的视觉轴偏向图标后的左对齐。

Agent Webview 同时渲染两份运行提示：MessageList 尾部的 thinking 气泡，以及 composer 上方固定的 `AgentRunStatus`。后者脱离 conversation scroll owner，并把 thinking、acting、streaming 压成一条通用文字；真实 Tool Call、Process Record 和流式 assistant message 已经在 transcript 中按发生顺序投影，因此固定状态条既重复又无法表达 Codex 式执行过程。

首轮 pending-send 测试直接向一个固定 `ChatWorkspace` 注入 request，没有经过 tabless composer、新 conversation、Tab runtime reconciliation、空 conversation/Timeline projection 和 visible realm replacement。真实截图中 Host 已投影“执行中”，而用户消息仍为空，说明执行状态和 optimistic message 落在了不同 owner 或 pending request 在 owning message commit 前被清除。

## Goals / Non-Goals

**Goals:**

- 冷启动首个 Shell snapshot 即展示当前 Project catalog 范围内的持久 Agent 会话。
- Agent chunk 与 Host bootstrap 并行，并保证所有初始化请求发出前 Host 订阅已建立。
- 新会话 pending send 穿过完整 tabless → conversation → Tab realm 路径，在精确 Tab/conversation runtime 上可见、只消费一次并进入 Pi turn；缺失 config 或发送失败保持 fail-visible。
- Desktop portal surface 在深浅主题下都有稳定不透明背景、边框和层级，并由 production renderer computed style 证明。
- Agent 全局错误和当前会话错误在 Desktop Workbench 与 standalone Agent 中都进入 renderer portal 层，保持窄窗口可读且不从隐藏 Tab 泄露。
- Project 没有 Main View 时由 Host 打开 canonical Workspace Canvas，不建立 renderer 私有文档事实。
- 项目 Resource Browser 以独立 Main View identity 打开/聚焦/关闭/恢复，不再通过 Resource Dock 展示。
- 共享 resize primitive 在 StrictMode effect 重放和真实卸载两种生命周期下都保持正确的 pointer session 与视觉反馈语义。
- Agent、创作 Main 与 Resource Browser Dock 统一使用 Desktop Main surface；输入控件、弹层和应用导航仍使用各自语义 token。
- Agent composer rail 与对话区共用主表面且不绘制区域分隔线；Resource Browser 的 Desktop 嵌入模式只显示一层“资源管理”Dock chrome。
- Home 一级侧栏品牌行只呈现 `OpenNeko` 文字，并让该文字继续承担可访问的展开/折叠操作。
- Home Agent launchpad 在主区域有足够高度时垂直、水平居中；低高度与窄窗口仍可滚动并从顶部安全展示。
- Home Agent launchpad 标题不渲染无交互的图标 tile，标题与副标题在同一居中轴上展示；功能入口图标保持不变。
- Agent 执行活动只在所属 conversation transcript 内展示；真实 thinking 内容、工具调用、生成记录和 streaming assistant message 继续使用既有 canonical projection，运行等待期仅显示不含“思考中”文案的轻量活动项。
- conversation 切换、late attachment 与 state snapshot 恢复时只投影目标 conversation 的活动；idle 后移除临时活动项，不把运行态写成持久伪消息。

**Non-Goals:**

- 不扫描或恢复已经从 Desktop Project catalog 移除的 workspace。
- 不预先创建 Pi conversation runtime、执行 lease、provider/model runtime 或加载 Skill 来生成 Home 列表。
- 不新增第二份 transcript、conversation metadata 数据库或 renderer 持久事实。
- 不删除旧用户会话、lease 或历史宿主数据。
- 不复制 Canvas document store、Resource Browser state 或 package-owned Root。

## Decisions

### 0. Composer 只在 authoritative submission 被受理后消费草稿

普通 conversation submit 使用 submission-scoped 异步 receipt。Renderer 为 exact draft 发起一次提交，
Desktop transport 等待 controller 完成 configuration/context/entry/capability preflight，并仅在
`AgentWorkspaceRuntime.startTurn()` 已创建 exact turn 与 queue item 后返回 accepted receipt。receipt 携带
transport request、Conversation、turn 与 queue item identity；它不表示 provider 或 turn 已成功完成。

`useChatActions.handleSend()` 只有收到 owning submission 的 accepted receipt 后才提交 optimistic user
message、清空文本、附件、引用与 context，并记录 dedup。bridge 断开、IPC 拒绝、preflight、附件处理或
enqueue 失败都拒绝同一个 Promise，保留原 draft 并投影 owning diagnostic。conversation switching、重复
点击、空输入、缺失 creator、command/Skill 解析失败同样不消费 draft。pending first submit 只有在 exact
Tab/Conversation 的 accepted receipt 后标记 consumed；不增加 renderer-local retry、第二消息队列或
queue snapshot 充当模糊 acknowledgement。

command/Skill invocation 继续使用其 exact input catalog contract；本次不把普通 conversation submit 的
receipt 伪装成所有单向 Host message 的通用成功语义。

### 0a. Queued composer item 释放时原子投影为 transcript user message

`AgentWorkspaceRuntime` 在 queue item 从 pending 移入 active turn 的 owning boundary 发出 exact release
observation。controller 将 `releasedItem` 与释放后的 authoritative queue snapshot 作为同一 Host event
投影；Webview 以 queue item identity 将排队镜像替换为普通 user transcript message，并从该 item 的
canonical draft 恢复附件、Canvas/context payload 与 file reference。file reference 继续携带 Host 授权的
`ContentLocator`、media type 与 thumbnail projection，不从 raw path 或 active Workspace 推断资源。首个
立即启动的 turn 和后续 drain 的 turn 使用同一 release 路径，conversation 切换后仍只更新 exact
conversation 的 render coordinator。

不以 pending count 差值、空 snapshot、文本相等、active/current Conversation 或最终 Pi transcript 回写
推断释放或补齐资源。release event 丢失属于可见错误，不能由 renderer fallback 或第二事实来源掩盖。

### 0b. ToolResult 资源事实跨 live、history 与 terminal delivery 保持单一 canonical shape

Pi Tool adapter 的 `details` 保存 OpenNeko `ToolResult` 的 durable structured clone；给模型看的 `content`
只负责 provider-visible text/image，不是产品展示或 Canvas 交付的事实来源。live Timeline 与持久 transcript
history 必须通过同一个 ToolResult projector 解包 `success/data/error/attachments/perceptionCards/
backfillDiagnostics/artifacts`，不得把整个 envelope 塞入 `result.data` 后交给 Webview 猜测，也不得只保留
attachments 而丢失 perception cards。

所有进入 Webview 的 ToolResult，无论来自 live projection attachment、`activeConversation` 还是
`conversationSnapshot`，都通过同一个 Host resource display projector 使用 stable `ContentLocator` 或
runtime-owned `ContentRepresentationHandle` 重新授权为短生命周期 preview descriptor。历史消息的授权 lease 绑定 exact
connection 与 Conversation identity；授权失败在对应资源上附加 diagnostic，不回退 raw path、`content:` URI、
文件名推断或静默文件占位。

`ReadImage` 的 perceptual asset identity 从 canonical locator 或 runtime representation handle 派生，可附加可读 label，
但同名文件不得决定 identity。terminal creator-visible collector 对 source artifact 使用同一 locator-derived
source identity，不信任 Tool-local display assetId 作为 Canvas relation identity；这样既保证新结果唯一，也让
仍保留旧 display assetId 的 durable ToolResult 在再次进入 canonical collection 时不会制造同批冲突。

不在 turn completion 后扫描 Pi history 自动重放旧交付，因为这会形成恢复/重导入平行路径并可能修改用户已编辑
Board。交付仍只发生在 owning terminal turn；失败必须通过 conversation diagnostic 和 Host diagnostic 明确暴露。

### 0c. Pending Tool approval 是 conversation projection，操作面板属于 composer rail

`@neko/agent-webview` 从当前 conversation 的 canonical message/content-block projection 收集全部
`pendingConfirmation` Tool Call，并保持 transcript 顺序。composer 上方渲染一个有界、可滚动的审批
面板，每个请求继续通过既有 `confirmTool(conversationId, toolCallId, decision)` Host contract 提交。
Tool Call 历史位置只展示 Tool identity、摘要和等待状态，不再渲染允许/拒绝按钮，从而保证一个业务
意图只有一个可操作 UI 路径。

审批面板不复制 approval state、不改变 Tool contract，也不把 conversation/task ownership 提升到
Desktop Shell。conversation 切换或 projection 更新会自然替换面板；缺失 exact conversation identity
时面板不得提供可执行按钮。多条并行 pending approval 全部保留，面板通过稳定最大高度滚动，不能只
显示 latest/active fallback。

### 1. Pi authority 提供只读 catalog reader，Desktop AppHost 提供 workspace scope

`packages/agent/runtime` 增加只读 catalog reader，只投影 `PiConversationCatalogRecord`，不创建 `PiConversationRuntime`、lease、session reader 或 model registry。Desktop 初始化从 Shell state 读取已登记 workspace identity 集合，并在第一个窗口 claim 前将该 scope 注入 Agent AppHost。

`readHomeProjection()` 以 scope 内的持久 catalog 为基础，再用已 attach workspace 的实时 projection/active run 覆盖 attention。这样 Home 与执行 runtime 共享同一 Pi catalog authority，又不靠打开所有 Project 产生重型 runtime。

不选择“启动时 attach 所有 workspace”，因为它会把 Home 列表读取和 Project path/stat、provider/model composition、runtime 生命周期耦合，并加重启动卡顿。不选择复制到 Shell state，因为这会形成第二份可漂移 catalog。

### 2. Renderer 启动预加载 Agent module，adapter identity 仍由 View bootstrap 决定

Desktop renderer 在 sender-bound application bootstrap、settings snapshot 和 Agent Webview
module 都准备完成后才挂载 React Root。Agent module loader 拥有单一缓存 promise；启动门禁与
后续 Surface 使用同一个 promise，不重复 import，也不在首次打开 Agent 时重新等待 chunk。
module 加载失败阻止 renderer 被描述为 ready，并通过现有启动错误边界 fail-visible。

Agent Surface 挂载后才请求精确 Project/View/bootstrap，并用 owner identity fence 拒绝过期
完成；adapter、connection、subscription 和 presentation state 继续是 View scoped。应用启动
不得 attach 全部 workspace、创建 conversation/session/provider runtime 或把 module readiness
当作会话 owner。

### 3. Root 在子组件 passive effects 前建立 Host 订阅

`AgentWebviewRoot` 使用 layout effect 建立 adapter subscription，并在卸载时释放。子级初始化请求仍由 `ConversationController` 拥有，但必须在 subscription 可接收事件之后运行。聚焦测试用同步响应 adapter 证明 `subscribe` 发生在第一次 `send` 之前，避免依赖 IPC 通常较慢的偶然顺序。

pending send 由 controller 按 request identity 绑定到 Host 创建的 conversation，再交给该 conversation 的 Tab runtime。测试必须覆盖 tabless submit、`activeConversation`/`tabState` 顺序、空 `conversationSnapshot`/Timeline frame、config snapshot 和 realm replacement。request 只有在 owning render coordinator 已包含 optimistic user message且 Host `sendMessage` 已接受提交后才可消费；普通 Tab 打开/切换不能清除正在创建的 owning pending request。

### 4. Popover primitive 提供可运行态验证的 semantic surface

`@neko/ui` Popover 使用稳定 semantic class，基础 CSS 明确定义 background-color、opacity、foreground、border、shadow 和 z-index。Desktop 通过现有 Desktop theme token 投影最终不透明颜色，业务菜单只定义内部排版。验收读取 production renderer portal content 的 `getComputedStyle()`，要求 background alpha 为 1、opacity 为 1，且实际加载的 stylesheet/bundle 与本次 package identity 一致。

不在每个业务菜单复制背景，也不依赖消费者 Tailwind content scan 恰好包含 `@neko/ui` 源码。

### 4a. Agent 诊断内容由 package 拥有，绘制进入 renderer portal 层

`@neko/agent-webview` 提取唯一的诊断提示组件，继续由 Agent controller/session state 决定标题、正文、生命周期和 `role="alert"` 语义，但通过 `react-dom` portal 直接绘制到当前 renderer 的 `document.body`。该组件不是 Desktop Shell notification 状态 owner，也不新增跨 runtime message；standalone Agent 与 Desktop 组合使用同一 canonical path。

Workbench pane 的 `overflow: hidden` 是真实布局边界，不能为允许提示越界而放松。提示宽度同时受 `360px` 和 viewport inline size 约束，并允许长 diagnostic 断行。会话提示只在 owning `ChatWorkspace.isVisible` 为真时创建 portal；保留但隐藏的 Tab 仍持有自身诊断状态，却不能向窗口层投影。全局提示由当前 Agent Root 的 `ConversationController` 唯一投影。

不把两个提示分别改成 `overflow: visible` 或继续提高局部 `z-index`，因为这既无法形成窗口级 ownership，也会破坏 Dock 裁剪契约。不把 Agent 文案和生命周期提升到 Desktop Shell，因为 Desktop 不应复制 package-owned error state。

### 5. Host workbench 默认打开 canonical Workspace Canvas

Project attach/restoration 由 `DesktopShellService` 检查当前 project-owned Main Views。若没有可恢复的 Main owner，Host 通过现有 `openOrFocusMainView()` 创建一个指向 `neko/boards/workspace.nkc` 的 Canvas View，并选择 `chat-main`。Canvas runtime 继续负责缺失 Board 的空文档加载和首次保存；renderer 不创建或写入 `.nkc`。已有 Canvas/Preview/Cut/Resource Browser View 按持久 workbench 恢复，不重复创建默认 View。

Project 已 attach 后，用户可以关闭最后一个 Main Tab；该当前会话状态由 renderer 显示为正常的空 Main surface，不附加 Canvas diagnostic，也不立即重建默认 Canvas。下一次 Project attach/restoration 仍按上述 Host 规则恢复 canonical Workspace Canvas。缺失 Canvas capability 或 Canvas 加载失败只针对实际 Canvas View 显示明确 diagnostic，不回退到伪 Canvas。

CharacterProject 与 WorldProject 是 Workspace 内的特殊 authoring target，不是 Workspace 默认 Main，也不改变 Workspace kind。打开这类 target 时，Workbench 保留 primary Main 中的 canonical Board；没有 Content Project 的独立目录 authority 则保留显式空 primary Main，并把精确 Character/World authoring View 放入 Secondary Main。Scene 必须分别按稳定 primary/secondary Group 投影两个 Surface；关闭特殊 target 后折叠 Secondary Main，恢复原 Board 或空状态，不保留隐藏 authoring Root。旧 presentation 若把特殊 target 放入 primary，下一次显式打开该 target 时按同一 canonical 规则局部重排。

应用启动恢复是 presentation reconciliation boundary。若持久 Scene 的 Workspace scope 与按当前
`activeTarget` 恢复出的 Project-owned Main Views 不一致，说明 Window presentation 曾被非原子写入或
来自已替换的旧 UI 状态。Host 只重置该 Scene 为 fresh Entry presentation，保留当前 Project 的合法
Tab presentation、canonical Board 与其他 Project presentation，并投影 owner 为 `workspace` 的
`desktop-presentation-reset` warning。实时 Workbench update 仍要求 Scene/Layout 精确匹配并 fail-visible；
不得把启动恢复规则变成通用 fallback 或吞掉合法运行期 contract 错误。

### 6. Resource Browser 是 Workbench Main View

项目 Resource Browser 复用现有 `DesktopResourceBrowserSurface` 和 Assets-owned Root，增加 `resource-browser` Main View kind 与稳定 project/workspace owner identity。一级导航的资源入口只构造/聚焦该 View，通过现有 workbench CAS 更新；Main group、Tab、close、focus、split 和恢复继续由通用 Workbench contract 拥有。

Resource Dock 不再是项目 Resource Browser 的成功路径。旧的 dock presentation 只能在 schema 迁移时被拒绝或归一化为隐藏，renderer 不再挂载第二份 Resource Browser Root。

### 7. Resize mounted guard 由 effect setup/cleanup 对称拥有

`useResizable` 继续作为所有 Desktop resize surface 的唯一 pointer session owner，不在 Desktop Sidebar、Workbench Dock 或业务组件中复制清理分支。它的 effect setup 必须把 mounted guard 恢复为 `true`，cleanup 才置为 `false` 并清除 animation frame、pending size 与 pointer identity。这样 React StrictMode 的 setup → cleanup → setup 探测保持幂等，而真实卸载仍禁止后续 state update。

不通过移除 resize indicator CSS 或给某个 Sidebar 单独加 pointerup handler掩盖问题，因为错误状态由共享 hook 产生，并影响所有使用者。回归测试必须在 StrictMode 中走完整 pointerdown → pointerup，断言 `onResizeEnd` 只执行一次且 `isResizing` 恢复为 false。

### 8. Desktop composition scope 统一 Workbench Main surface

Agent 和 Resource Browser 继续由各自 package Root 拥有内部样式和语义 token；Desktop composition 在 `.desktop-agent-root` 与 `.desktop-resource-browser-root` 边界把 `--neko-sideBar-background` 重投影为 `--neko-desktop-main`。Agent 的 `desktop-dock` presentation 尊重该组合边界，而不是再次硬选 `--neko-desktop-surface`；composer rail 继承同一背景并将区域分隔线设为透明。这样三个 Workbench 主区域在 light theme 下统一为 `#ffffff`，但输入控件、卡片、菜单和真实应用导航仍由既有语义 token 控制。

Resource Browser 增加显式 Desktop 嵌入展示模式。standalone 模式保留 package 标题；Desktop Dock 模式由 Desktop shell 渲染唯一的“资源管理”标题，package 将新增/刷新操作合入搜索工具栏，不再渲染第二层“资源”标题栏。该 prop 只控制 chrome composition，不改变资源状态、搜索或 Host contract。

不修改全局 `--neko-sideBar-background`，因为应用一级导航、真正的 Sidebar 及其他 Webview 仍需要 muted 层。不在 Agent/Assets package 内硬编码 `#fafafa`，因为暗色主题必须继续从 Desktop token 自动解析。单元契约测试锁定 composition scope，真实 packaged Electron 场景读取两个 package Root 的 computed background。

### 9. Home 品牌与 launchpad 使用最小 chrome

`DesktopApplicationBrand` 提供纯文字 action 变体，Home/Project 的 application primary sidebar 使用该变体：隐藏 `brand-mark`，不再传入独立图标按钮，并由 `OpenNeko` 文字按钮调用现有 `togglePrimarySidebarWorkbench` 路径。Settings 等非一级侧栏 consumer 保留默认品牌展示，避免用全局 CSS 隐藏所有品牌资产。

`.home-overview` 作为 Home Main 的唯一 launchpad 布局 owner，通过 grid 居中 `.home-start`，不修改 composer、快捷任务或模板卡片的内部 ownership。窄宽度继续使用既有宽度 media query；低视口高度切换为顶部对齐，避免居中造成上方内容不可达。

Agent 标题层只删除 `home-launchpad-heading-icon` 节点及其专属 CSS，`.home-launchpad-heading` 改为单列居中文本容器。`StorylineIcon` 继续用于“规划创作”等真实 action，不因标题去装饰而修改共享 icon 能力或任务结构。

### 10. Agent 执行状态由 conversation transcript presentation 投影

`AgentStateRuntime` 继续是 authoritative run phase owner，Webview 不复制状态机，也不把 phase 写入 transcript。`ConversationController` 仍按 conversation identity 选择状态快照，并把目标会话的 `AgentState` 交给 MessageList presentation。MessageList 在没有可代表当前活动的 streaming assistant message 或真实工具/process item 时，才在虚拟列表尾部增加临时 execution activity item。

### Sent-message ownership and transcript rail

用户提交消息后，`ConversationRenderCoordinator` 是一个已连接 Webview realm 内的可见记录 owner。普通会话中，带稳定 pending identity 的本地 commit 必须跨越随后到达的空 Host snapshot、仅包含 assistant Timeline 的 projection 和完成事件；只有 authoritative user history 明确确认同一次提交后才能替换 pending record。

Entry Draft 的首轮提交会把 launch Surface 从 draft connection 替换为 session connection，因此不得尝试跨 owner 保留旧 Webview state。`AgentConversationLifecycleRecord.initialMessage` 已在 Surface 切换前持久提交，Agent runtime 将它作为 session bootstrap 的 initial user-message projection；`AgentControllerComposition` 在 Pi history 尚未包含同一用户记录时合并该 projection，history 确认后由 canonical Pi record 替换。Desktop Main 只校验 Scene/lifecycle identity 并传递 package-owned projection，Renderer 与 `ChatWorkspace` 不得通过独立 transcript 或完成后 fallback 重建用户消息。

`MessageList` 在每个虚拟 item 内提供统一的 `agent-transcript-rail`。该 rail 使用与 composer 一致的 `820px` 最大宽度和受控的窄屏 inline gutter；用户消息在 rail 内右对齐，assistant、thinking、Tool Call、Process Record 与临时 execution activity 使用同一横向坐标系。虚拟列表仍拥有滚动、测量和绝对定位，rail 只负责内容宽度，不成为新的状态或滚动 owner。

Desktop Dock 已把会话导航交给 Desktop 一级侧栏，因此 Agent Header 的 Tab、新建、历史和角色入口必须作为同一组 package-owned navigation chrome 隐藏。角色实体的发现与发起属于工作区 Resource management 的实体管理交互，不在工作区 Agent Header 再保留平行选择入口；默认 standalone Agent 继续保留现有角色选择能力。

thinking 等待期使用无“思考中”文字的轻量动态活动；acting 阶段若已有同轮 Tool Call 或 Process Record，则只显示真实记录；streaming 阶段由正在增长的 assistant message 表达，不增加第二条状态。进入 idle 后临时 item 消失，已完成/失败的工具与生成记录按既有 Timeline projection 保留。固定在 composer 上方的 `AgentRunStatus` 和其独立 elapsed timer 被删除。

该方案复用 `message-list-presenter`、`ThinkingBlock`、`ProcessRecordsGroup`、`ToolCallDisplay` 与 streaming message，不新增 renderer-owned执行历史、第二套 design system 或从文本猜测出的完成状态。真实 Electron 验收必须在 provider 回答完成前观察 transcript activity 或真实 process record，并同时证明 `.agent-run-status` 从未出现。

## Risks / Trade-offs

- [全局 catalog 包含历史非 Desktop workspace] → AppHost 必须使用 Shell Project catalog workspace scope 过滤，未知 workspace 不投影到 Home。
- [只读 reader 与 workspace authority 同时打开 SQLite] → 继续使用 WAL/busy timeout，并让 AppHost 明确 dispose reader；测试覆盖多 reader 生命周期。
- [layout effect 在 SSR/test 环境告警] → Agent Root 本来只在 browser/Electron renderer 运行；Vitest jsdom 覆盖订阅顺序和 cleanup。
- [optimistic message 与 Timeline frame 重复] → 继续按稳定 message identity merge；测试断言 canonical Timeline frame 替换/合并而非追加副本。
- [通用 Popover 样式影响其他消费者] → 使用现有 token contract、primitive 聚焦测试和 production computed style，不加入业务菜单专属背景。
- [默认 Workspace Board 尚不存在] → Canvas runtime 只在内存中加载空 Canvas，首次真实保存才创建 canonical 文件，不由 Shell 伪造内容。
- [Resource Browser 从 Dock 迁到 Main 影响恢复] → Workbench parser 显式迁移/拒绝旧 presentation，并用路径级测试证明 renderer 只挂载 Main View Root。
- [mounted guard 修复导致真实卸载后更新] → setup/cleanup 对称维护 guard，cleanup 同时取消 frame、丢弃 pending size 与 pointer identity；StrictMode 和真实 unmount 分别覆盖。
- [Main surface scope 破坏 package 内部层次] → 只重投影 package 已有 sidebar semantic token并消除 composer 区域分隔；input/menu token 保持不变，并在 Agent、Resource Browser 两个真实 Root 上读取 computed style。
- [移除重复 Resource Browser 标题导致功能操作丢失] → Desktop 嵌入模式将新增/刷新操作合入搜索工具栏，并用可访问角色测试断言标题唯一且操作仍可用。
- [移除品牌图标导致 Sidebar 无法切换] → `OpenNeko` 文字本身保留现有 toggle action 和可访问标签，compact hover reveal 仍可恢复文字操作。
- [垂直居中导致低窗口内容顶部溢出] → 使用低高度 media query 切换为顶部对齐，并由真实 Electron 大/小窗口检查可滚动性。
- [标题去图标削弱任务辨识] → 只移除无交互标题 tile，常用任务和模板的功能图标继续由各自 action 拥有。
- [临时 activity 与工具/流式内容重复] → presenter 根据 authoritative streaming identity 和 transcript process projection去重；完成态只由既有消息/工具投影保留，activity 不持久化。
- [虚拟列表 activity 导致滚动跳动] → activity 作为普通估高 item 参与现有 follow-tail 逻辑；detached viewport 不以无 message owner 的临时 item 作为恢复锚点。

## Migration Plan

1. 先添加 catalog cold-start、Root 订阅顺序、跨 realm pending send、production Popover computed style、默认 Canvas、Resource Browser Main View 和 StrictMode resize lifecycle 红测。
2. 增加 Pi catalog reader 与 Desktop 初始化 scope，删除 Home 对“已 attach workspace 才可列出”的隐式路径。
3. 在 renderer 启动门禁预加载 Agent module，让 Surface 复用同一 promise，并调整 Root
   订阅时序。
4. 接入 Popover semantic surface、默认 Workspace Canvas、Resource Browser Main View、对称的 resize mounted guard 与 Desktop Dock surface scope，断开项目 Resource Dock 成功路径。
5. 运行受影响包测试/typecheck/build、Desktop package、quality gates 和真实 Electron 隔离场景。

回滚应整体恢复旧行为；没有持久 schema 或用户数据迁移。任何 catalog 读取失败必须阻止 Agent Home 被描述为成功空列表，并显示 diagnostic。

## Open Questions

无。Home 只展示当前 Desktop Project catalog scope，历史未登记 workspace 保留在 Pi authority 中但不出现在 UI。

## Follow-up decisions: persisted conversation convergence

Pi catalog/context 是既有会话 identity 与 owner 的 authority，first-submit lifecycle 只拥有新 Entry
Draft 的初始消息、配置和首次执行状态。Desktop bootstrap 先通过 exact context 校验 Scene owner，
再可选读取 lifecycle record；只有该 record 存在时才投影 lifecycle-owned initial message。仅有 Pi
catalog/context 的会话直接从 Pi transcript 恢复，不创建替代会话、不选择最近会话，也不伪造
lifecycle terminal。缺失或冲突的 context 继续 fail-visible。

Timeline 负责实时执行记录，Pi transcript 负责可重开历史。Pi turn checkpoint 完成后把该 turn 的
最终 transcript entry identity 投影到 completion metadata；Webview 按此 identity 用 Timeline 的丰富
内容替换对应 Pi assistant presentation，而不是追加第二条消息。相同文本的两个独立 turn 必须保持
两条记录；缺失或不匹配 identity 不得靠文本、时间邻近或当前 active conversation 猜测。

可见真实 API 场景继续使用隔离 HOME、SQLite、workspace 和真实 Entry composer。场景创建至少两个
会话，断言每次提交只出现一条 user/assistant 记录，切换后 transcript 隔离，重启后 exact conversation
和生成/Timeline 记录恢复。项目资源、Entity 与 EPUB 的 UI 检查由各 owning package scenario 提供，
聚合入口只顺序运行并收集 path-level evidence，不复制业务操作或引入测试专用产品 handler。

## Follow-up decisions: connection-owned projection cleanup

Agent user/business messages and projection control have different authorization lifecycles. `sendMessage`,
configuration mutations, conversation mutations and automation operations remain bound to the exact active
Agent Surface. Projection discovery/attach/acknowledge/detach are authorized by the sender-bound Window/renderer
identity, the exact bridge-known open connection and the attachment request identity that connection created, so
a hidden running Surface can acknowledge its own projection without using the visible Surface identity.
Visibility replacement MUST NOT authorize user/business operations from another Surface.

When an explicit Surface close/delete/archive retires a connection, Desktop Bridge immediately disposes its
effects and abandons Host-owned projection resources, then retains only an identity tombstone until the old
renderer adapter sends its expected detach or the Window/renderer lifecycle ends. Same-View bootstraps for
different open conversations coexist and MUST NOT retire each other. An exact detach against a tombstone is an
idempotent acknowledgement of already completed Host cleanup; it does not revive effects or route through
another connection. Unknown, forged, wrong-endpoint and ordinary retired-connection messages remain
fail-visible. This keeps resource cleanup connection-owned without delaying Host disposal.

Preload owns event cursors per exact connection rather than through one global cursor. Registering another
conversation in the same View creates another active cursor; only subscription disposal or renderer lifecycle
replacement retires that cursor.
Queued events for a known retired connection are discarded as lifecycle races and MUST NOT be rewritten as a
`globalError` for the current connection. Events for the active exact connection still require contiguous
sequence, while an unknown or identity-conflicting connection remains a visible protocol failure.

## Follow-up decisions: unavailable catalog items and fixture storage isolation

Cold Pi catalog records without canonical conversation context no longer infer an operable owner from
`workspaceId`. Agent Home projects the record with its catalog identity and an owner-qualified `unavailable`
diagnostic so the user can see and explicitly delete it. Only a conversation projection already materialized by
the exact live Workspace runtime can qualify its current in-memory owner; that qualification is not used for cold
restore. Owner conflicts use the same local unavailable state. A valid sibling remains fully operable; the
diagnostic does not become a global Agent failure.

Desktop Primary Sidebar disables only the unavailable Project or Conversation navigation button and exposes the
diagnostic beside that item. Explicit cleanup remains available: deleting the unavailable Conversation or removing
the unavailable recent Project does not attach an Agent runtime or Workspace. `DesktopAppHost` and
`DesktopShellService` independently reject forged restore/open requests before context reads, Workspace grant
restore, Scene mutation or runtime attachment. No recent-conversation fallback or active-Project substitution is
allowed.

Functional Electron acceptance owns a single temporary fixture root. The runtime HOME (and therefore
`${FIXTURE_HOME}/.neko/neko.db`), Electron userData and Workspace must all be contained by that root. The explicit
fixture argument without an explicit safe fixture HOME is invalid. Isolation is checked before local metadata or Pi
storage opens, so a test launch cannot accidentally use the user's `~/.neko/neko.db`. Unit tests continue to use
per-test temporary roots and never use the process home as a fixture.

## Follow-up decisions: startup notice and unavailable-owner cleanup

`desktop-stored-state-metadata-retained` 表示 Host 已保留未知字段且当前 canonical 数据仍可使用，
不是持续阻塞用户的错误。Renderer 只从本次启动收到的第一个 authoritative Shell projection 捕获
第一条 retained-metadata warning，并把它作为 viewport overlay 展示；用户可立即关闭，未操作时在
8 秒后自动移除。后续 Scene transition、Shell projection event 和 snapshot refresh 不重新武装该
通知。`desktop-stored-state-invalid`、invalid Window、component failure、conversation diagnostic 和
命令错误仍按现有 fail-visible 生命周期展示，不共享启动通知超时。

Workspace registry 的 Project catalog 在列出记录时只读 `neko/project.json`，使用 Local Metadata
拥有的 canonical identity codec 校验文件和 registry `workspaceId`。目录存在但 identity 缺失、损坏
或冲突时，Project 继续展示并带 item-local `unavailable`；Host 将该 unavailable 合并到同 identity
的 persisted Project projection，并在 Workspace grant restore 前拒绝打开。不得等 restore 抛错后
再隐藏 Project，也不得创建或修复 identity 作为列表读取副作用。

Agent Home 的显式 conversation 删除先由 Desktop 验证 exact navigation 仍存在，再调用 Agent
application host 的全局删除入口。该入口从 Pi catalog 解析 conversation 的持久 `workspaceId`：若
对应 Workspace runtime 已存在则复用它完成精确停止和删除；否则只创建短生命周期 Pi conversation
authority 执行删除并立即释放，不解析 Project path、不 attach Workspace、不加载 tools/provider。
未知 conversation 继续 fail-visible，且不以 active/recent owner 替代。

## Follow-up decisions: invalid Window presentation convergence

Window、Workbench、Tab 和 application-sidebar state 是可重建 presentation，不是 Project、Conversation
或文件事实。Shell codec 逐项解析 `windows[]`；单条 Window 无法满足当前 canonical contract 时，只保留
owner-qualified diagnostic，不保留该记录的原始 payload，也不识别旧字段或旧 shape。合法 Window、Project
和其他 authority 继续解析并可用。

`DesktopShellService` 在首次 claim 前读取这些局部 diagnostics，通过现有 Shell diagnostic projection
向当前应用实例展示，并立即以同一个 state repository canonical commit 持久化仅包含合法 Window 的状态。
若没有合法 primary Window，正常 claim 流程创建 fresh Home Window；若存在合法 primary Window，则原样
恢复该 Window。两种情况都不得把失效 payload 写回，下一次应用启动不再产生同一 diagnostic。

这不是内部数据迁移或旧 shape fallback：没有版本判断、字段映射、旧 contract reader、双读双写或第二条
handler。解析失败的非 authoritative presentation 被局部丢弃并进入当前 canonical fresh state；用户项目、
会话、素材、设置和文件不修改。SQLite 集成测试必须关闭并重新打开 store，证明旧 Window 不再存在、合法
sibling 仍可恢复且提示不会在第二次启动重复出现。

## Follow-up decisions: Canvas full-snapshot sequence and mounted media locator

Canvas projection events 携带完整 authoritative snapshot，不应被精确 `sequence + 1` 连续性要求丢弃。Main
session 的 sequence 可能在 preload 注册前或两次投影之间提前推进（例如 generation reattachment、跨窗口协调
或 terminal Agent 交付），因此 preload 在精确 identity 校验之后只接受严格单调递增的 sequence：`>` 已投递
sequence 即应用最新完整 snapshot，`<=` 视为 stale/duplicate 丢弃，陌生 identity 拒绝。这不会形成
active/current identity fallback 或 renderer 第二权威，也不会重放已完成 turn。

已挂载 Media Library 内容不再用 `MediaLibraryContentLocator` 作为第二个内容路径。挂载文件与普通文件共享
同一 `WorkspaceFileContentLocator`（路径 `neko/assets/<libraryName>/<relativePath>`）。全局目录注册与项目
挂载（`neko/assets/<libraryName>` 下的 managed symlink/junction）的差异只属于 mount manager：关联、创建、
校验、恢复和授权集中在 mount manager 与 Host path guard，`ContentReadService` 与普通 workspace 访问使用同一
路径。`isProjectDurableContentLocator` 回到“合法 ContentLocator 即为 durable Project fact”，不再把
`neko/assets/...` 判为非 durable；删除为该流程持久化 `MediaLibraryContentLocator` 的 producer/consumer
转换，禁止双读、兼容 fallback 或静默迁移。既有合法 workspace-relative Canvas fact 必须原样重开；任意
symlink escape、缺失或失效挂载仍按 owning resource fail-visible。

Canvas document 与 presentation 具有不同更新频率。运行时完整 snapshot 仍是 document authority，但同一
document identity 的加载回调只允许首次 seed package-owned runtime viewport；后续 document-only snapshot
不得把 `CanvasData.viewport` 或尚未更新的 Host presentation 解释为重新定位命令。Webview Host 只有在
authoritative presentation 相对上一条 accepted snapshot 真实变化时，才更新 Webview presentation state 并
发布 `canvas.hostPresentation`。viewport snapshot policy 绑定 document lifecycle，而不是 `canvasData` 对象
identity；节点、连接或 terminal delivery 更新不得触发 cleanup `close` flush。这样不引入第二事实来源：显式
Host presentation 变化仍覆盖 runtime viewport，本地 viewport 在 bounded idle/blur/close 边界通过既有单一路径
提交。

## Follow-up decisions: active and queued user-message feedback

Agent state 仍由 package-owned `AgentStateRuntime` 唯一拥有。Desktop connection 对 state snapshot 使用同一
有序 publication tail；active submission acceptance 必须等待本次 `thinking` snapshot 发布完成后才能返回，
不得由 Renderer 根据 optimistic `isThinking` 推断或补造状态。queued acceptance 不重置当前运行 Turn 的
`startedAt`，避免第二条排队消息改变第一条运行计时。

Webview 把非 idle 的权威 state 投影到用户消息之后的 model-output transcript rail，首轮和后续轮次使用同一
空间 owner。generic execution activity 只覆盖模型尚未产生 canonical record 的间隔；streaming、Tool 和
completed assistant record 在同一 model-output 空间按现有规则取代它，不得把处理状态临时挂入用户消息再
跳转。用户消息继续只拥有发送时间和用户操作，时间可见性不因运行态改变。queued item 不进入 transcript，
composer queue 使用既有 `createdAt` 显示逐项“等待中”和时间，发送、重编辑、取消操作保持不变。消息与队列
时间共用一个 package-local formatter，不新增状态 owner、contract 字段或 fallback。
