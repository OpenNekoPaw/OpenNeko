## Context

Desktop 已有四个可复用 owner：

1. Shell Project catalog 拥有最近项目和打开/恢复；
2. Agent Home projection 拥有跨项目会话摘要，Pi SkillHost 拥有 Skill discovery；
3. Assets Resource Browser source 拥有目录、workspace-linked Media Library 与 Entity 查询；
4. Shell domain capability projection 表示 Agent/Assets/Canvas/Cut/Preview 等内置组合状态。

缺口是 Home 没有把这些 owner 组合成管理 Surface。历史 Plugin Host ADR 已被当前架构取代，
Phase 1 也明确不建立外部 Plugin Host，因此“插件”不能被实现成假的安装器或可执行扩展商店。

## Goals / Non-Goals

**Goals:**

- Home 与 Content Project 使用同一 Desktop-native 一级侧栏视觉和折叠行为。
- 开始创作可携带用户意图进入真实项目 Agent composer。
- 资产中心按项目聚合真实 source，并能跳转到项目 Resource Dock。
- 插件页展示真实 Skill catalog 与内置扩展可用性。
- 全部创作展示完整 Project/Conversation 聚合，而不是再维护一份最近记录。

**Non-Goals:**

- 新增第二套 Agent composer、conversation authority 或自动发送模型请求。
- 建立跨项目可写的全局 Entity/素材 catalog。
- 实现外部扩展安装、activation、permission、sandbox UI 或 Marketplace。
- 把项目绝对路径、Skill 物理路径或 credential 投影到 Renderer。

## Five-Layer Analysis

| 层 | 决策 |
| --- | --- |
| 职责 | Shell 只拥有导航；Agent/Assets owner 提供只读管理投影；项目事实仍按 workspace 隔离。 |
| 依赖 | Renderer 只消费 purpose-scoped Home bridge；Main 组合 Agent/Assets public service。 |
| 接口 | 所有查询携带显式 project/workspace identity；返回 ContentLocator 或安全摘要，不返回绝对路径。 |
| 扩展 | “扩展”只投影当前内置 domain capability；未来 Plugin Host 通过新 OpenSpec 替换 unavailable 状态。 |
| 测试 | 覆盖 project identity、source 复用、初始输入一次性 handoff、空 catalog、i18n 与 UI 路由。 |

## Decisions

### 1. Home navigation is Shell-owned, data is not

`HomeSection` 只选择四个固定 Surface。资产和插件数据通过 owner adapter 读取，不能写入
Window layout 或 Renderer local storage。进入项目后仍使用原 Resource Dock/Agent Root。

### 2. Start creation performs a project-scoped handoff

Home composer 必须先确定 Content Project。用户可选择 catalog 项目，或通过文件夹选择器新增
项目。Shell 打开/聚焦 Project 后把文本作为一次性 `initialInput` 交给 Agent Root 的 tabless
composer；它不自动发送，不绕过模型/permission/approval 配置，也不在 Home 创建 conversation。

### 3. Asset Center is a federated read projection

全局资产中心按 Project 分组，复用同一个 Assets Resource Browser projection source 查询：

- Directory：workspace 真实目录；
- Media：workspace-linked Media Library；
- Assets：Entity 与其授权 representation。

Home 只显示有限结果与来源项目，进一步编辑/预览时打开该项目的 Resource Dock。查询失败以
项目级 diagnostic 展示，不静默返回空成功。

### 4. Plugins distinguishes Skills from executable extensions

Skill tab 通过项目 workspace 的 Pi SkillHost discovery 返回 name、description、source 和
enabled/trusted 状态，删除 locator/fingerprint/物理路径。Extensions tab 只列 Shell 已组合的
内置 domain capability 与 ready/unavailable 状态。当前没有外部 Plugin Host 时页面明确显示
不可安装，而不是伪造 Marketplace 或把 Webview `pluginsAvailable` 当作安装记录。

### 5. All creations reuses existing projections

全部创作由 Project catalog 与 Agent Home conversation projection组成；点击项目或会话继续
使用现有 open/focus 路径。Activity attention 作为列表状态显示，不保留独立一级入口。

### 6. Home is the default application entry

Desktop 的新安装默认启动目标是 Home。预发布 application settings v1 中继承旧默认值
`restore` 的状态在 v2 读取时迁移为 `home`；主题、语言、资源视图和 storage revision 保留。
用户在 v2 设置页显式选择“恢复上次项目”后，后续启动仍尊重该选择。这样既修复旧默认污染，
也不让 Shell 绕过 Settings authority 或静默改写新版用户选择。该单版本迁移由 Desktop
Application Settings Repository 拥有；当稳定版不再接受任何 v1 预发布设置文件时删除，
验收以 v1 migration test 和 v2 explicit-restore test 为准。

### 7. Start Creating is a compact Agent Home surface

Start Creating 使用单一居中的 Agent intent composer。标题只表达当前任务，不承担放大品牌
展示；项目选择位于 composer footer，发送继续使用一次性 handoff。真实快捷操作在 composer
下方以紧凑 action rows 展示，并只执行打开项目或预填意图。背景只使用 Desktop theme surface
与现有轻量网格，不使用强调色光晕制造假的运行状态。

### 8. Home is a task launchpad, not a blank canvas

上一版修正只缩小了 Hero，仍保留“标题 + 空白输入框 + 少量按钮”的旧骨架，无法形成用户要求的
Codex 风格任务入口。Start Creating 改为独立的 task launchpad：

- 主标题表达“与 OpenNeko 一起创作”，不重复侧栏导航名称；
- composer 仍只拥有输入、项目作用域和提交，不伪造模型、Skill 或 provider 配置；
- 常用创作意图与快速模板都只预填同一个 composer，保持一次性项目 Agent handoff；
- Home 使用纯 Desktop surface；点阵背景只属于 Canvas/创作工作区，不能作为 Home 的信息架构；
- 所有模板数据留在 Home presentation，不创建新的 workflow runtime 或第二套 Agent authority。

### 9. Primary sidebar owns one shared frame contract

只复用 `ApplicationPrimarySidebar` 内部内容不足以保证视觉一致：Home 与 Project 还必须共享
同一个 `ApplicationPrimarySidebarFrame`。一级侧栏是贴边应用导航层，不是 Workbench 内容面板，
因此 frame 不得添加外边距、圆角、边框或卡片阴影：

- frame 统一拥有贴边定位以及 expanded/compact 几何；
- `window.workbench.primarySidebar` 是 Home 与 Project 共同的宽度和显隐 authority；Project
  resize 或任一路径折叠后，切换页面仍保留相同的当前几何；
- compact frame 固定占用 64px；pointer hover 或 keyboard focus 临时把侧栏 overlay 展开到持久化
  宽度，不改变 Workbench grid，也不写入显隐设置；
- hover overlay 的实际命中宽度必须在进入 rail 时立即扩展到持久化宽度；不得对 width 做过渡，
  否则快速横向移动会越过正在增长的命中边界并错误触发收回。视觉缓动只能作用于不改变
  pointer hit-testing 的阴影或内容表现；
- Home section 与当前 Project 的 active state 继续表达不同导航语义，不为追求像素相同伪造选中项；
- 共享 frame 只负责 presentation；Workbench 负责 resize、显隐状态和持久化，不再由 Home
  保存第二份页面局部状态。

内容主面板、Agent、Resource、Cut/Timeline、Canvas 和 Preview/Model 属于 Workbench 内容组件，
它们之间可以保留 8px 间隔；最靠近一级侧栏的第一个内容组件不得再增加左侧间隔。

### 10. Home may mutate only the application primary-sidebar slice

`window.workbench.primarySidebar` 是 Window Shell presentation authority，不要求当前激活 Content
Project。Home 的折叠操作继续使用唯一 `workbench:update` canonical path，但 Main 必须把 Home
mutation 限制为：

- `windowId`、Window revision 与 Workbench revision 仍通过现有 CAS 校验；
- 除 Workbench revision 和 `primarySidebar` 外，其余 Workbench projection 必须与当前存储状态
  完全一致；
- Home 尝试修改 Main views、Agent、Resource Dock、Timeline 或 preset 时必须 fail-visible；
- Project 激活时继续执行完整 Project/View identity 校验。

这样 primary-sidebar 状态仍由同一 Window Workbench authority 持久化，同时不会把 Home 当成
伪 Content Project，也不会为一个按钮增加第二套 IPC 或 Renderer local state。

## Risks / Trade-offs

- 跨项目资产查询可能较慢，因此结果按项目惰性加载并限制数量，不建立缓存真值。
- Home 初始输入只预填不自动发送，多一步确认但保留 Agent 权限与模型成本边界。
- 扩展页在 Phase 1 只能显示内置组合能力；外部扩展管理仍需独立 Plugin Host change。
- v1 的 `restore` 无法区分旧默认与用户显式选择；本项目尚未发布，因此迁移统一采用新的 Home
  默认。需要恢复项目的用户可在 v2 设置页重新显式选择一次。
