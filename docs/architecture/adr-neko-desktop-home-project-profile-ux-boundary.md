# ADR: Neko Desktop Home、Project Tabs 与创作 Profile UX 边界

状态：Proposed

日期：2026-07-22
更新日期：2026-07-27

范围：拟议中的 `apps/neko-desktop`、Home 管理中心、Agent 会话与 Activity/Attention 投影、Project Tabs，以及内容创作、角色 IP、互动世界三类创作项目。

## 背景

OpenNeko 当前只有 VS Code 与 TUI 两个产品组合根。Desktop 仍是拟议方向，宿主、子包复用和开源参考边界由 [`adr-neko-desktop-composition-and-open-source-reference-boundary.md`](adr-neko-desktop-composition-and-open-source-reference-boundary.md) 定义；本文只定义目标 Desktop UX、用户对象和跨创作类型边界，不授权实现 Desktop，也不恢复已经删除的 Home、Workbench Core、Market、Model、Puppet、Scene 或其他旧产品路径。

MiniMax Hub 的公开产品说明和 2026-07-22 界面观察展示了一种适合 Agent 创作客户端的宏观结构：Home 同时承担入口、全局导航和项目发现；顶部 Tab 保存当前打开的项目工作集；项目内部以左侧资源、中央创作表面和右侧项目 Agent/Activity 组成工作台。OpenNeko 可以参考这种层级，但不能把无限 Canvas 当作所有创作领域的统一运行表面。

OpenNeko 的目标创作范围分为三类：

1. 内容创作：音频、视频、图片、文档、3D 模型和其他媒体的生成、编排、审阅与交付。
2. 角色 IP：角色身份、2D/3D 表现、语音、记忆策略、对话、多角色互动和角色行为的创作与调试。
3. 互动世界：世界观、剧情、场景、NPC、规则、互动模式、运行、存档和游玩体验。

如果 Home、会话、项目、项目 Tab、领域 Job/Run、角色运行和世界存档没有明确边界，系统会出现以下问题：

- Home Agent 成为隐式全局状态 owner，并通过“当前项目”修改多个项目；
- 每次生成或工具调用都创建会话，导致多会话 Inbox 被领域执行摘要淹没；
- Project Tab 被误作项目事实、会话或文档身份，关闭 Tab 意外删除或终止工作；
- 角色项目和世界项目各自实现一套角色状态、记忆、对话和 gameplay；
- 世界运行经历静默覆盖全局角色身份，或项目候选静默进入全局素材/角色库；
- 为了复用一套工作台，把角色调试和世界游玩硬塞进 Canvas/Cut。

### 当前文档与实现成熟度

本文冻结目标信息架构，不表示对应能力已经实现。当前状态如下：

| 范围 | 当前状态 | 可复用基础 | 尚未建立 |
| ---- | -------- | ---------- | -------- |
| Desktop Shell / Home / Project Tabs | Proposed；无 `apps/neko-desktop` | `@neko/ui` primitives、Host ports、各领域公共入口 | Electron composition、Project catalog、ProjectTab 持久 contract |
| Content Profile | 子能力已实现 | Agent、Canvas、Cut、Preview、Generation、Quality、Document/Markdown、Media Library | 统一 ContentProject aggregate、codec、跨 Surface artifact/review/output contract |
| Character IP Profile | Chara 第一阶段已实现 | Dialogue、Embody、evidence、profile、Entity 与 representation binding | CharacterProject/Version、发布、持久 Run、独立角色编辑器和完整表现 authoring |
| Interactive World Profile | 仅架构边界 | CharacterVersion/World binding 目标契约 | `neko-world`、project/version/run/save/replay、规则/事件和 UI |
| Media Library | Accepted 且已有 VS Code 实现 | linked library、ContentLocator、Search、Entity binding | Desktop React 管理面和 Electron Host adapter |
| Professional Tools | 仅目标边界 | MCP Manager、External Processor、ContentLocator、Cut OTIO/export | Desktop integration catalog/Host port，以及 DaVinci、剪映、Photoshop、Live2D、Blender、Unity、ComfyUI 的真实 adapter |

Profile、导航项或 UI 占位不构成成功实现。缺少 canonical owner、project codec 或运行契约时必须显示 unavailable diagnostic，不得创建空项目、空 Run 或成功 no-op。

## 决策

### 1. Desktop 使用一套 Shell、两类 UX scope

Desktop 采用一套稳定 Shell，不创建独立 Home 应用和独立 Studio 应用：

```text
Desktop Shell
  [Home] [内容项目 A] [角色项目 B] [世界项目 C] [+]

Home scope
  -> 全局管理、Director Agent、多会话 Inbox、跨项目活动

Project scope
  -> 项目资源、类型化创作表面、Project Agent、项目 Activity 与运行
```

Home 是固定、不可关闭的顶层 Tab。入口态、管理页面和项目工作台共享同一个窗口、主题、命令系统、通知、Activity/Attention 投影和资源选择体验。Focus Mode 可以隐藏侧栏，但不得创建第二套导航或运行时。

### 2. Home 是全局管理中心，不是大 Dashboard

Home 的导航按长期职责分组：

```text
开始
  首页
  活动与会话

资源
  媒体库
  角色库

能力
  Skills、插件与专业工具
  Market / Discover（未来、需独立变更）

项目
  所有项目

底部
  设置
```

Home 首页只保留 Director Agent composer、最近项目、运行中/待确认摘要和少量明确的新建入口，不使用统计型 Dashboard、营销内容或大面积功能卡片代替真实操作。

Home 管理面只组合 owning domain 的公共 contract 和 projection：

| Home 页面         | 用户职责                                        | Canonical owner / 当前边界                                 |
| ----------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| 活动与会话        | 查看会话以及跨项目运行中、待确认与失败摘要      | 只读 Attention projection；命令委派给 Agent/领域 owner     |
| 媒体库            | 浏览、导入、搜索、整理、查看来源和使用关系      | Assets / ContentLocator / Search                           |
| 角色库            | 浏览 confirmed 角色、版本、表现、关系和使用位置 | Entity 与 Asset binding；不是图片或模型文件目录            |
| Skills、插件与专业工具 | 管理 Skill、MCP、专业应用集成、Computer Use、版本、能力/验证等级、OS 权限、信任、依赖和诊断 | Agent Skill/MCP catalog、Professional Tool integration、plugin/capability contract |
| Market / Discover | 发现、安装、更新和卸载                          | 当前不存在；未来需新的 Market owner、trust 和安装 contract |
| 所有项目          | 创建、打开、归档、过滤和恢复项目                | Desktop project catalog projection；Tab 不是项目事实       |

Market 当前是被删除产品。本文只保留其目标信息位置，不建立可调用 route、repository、安装结果或兼容成功路径。

### 3. Home 管理多会话和 Attention，但不拥有项目运行事实

Home 的会话 Inbox 可以统一展示：

- 全局 Director 会话；
- 带明确项目 badge 的项目会话投影；
- 运行中、需要确认、已完成、失败或已取消的摘要。

会话、执行与运行必须保持不同用户对象：

| 对象               | 含义                                                                    | 默认位置                                         |
| ------------------ | ----------------------------------------------------------------------- | ------------------------------------------------ |
| Agent Conversation | 用户与 Agent 的持续讨论；拥有持久 identity，但不等于当前 run 或 UI view | Home Inbox 或项目 Agent                          |
| Agent Run          | Conversation 中一次 turn、续跑或 delegation 的执行                      | 所属 Conversation timeline / activity projection |
| Tool Call / Domain Job | 工具调用、生成、导出、导入或其他领域执行                             | 所属 Timeline、领域 Surface、Home/项目摘要       |
| 角色对话运行       | 角色实验的一次对话或测试执行                                            | 角色项目内部                                     |
| 世界运行 / Save    | 世界的一次模拟、游玩状态或存档                                          | 世界项目内部                                     |

新建 Home 会话不创建项目。一个全局目标可以创建项目及一个项目主会话；后续生成、分析和导出默认进入 Tool Call 或 owning-domain Job，不为每次操作创建新会话。只有用户显式开始独立讨论、实验或调试分支时才新增项目会话。

Home 可以创建项目、向明确 `projectId` 派发 operation 并观察状态，但 project-scoped operation 必须由项目 owner 执行。Home 不得通过 active Project Tab 推断目标，也不得建立跨领域 TaskManager、Job registry、Activity command router 或 `latestTask` fallback。

### 4. 项目创建、后台执行和界面聚焦相互独立

以下三个动作不是同一件事：

1. 建立项目身份与持久事实；
2. 在项目 scope 中运行 Agent Run、Tool Call 或领域 Job/Run；
3. 打开或聚焦 Project Tab。

默认导航策略：

| 用户意图                                 | 项目行为                 | 导航行为                               |
| ---------------------------------------- | ------------------------ | -------------------------------------- |
| 普通问答、调研或一次性候选               | 不创建项目               | 留在 Home                              |
| 明确新建并编辑作品                       | 创建项目                 | 创建成功后打开 Project Tab             |
| 向已有项目批量生成、分析或导出           | 绑定已有项目并由领域执行 | 留在当前界面，显示状态与“打开项目”     |
| Canvas/Timeline 编辑、角色调试或世界互动 | 创建或绑定项目           | 打开并聚焦 Project Tab                 |
| 领域执行需要项目内审阅                   | 项目进入 needs-attention | 通知并提供打开入口，不抢占其他前台工作 |

取消项目类型、模板、角色阵容或其他创建前选择不得留下空项目、空会话或空 Project Tab。

### 5. Project Tabs 与项目内 View 表示当前工作集，不是事实源

顶部 Tab 只管理当前窗口打开的项目：

```text
[Home] [内容：宣传片] [角色：Alice] [世界：Aster] [+]
```

规则：

- Home 固定且不可关闭；
- 同一项目在同一窗口只打开一个 Tab，重复打开聚焦已有 Tab；
- 关闭 Tab 不删除、归档或修改项目，不取消 Agent Run 或 owning-domain Job/Run；
- 项目可以在没有打开 Tab 时继续执行 owner policy 允许 detach 的领域 Job/Run；
- Tab 恢复上次选中的项目文档、中央 surface 和面板布局，但这些只是可恢复展示状态；
- Tab 可以展示项目类型、运行中、需要确认、失败和未保存 badge；
- 所有项目页面是完整 catalog，顶部 Tab 只表示当前工作集；
- 项目内文档第一阶段通过左侧项目树、面包屑或受控 View switcher 切换，不默认增加第二条完整 Tab bar；是否呈现为视觉 Tab 不改变其独立 view identity；
- Agent Webview 的 Conversation Tab 与 `@neko/ui` 的 Workbench tab primitive 不是 Project Tab authority；前者绑定 Conversation，后者只负责渲染；
- 同一 Conversation、Surface 或领域执行可以有零个或多个 View；View 的打开/关闭只改变展示投影，不改变 owning object 的持久或执行生命周期。

#### 5.1 Conversation、Run、领域 Job/Run 与 View identity 必须分离

目标对象层级为：

```text
ProjectId
├─ ConversationId
│  ├─ ConversationRuntime
│  ├─ AgentProfile / CharacterProfile
│  └─ AgentRunId
│     └─ ChildAgentRun / DelegationRun
├─ GenerationJobRef / ExportJobRef / other owning-domain Job or Run ref
└─ SurfaceId

WindowId
└─ ProjectTabId -> ProjectId
   └─ ConversationViewId / SurfaceViewId / ActivityViewId
      -> owning identity
```

其中：

- `ConversationId` 是持久讨论身份；`ConversationRuntime` 是 Host 拥有的运行实例，默认按 `(projectId, conversationId)` 隔离可变状态、消息队列、取消、日志和资源句柄；
- `AgentRunId` 是一次 turn、内部 continuation 或 delegation 的执行 identity，不得复用 Conversation、Tab 或 active view identity；
- 生成、导出、导入、角色互动和世界运行分别使用 Generation、Cut、Assets、Chara、World 等 owning domain 的 Job/Run identity；不存在通用 `BackgroundWorkId` 或跨领域 Task command router；
- `ConversationViewId`、`SurfaceViewId` 和 `ActivityViewId` 只拥有滚动、选择、布局、临时输入和其他可恢复 UI 状态，不拥有 transcript、Job/Run 事实或后台执行；
- Agent profile、角色 profile、Plan/Build mode 或 backend adapter 只决定模型、上下文、工具、权限和行为策略，不成为 Conversation 或 Runtime identity。

同一 Conversation 在同一 Window 中默认只打开一个 ConversationView，重复打开聚焦已有 view；跨 Window 可以有多个 view，但共享同一 Host runtime 和 transcript projection。若未来确有多进程窗口，Host 必须通过单一 runtime owner 与消息订阅协调，不能在每个 renderer 复制 AgentSession。

#### 5.2 关闭、停止、归档和删除是不同 operation

| 用户动作                             | UI view                      | Conversation | 当前 Agent Run                         | owning-domain Job/Run                     |
| ------------------------------------ | ---------------------------- | ------------ | -------------------------------------- | ---------------------------------------- |
| 关闭 Conversation view / Project Tab | detach 或保存 view state     | 保留         | 默认继续                               | 按 owner policy 继续，不因可见性而取消   |
| Stop / Abort                         | 保留                         | 保留         | 取消明确 `agentRunId`                  | 不隐式取消                               |
| Archive Conversation                 | 从默认 Inbox 移出，可恢复    | 保留         | 仅在无 active run 时允许，或先显式取消 | 不隐式取消                               |
| Delete Conversation                  | 关闭相关 view 并删除持久会话 | 删除         | 必须先终止或拒绝删除                   | 按 owner 的引用/保留策略处理             |
| Cancel domain Job/Run                | 保留                         | 保留         | 不隐式取消                             | 调用准确 owner port 和 Job/Run identity  |

任何操作不得通过“当前 active Tab/Conversation”推断目标。关闭 renderer、Panel 或 Window 时，Host 只释放 view subscription 和 renderer-scoped resource；Host-owned runtime、媒体 session 或领域 Job/Run 是否释放，必须由 owning lifecycle 和显式引用/退出策略决定。

#### 5.3 Subagent 默认是子运行，不自动创建顶层会话

Primary Agent 调用 subagent 时，默认创建父 Conversation 下的 `ChildAgentRun` / `DelegationRun`，并把进度和结果投影回父 timeline。它不自动创建 Project Tab、ConversationView 或 Home Inbox 顶层 Conversation。

只有满足以下至少一项时，才通过显式 operation 提升为独立 Conversation：

- 用户主动选择“在新会话中继续”；
- 子任务需要独立、长期的上下文和后续交互；
- 子任务进入 needs-review/needs-input，且父 Conversation 无法清晰承载审阅；
- 领域 workflow 明确定义了可持久、可恢复的讨论分支。

提升必须记录 parent/provenance，但新 Conversation 获得新的 `ConversationId` 和 Runtime；不得让一个 child run 同时充当父 run、独立 Conversation 和领域 Job/Run。

#### 5.4 Project Tab 与 Conversation/Surface view 使用分层前端状态

Desktop Shell 不建立包含所有领域事实的全局 Zustand store。前端状态按以下边界组织：

```text
Host/domain authoritative snapshot
  -> Project / Conversation / Run / Tool Call / Job / document facts

WindowStore(WindowId)
  -> Project Tabs / active view / layout / dock presentation

ViewStore(ViewId)
  -> draft / selection / scroll / viewport / temporary UI

Component state
  -> hover / popover / drag preview / IME composition
```

Project Tab badge、Home Activity 和跨项目 needs-review 数量必须来自 Host 生成的带 owner ref
与 revision 的摘要，不能由当前已打开/已加载的 view 拼装。持久 Window layout 和 Tab
binding 由 Window application service 以 revision/CAS 保存；Renderer 可以显示 pending
intent，但 Host snapshot 始终是恢复真值。

Tab 切换、关闭和快速重开时，所有异步回调必须匹配发起时捕获的 `WindowId`、`ViewId`、
owner identity 与 view/endpoint epoch。迟到 snapshot、timer、worker 或 IPC response
不得写入当前 active Tab；关闭 view 只 detach subscription，不把 component unmount 或
`AbortController` 误当成已取消 Host execution。完整 snapshot-first attachment、sequence、
CAS、autosave、Computer Use 和插件 panel 竞态协议见
[`adr-neko-desktop-composition-and-open-source-reference-boundary.md`](adr-neko-desktop-composition-and-open-source-reference-boundary.md)。

### 6. 三类项目是闭合 Project Profile

用户界面使用“内容创作”“角色 IP”“互动世界”，不使用“传统内容创作”。三类 Profile 共享 Desktop Shell、Project identity、Agent/Activity projection、ContentLocator/稳定领域 ref 和公共 UI primitive，但拥有不同的项目事实、运行和中央工作表面。

| Project Profile   | 核心对象                                   | 主要产物                             | 中央工作表面                         |
| ----------------- | ------------------------------------------ | ------------------------------------ | ------------------------------------ |
| Content           | 文档、媒体、Board、Timeline、Output        | 图片、音频、视频、文档、模型和交付物 | Canvas、Cut、Preview、文档编辑器     |
| Character IP      | 角色身份、表现、声音、记忆策略、行为和测试 | 可发布角色版本、表现绑定、测试证据   | 角色编辑器、2D/3D 舞台、Dialogue Lab |
| Interactive World | 世界、地点、实体、剧情、规则、事件和运行   | 世界版本、体验、存档、回放           | 世界编辑器、模拟视图、游玩视图       |

实际 schema、project codec、package owner 和跨层 contract 必须在各自实施 OpenSpec 中定义。本文中的 Profile 名称不构成已实现文件格式或公共 API。

#### 6.1 内容创作 Profile

内容项目以可交付 artifact 为中心：

```text
Brief / Research
  -> Script / Document
  -> Board / Canvas
  -> Media
  -> Timeline
  -> Review
  -> Output
```

建议工作台：

- 左侧：项目文档、Boards、Timelines、References、Outputs；
- 中央：Canvas、Cut、Preview 或当前文档；
- 右侧：Project Agent、Inspector、Review、Activity；
- 完成结果可以保存到媒体库、作为角色参考、交给角色项目或世界项目。

Canvas、Cut、Preview 和文档 surface 是 AI-native lightweight authoring：用于快速生成、
编排、预览、轻编辑、审阅和准备交换，不以追赶完整 NLE、调色、合成或分层图像软件为
目标。需要专业制作时，Content owner 冻结明确 document/timeline revision，导出 durable
bundle，并通过项目/素材上的 “Open in…” 交给 DaVinci Resolve、剪映/CapCut、
Photoshop 等已验证 integration。Agent 可以通过同一 integration 的 MCP/API 或受控
Computer Use 查询和自动化专业应用；Computer Use 必须绑定明确应用/窗口/文档，用户可
暂停、停止或接管，截图不能单独证明完成。外部 native document 不成为 ContentProject
或 Cut OTIO 事实；结果必须显式 round-trip 为新 candidate/revision/output。

#### 6.2 角色 IP Profile

角色项目以稳定角色身份及其多种表现和交互能力为中心：

```text
Character Identity
  -> background / personality / relationships / knowledge
  -> 2D / 3D / voice / motion representations
  -> dialogue / memory policy / behavior capabilities
  -> test / compare / review
  -> publish CharacterVersion
```

角色工作台提供三个明确模式：

- 设计：身份、外观、声音、关系和能力；
- 调试：prompt、上下文、记忆、模型调用、测试集和评分；
- 互动：单角色或多角色体验、分支和回放。

Home 角色库管理已确认角色及已发布版本；角色项目管理一个角色或明确角色组的草稿、候选和测试。简单 metadata 可以在 Home Inspector 修改，深度创作必须打开角色项目。

当前仓库只有统一 Entity、Asset binding、角色对话相关能力和只读 Preview 边界，没有已接受的 Character Project、Puppet/Avatar authoring 或通用角色 runtime。未来实现必须定义新的 canonical owner，不能把角色项目全部堆入 Assets、Agent 或 Preview，也不能恢复已删除的 `.nkp`/Puppet 成功路径。

#### 6.3 互动世界 Profile

世界项目同时拥有 authoring facts 和显式运行实例：

```text
World authoring
  -> lore / locations / scenes / entities / plot / rules / initial state

World runtime
  -> user actions / NPC decisions / events / time progression
  -> snapshot / branch / replay / save
```

世界工作台提供三个明确模式：

- 创作：编辑世界观、地点、剧情、实体、规则和初始状态；
- 模拟：自动运行、暂停、单步、观察、调试和回放；
- 体验：隐藏开发信息，按产品化交互进入游玩状态。

建议工作台：

- 左侧：世界、地点、场景、实体、角色、剧情、规则、事件和 Saves；
- 中央：世界编辑器、交互视图或游玩视图；
- 右侧：World Agent、State、Events、Inspector、Debug；
- 世界项目运行必须携带 world/project/run/save identity，不能回退当前 active 世界。

当前仓库没有已接受的 World Project、Scene authoring、world runtime 或 save contract。未来能力必须作为新领域和新变更设计，不能由 Canvas、Preview 或 Agent 私有状态临时充当世界事实源。

#### 6.4 `neko-chara` 与 `neko-world` 是平级顶级领域聚合包

未来实施使用两个平级 bounded context 作为 Character 与 World 的 canonical owner：

```text
packages/neko-agent
packages/neko-entity
packages/neko-chara   # Character domain owner; phase-one package exists
packages/neko-world   # proposed Interactive World aggregate
packages/neko-assets
...
```

这里的“顶级”表示顶级领域包，不表示应用 Composition Root。`apps/neko-desktop`、`apps/neko-vscode` 或其他宿主继续负责实例化 Pi runtime、`@neko/media`/Node-FFmpeg adapter、Device/Perception、Renderer 和各领域 host adapter；`neko-chara`、`neko-world` 只通过公共 contract、稳定 ref、窄 port 和 capability contribution 组合这些能力。

| 聚合包       | 聚合主线                                                       | 拥有                                                                           | 组合但不拥有实现                                                        |
| ------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `neko-chara` | `CharacterProject -> CharacterVersion -> CharacterRun`         | 角色 IP 创作、发布版本、角色运行、记忆/能力策略、表现绑定、Roleplay 和测试语义 | Agent、Entity、Assets、Voice、2D/3D Renderer、Device/Perception、Media |
| `neko-world` | `WorldProject -> WorldVersion -> WorldRun -> WorldSave/Replay` | 世界事实、规则、事件、时钟、Gameplay、运行、存档、分支和回放                   | Agent、Entity、Assets、已发布 CharacterVersion、Scene/Renderer、Media  |

`neko-chara` 是 Agent 的领域扩展，但不得成为 `packages/neko-agent/packages/` 下的子包。角色扮演、角色动作、NPC 决策和 World Agent 全部复用同一个 `neko-agent`/Pi AgentSession、Tool Call、SubagentRun、Approval、取消、事件和 transcript canonical path；角色/世界通过 `agent-contribution` 投影领域上下文与允许能力，不新增 `RoleplayAgent`、`CharacterAgentExecutor` 或 `WorldAgentRuntime` 等平行通用循环。

Character 与 World 的跨域路径固定为：

```text
CharacterProject
  -> publish CharacterVersion
  -> WorldCharacterBinding
  -> WorldActorInstance in WorldRun / WorldSave
```

世界可以在 binding 中增加 world actor identity、世界角色、初始位置、阵营和世界局部策略，但当前地点、库存、关系进度、任务、事件经历和 Gameplay 状态属于 WorldRun/WorldSave。世界不得静默修改 CharacterVersion；角色 core 也不得导入 World 私有 runtime。角色在世界中的观察与行动由宿主组合的窄 Environment/World adapter 提供，避免 `neko-chara <-> neko-world` 循环依赖。

`packages/neko-chara` 已通过 `extract-neko-chara-domain-package` OpenSpec 建立第一阶段 owner，拥有当前 Character Dialogue、Embody、角色证据、Profile Assembly 和 VS Code 角色编排。它尚未实现 CharacterProject/CharacterVersion、发布、持久 CharacterRun 恢复或独立 Webview；`neko-world` 仍未建立。新增 project codec、Device/Live、持久 2D/3D authoring、Scene/Puppet 或 Gameplay runtime 前仍需独立 OpenSpec；缺失能力必须返回 unavailable diagnostic，不能恢复旧命令、fallback、空 provider 或成功 no-op。

#### 6.5 Host 只组合实例，领域 application service 负责编排

`apps/neko-desktop`、`apps/neko-vscode`、TUI 和未来宿主只构造 Character/World application service，注入 AgentSession、Storage、Renderer、Device、Media 等 adapter，并拥有宿主资源生命周期。Host 不判断角色回应、NPC 行为、世界 action、记忆晋升或领域 mutation，也不通过 active tab 选择 run。

`CharacterApplicationService` 拥有 CharacterRun 的创建、恢复、销毁、角色上下文/能力快照、Roleplay turn 和记忆候选；`WorldApplicationService` 拥有 WorldRun、action/revision 校验、WorldEvent 提交、save、branch 和 replay。两者依赖 package-local、consumer-owned port，Host 只替换具体 adapter，不能为 VS Code、Desktop 和 TUI 复制领域流程。

#### 6.6 Actor 与 AgentSession 映射保持唯一

```text
published character in world
  WorldActorInstance -> characterRunId -> primary agentSessionId

ambient world-local NPC
  WorldActorInstance -> optional world-local actor agentSessionId

world director / narrator
  WorldRun -> independent world-level agentSessionId
```

引用 CharacterVersion 的 world actor 必须通过一个 CharacterRun 承载角色身份、表现、感知和主 AgentSession；WorldActorInstance 只保存 world binding 与 `characterRunId`，不得为同一 actor 再创建 NPC AgentSession。Ambient NPC 可以使用 world-local archetype 和独立 session，但不能因此合成 CharacterProject/CharacterVersion。World Director 是 world-level scope，不冒充 actor。

CharacterRun 同一时刻至多映射一个 primary AgentSession；branch、reopen 和 resume 必须显式更新映射。run、Agent session、world actor、world run 和 save identity 缺失、陈旧或不匹配时 fail-visible，不得回退当前 active 对象。

#### 6.7 有效能力取策略交集，副作用提交时重新校验

```text
EffectiveCapabilities =
  HostPermission
  ∩ WorkspaceTrust
  ∩ CharacterVersionCapabilityPolicy
  ∩ WorldCharacterBindingPolicy
  ∩ CurrentRunScope
```

任何层只能收窄能力，不能通过 Prompt、Skill、provider metadata、同名 Tool 覆盖或 World binding 扩大上游授权。Turn 开始时捕获 effective policy snapshot 供上下文和 Tool resolution 使用；真正产生副作用的 owning operation 在提交时重新校验当前 permission、trust、run identity、domain revision 和必要 Approval。被过滤的能力不进入可调用目录，显式陈旧/伪造调用返回 typed diagnostic，不能转成普通 prompt 或 no-op success。

#### 6.8 Character 只能通过 revisioned WorldAction 修改世界

跨域 action 至少携带 `worldRunId`、`actorId`、可选 `characterRunId`、`actionId`、`expectedRevision` 和 typed intent。World runtime 是唯一 commit owner，必须校验 run/actor binding、action idempotency、revision、规则、权限和资源条件，再原子返回 committed revision/WorldEvents 或 rejected diagnostic。

Character、Agent、Tool adapter 和 Host 均不得直接修改 World store。陈旧 revision、重复 action、错误 actor、已停止 run 或规则拒绝时，不得改投 active world、隐式重试或由 Agent 修补世界状态。正式 wire/schema 留给 World 实施 OpenSpec，但这些 identity、revision 和结果语义是硬约束。

#### 6.9 记忆和运行时句柄不跨越所有权边界

| 事实/能力                        | Owner                             |
| -------------------------------- | --------------------------------- |
| 角色核心知识、长期记忆和记忆策略 | CharacterProject/CharacterVersion |
| 一次角色互动产生的记忆候选       | CharacterRun                      |
| 世界关系、事件和经历             | WorldSave                         |
| embedding、压缩、索引和召回      | 可重建 Memory infrastructure      |

CharacterRun memory candidate 或 WorldSave experience 只有经过显式 review/promotion，并发布新的 CharacterVersion，才能改变可复用角色事实。Memory infrastructure 不拥有晋升决策，也不能直接写 CharacterVersion、WorldSave 或 Agent transcript。

持久项目/版本/存档只保存 `EntityRef`、`ContentLocator`、`RepresentationRef`、`VoiceProfileRef`、`MotionSetRef`、CharacterVersionRef 和 provider-neutral policy 等稳定引用。Device handle/临时枚举 ID、Renderer/Voice/Media live session、Webview/blob/localhost URL、token、进程 ID、绝对 cache path 和 provider object 只能存在于 run-scoped host adapter；恢复时必须重新解析和授权，失败返回 unavailable diagnostic。

### 7. 全局资源与项目事实通过显式发布连接

Home 管理跨项目可复用资源；项目管理创作过程和候选：

```text
Home Media Library  ---ContentLocator---> Content / Character / World
Home Character Library --CharacterRef--> Content / World
Installed Skills / Plugins ------------> project capability projection

Project candidate
  -> explicit review / accept / publish
  -> Media Library or Character Library
```

规则：

- 项目不得因使用素材而复制另一套全局媒体库事实；
- 项目生成结果先是 candidate，不自动成为全局素材；
- 角色项目发布不可变或版本化角色结果，Home 角色库选择当前发布版本；
- 世界项目引用角色版本，并以 world-local binding 保存其世界身份、关系和运行状态；
- 项目或世界运行不得静默修改全局角色本体；
- 跨项目 handoff 使用稳定 ref、provenance 和显式 disposition，不传递临时 UI handle。

### 8. 角色、NPC、Gameplay 与记忆的所有权必须唯一

#### 8.1 普通模型与角色表现

普通 2D/3D 文件是媒体素材。只有当某个表现绑定到稳定角色身份，并进入角色版本或角色项目时，它才是角色 representation。文件名、缩略图或模型路径不能充当角色身份。

#### 8.2 角色 Gameplay 与世界 Gameplay

角色项目只拥有角色自身的可组合能力，例如说话、动作、表情、移动、感知、交互 affordance 和个体行为策略。世界项目拥有目标、任务、地图、关卡、战斗、经济、成长、事件调度和整体胜负规则。两者不得分别实现完整 gameplay state machine。

#### 8.3 Featured NPC 与 Ambient NPC

- 主要 NPC 引用已发布角色版本，并由世界 binding 增加世界内身份和状态；
- 普通 NPC 可以使用 world-local archetype，避免每个背景角色都先创建完整角色项目；
- world-local NPC 变成长期 IP 时，通过显式操作提升为角色候选或角色项目；
- 提升不得静默改写原世界存档或历史运行。

#### 8.4 三类记忆

| 记忆                             | Owner               | 生命周期                |
| -------------------------------- | ------------------- | ----------------------- |
| 角色核心设定、长期知识和记忆策略 | 角色版本 / 角色项目 | 跨项目、版本化          |
| 一次角色对话产生的记忆           | 角色对话运行        | run-scoped，可审阅提升  |
| 世界关系、事件和经历             | World Save          | save-scoped，可审阅提升 |

角色运行或世界经历只有经过显式审阅和提升，才能进入后续角色版本；不得自动污染全局角色事实。

### 9. Agent scope 与 Activity 路由保持显式

Desktop 使用两个 Agent 展示 scope，但不建立两套 Agent runtime：

| 展示 scope     | 职责                                                                      |
| -------------- | ------------------------------------------------------------------------- |
| Director Agent | Home 中理解全局意图、发现资源、创建项目、派发明确项目 operation 和查看跨项目摘要 |
| Project Agent  | 在项目内消费明确 project/document/run context，协助创作、调试、审阅和运行 |

Director 会话创建项目时，保留来源记录并创建或选择一个 project-scoped 主会话。Project Agent 不继承隐式 active project；所有 operation、event、Job/Run command 和 projection 必须携带明确 identity。

Home 可以渲染项目会话摘要或受控会话投影，但完整项目日志、候选、运行状态和 artifact 不复制到 Home transcript。Home 只显示足以理解状态和决定是否打开项目的信息。

#### 9.1 Activity/Attention 是投影层，不是任务 owner

Desktop 不建立通用“任务栏”、全局 TaskManager 或常驻跨领域 Job 页面。活动信息按以下层级投影：

```text
Project Tab badge
  -> running / needs-review / failed / unsaved attention

Home「活动与会话」
  -> 跨项目只读摘要、过滤与导航

Project Context Dock
  -> 当前项目的 Agent / Review / Activity / 领域状态

Conversation Timeline
  -> Agent Run / Tool Call / Approval / linked Job
  -> Computer Use live session（目标 / 最近观察 / 下一动作 / Pause / Stop / Take over）

Domain surface
  -> GenerationJob / ExportJob / CharacterRun / WorldRun 等 owner projection
```

Home 与 Project badge 只能消费带 owner identity 和 projection revision 的摘要。取消、重试、恢复、打开结果和确认必须委派给 Agent 或具体领域 public port；不得提供无 owner 的 `cancelTask`、`retryTask`、`activeTask` 或 `latestTask`。关闭 Activity view 只释放 subscription 和展示状态，不终止 execution。

未来若提供底部 Status Strip，它只显示当前 Project/Surface 的紧凑状态、同步和诊断，并提供到 owning surface 的导航；不得持有 Job/Run 生命周期，也不等同 Windows taskbar 或 macOS Dock 集成。

### 10. 插件和面板采用受控贡献槽位

Desktop 不恢复通用 Workbench Core，也不允许插件任意增加 Shell、顶栏或全局导航。目标贡献层级为：

1. Agent capability / tool；
2. conversation inline result、approval 或 candidate；
3. Home 管理页中的 catalog/diagnostic projection；
4. Project 右侧 Context Dock 面板；
5. 确有持续交互需求时的中央 editor surface；
6. 只有高频、跨项目、长期存在的产品职责才进入 Home 主导航。

MVP 先显式组合 owning package 的公共入口。只有出现两个以上真实、同生命周期和同错误模型的外部贡献者时，才通过实施 OpenSpec 定义版本化 contribution contract。

专业工具 plugin 只能贡献机器可读的 launch、exchange、MCP/API automation、
Computer Use semantic profile、diagnostic 和 optional Context Dock facet。UI
“Open in…” 与 Agent automation 复用同一 Desktop application service；Computer Use
profile 不得包含任意像素坐标宏或跨应用观察。Plugin 不得为每个工具增加顶层
App/Profile，不得创建第二个 MCP/GUI Agent runtime，也不得用 Skill prompt 承担 tool
schema、命令参数、键鼠流程或轮询协议。完整边界见
[`adr-neko-desktop-professional-tool-handoff-and-mcp-boundary.md`](adr-neko-desktop-professional-tool-handoff-and-mcp-boundary.md)。

### 11. 最终产品结构收敛为入口页和三类项目页

Desktop 最终只有一套 Shell、一个 Home 入口和三类闭合 Project Profile，不增加独立 Agent App、媒体库 App、角色 App 或世界 App：

```text
Desktop Shell
  Top Project Tabs
    [Home] [内容项目] [角色项目] [世界项目] [+]

  Home
    首页 / 活动与会话 / 媒体库 / 角色库
    Skills、插件与专业工具 / Market（未来）/ 所有项目 / 设置

  Content Project
    项目资源 | Canvas / Cut / Preview / Document | Agent / Inspector / Review / Activity

  Character IP Project（人物创作）
    角色资源 | 设计 / 调试 / 互动 | Agent / Inspector / Tests / Runs

  Interactive World Project
    世界资源 | 创作 / 模拟 / 体验 | Agent / State / Events / Debug
```

#### 11.1 Home 是入口和管理面

Home 默认停留在当前界面处理普通问答、调研、一次性生成和跨项目管理。Director Agent 只有在以下情况打开项目 Tab：

- 用户明确要求创建并编辑作品；
- 用户目标必须进入 Canvas、Timeline、角色调试、世界模拟或体验表面；
- 用户选择“打开项目”审阅后台结果。

向已有项目派发批处理、分析、生成或导出 operation 时，Home 绑定明确 `projectId` 后交给 owning domain 执行，不主动抢占焦点。Home 展示状态和打开入口，但不持有项目或执行事实。

#### 11.2 三类项目共享布局，不共享领域事实

项目页共享稳定布局语法：

| 区域 | 统一职责                 | Profile 自定义内容                                                       |
| ---- | ------------------------ | ------------------------------------------------------------------------ |
| 左侧 | 项目资源与结构导航       | 内容文档/媒体；角色身份/表现；世界地点/实体/剧情/存档                    |
| 中央 | 当前主要创作或体验表面   | Canvas/Cut；角色设计/Dialogue Lab；世界编辑/模拟/游玩                    |
| 右侧 | 上下文协作与审阅         | Project Agent、Inspector、Review、Activity、State、Events、Debug 的受控组合 |
| 顶部 | 项目身份、模式和全局命令 | profile 名称、运行/待确认/失败/未保存状态和 profile mode                 |

共享的是 Shell、Host ports、Agent/Activity projection、ContentLocator/稳定领域 ref 和 `@neko/ui` primitive。Content、Character、World 各自拥有项目事实、运行生命周期和验收，不通过万能 Canvas、Agent transcript 或 active Tab 共享状态。

#### 11.3 开源参考映射到现有页面，不创造新页面模型

| 参考         | 采用位置                                                                                                   | 不改变的边界                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| OpenCode     | Desktop 生命周期、终端/任务 transport、Server Session 与 window Tab 分层、Home session timeline 性能与测试 | 不增加代码编辑器中心工作台，不采用其 server/store，不把目录/VCS 等同 Neko Project                    |
| Zed          | Project 分组的并行 Thread、统一 Thread shell 和多 backend adapter 投影                                     | 不采用编辑器/worktree 产品骨架，不把 Thread 类型等同 Project Profile，不增加第二套内部 Agent runtime |
| Craft Agents | Home 多会话 Inbox、权限、Sources、后台任务和结果审阅；项目右侧 Agent/Review                                | 不让 session/status 成为内容、角色或世界事实                                                         |
| Goose        | 未来可选 ACP backend、MCP App 受控结果或面板                                                               | 不改变 Pi 默认路径，不把 ACP 或 Rust Agent Core 变成项目/媒体真值                                    |
| MiniMax Hub  | Home 入口、顶部项目工作集、左中右项目工作台                                                                | 不把所有 Profile 收敛为一个 Canvas                                                                   |
| Codex        | Home 先处理任务、需要稳定项目上下文时进入 Project 的导航原则                                               | 不采用通用 IDE Workbench 或任意 UI 插件贡献                                                          |

最终产品不是 VS Code 的内容创作换肤，也不是多个工具页面的集合，而是 Agent 驱动的创作 Shell：Home 负责发现、管理和派发，Project Profile 负责持久创作、调试、运行和交付。

## 五层分析

### 职责

- Desktop Shell 拥有 Home、Project Tab 展示状态、导航和跨领域 projection 组合。
- Agent 拥有会话、消息、Agent Run/Tool Call 投影和 Agent reasoning，不拥有媒体、角色、世界或领域 Job 事实。
- Assets/Entity 拥有素材与稳定实体事实及其绑定。
- Content、Character、World 各自由明确 owning domain 拥有项目事实、运行和验证；Character 的第一阶段 owner 已是顶级 `neko-chara`，World 的拟议 owner 是平级顶级 `neko-world`，不存在实现时必须先建立 canonical owner。
- Market/Plugin 安装与信任需要独立 owner，不能由 Home UI 或 Skill runtime 顺便承担。

### 依赖

- Desktop renderer 只依赖浏览器安全的公共 contract、UI root 和 host adapter。
- Home 管理页不得导入领域私有存储或另一个功能包内部实现。
- Project Profile 之间通过稳定 ref、handoff contract 和公共服务连接，不直接修改对方私有状态；World 只引用已发布 CharacterVersion，Character core 不依赖 World 私有 runtime。
- 项目、角色、世界运行和领域 Job 不通过 active Tab 共享可变状态。

### 接口

未来实施至少需要明确区分：

- `ProjectIdentity` 与 closed project profile；
- `WindowId`、`ProjectTabId`、`ConversationViewId`、`SurfaceViewId` 与可恢复展示投影；
- global/project Agent session scope；
- `ConversationId`、Host-owned `ConversationRuntime`、`AgentRunId`、child/delegation run 与 backend/profile binding；
- `ToolCallId`、GenerationJobRef、ExportJobRef 和其他 owning-domain Job/Run identity；
- CharacterProject/CharacterVersion/CharacterRun 与 WorldProject/WorldVersion/WorldRun/WorldSave/Replay；
- WorldCharacterBinding、角色环境观察/行动 port 及 Agent capability contribution；
- Character/World application service 与 package-local consumer-owned ports；
- actor/CharacterRun/AgentSession 映射、effective capability policy 和 revisioned WorldAction；
- Media/Character candidate、accept、publish 和 cross-project handoff；
- Home management projection 与 owning-domain mutation command。

本文不冻结字段和 schema；它冻结对象边界和禁止的隐式 fallback。

### 扩展

- 新项目类型必须证明其核心事实、运行生命周期和中央交互无法由现有 Profile 表达；不得为每个 Skill 或插件创建 Project Profile。
- 新 Home 一级入口必须是高频、跨项目、长期管理职责；低频能力进入命令、搜索或管理子页。
- Content、Character、World 可以共享资源、UI primitive 和 host port，但不共享 active state 或复制领域模型。

### 测试

未来实施需要覆盖：

- Home 会话、Project Tab、项目、Agent Run/Tool Call 和领域 Job/Run 身份隔离；
- 同一 Conversation 在一个 Window 内 view 去重、跨 Window view 共享同一 Host runtime；
- 关闭 Conversation view 或 Project Tab 后 Conversation、当前 run、项目和领域 Job/Run 按 owning lifecycle 继续存在；
- abort、archive、delete Conversation 与 cancel domain Job/Run 命中不同 public operation，且不通过 active view 推断目标；
- subagent 默认投影为父 Conversation 下的 child/delegation run，只有显式提升才产生新 Conversation identity；
- 取消创建不产生空项目/会话/Tab；
- 三类 Project Profile 路由及非法 profile fail-visible；
- candidate 不自动写入媒体/角色库；
- 世界运行不修改全局角色版本；
- roleplay run、world save 与 Agent session 不混用；
- 插件不能绕过受控槽位注册任意 Shell surface；
- 专业工具 UI/MCP/Computer Use 命中同一 integration/application service，外部
  mutation 使用明确 session/document/window identity；Computer Use 支持用户接管且
  不能凭截图声明完成，round-trip 不静默覆盖项目事实；
- Project/Conversation/Surface replica 先安装 snapshot 再接受连续 patch；gap、base
  revision、owner 或 view epoch 不匹配时 fail-visible 并重新附着；
- 快速切换/关闭 Tab、跨窗口观察同一 owner、autosave 与迟到 command response 不会写错
  view、覆盖新 revision、重复提交或错误停止 Host execution；
- React StrictMode 重复 mount/unmount 不重复订阅或提交，Activity/badge 不依赖已加载 view；
- Desktop 真实运行态中的跨项目切换、attention badge、恢复和资源释放。

## 实施门槛与阶段

本文是 Proposed UX ADR，不授权直接开发。进入实现前必须创建新的 OpenSpec change，并按最小边界分阶段：

1. **前端界面与子包接入**：定义 Desktop Shell、Home、Project/Window/View identity、
   Project Tabs、Conversation/Runtime/Run 与 owning-domain Job/Run ref；以现有 Agent、
   Assets/Content/Media Library、Canvas、Cut、Preview/Media、Generation/Quality、
   Chara/Entity 和 Tools/Diagnostics 交付真实 Content Profile 闭环。
2. **跨平台能力**：不改变信息架构和领域 owner，在 macOS、Linux 和 Windows 的真实平台
   资格流程中验证 Window/Tab 恢复、输入/快捷键、文件/媒体、GPU、打包、安装和更新。
   Windows 当前仍 deferred，只有单独 OpenSpec 和真实 Windows 证据通过后才成为支持目标。
3. **MCP、插件和专业工具**：通过受控 contribution slot、唯一 MCP Manager 和同一
   Professional Tool application service 接入 ComfyUI、剪辑软件、Blender、Unity、
   Photoshop、Live2D 等；MCP/API 优先，Computer Use 只作为显式补充 transport。

完整阶段切片、工具矩阵和完成门禁见 [`../../ROADMAP_CN.md`](../../ROADMAP_CN.md)。
阶段 1 只能展示尚不可用的 Profile 为明确 unavailable，不能创建成功空项目、默认空事实或
兼容 no-op。CharacterProject/Version 和 WorldProject/Run/Save 仍需各自领域 OpenSpec，
不得因三阶段路线图而塞入 Shell 或插件实现。

## 后果

- Home 成为跨项目资源与会话管理中心，项目 Tab 成为当前工作集，职责清晰且导航连续。
- 内容、角色和世界共享产品 Shell，但不会被迫共用一个万能 Canvas 或同一运行状态。
- 角色库与角色项目、角色版本与世界 NPC binding、Agent 会话与领域运行具有明确边界。
- 项目可以在未打开 Tab 时继续 owner policy 允许 detach 的执行，用户不会被后台工作强制抢占焦点。
- Character 与 World 是显著的新领域投资，不能仅靠复用现有 Preview/Entity/Canvas UI 宣称完成。
- Market 仍是未来能力，目标 UX 位置不会恢复当前已删除的运行路径。
- OpenCode、Zed、Craft Agents 和 Goose 的经验分别落入宿主/Session-View 分层、Project-Thread/backend adapter、UX 和可选协议边界，不会增加第四类页面或第二套 Agent canonical path。

## 被拒绝的方案

- Home Agent 执行并持有所有项目状态：拒绝，因多项目身份、生命周期和错误归属不清。
- 用户每次提交创作目标都立即跳转项目：拒绝，因一次性目标和后台执行会持续抢占焦点。
- Home 只做欢迎页，所有管理都进入项目：拒绝，因媒体、角色、Skill、插件和项目 catalog 是跨项目职责。
- 顶部 Tab 同时混放项目、Agent 会话、文档和运行：拒绝，因关闭、恢复和身份语义不可预测。
- 使用一个通用无限 Canvas 表达内容、角色调试和世界游玩：拒绝，因领域交互和运行生命周期不同。
- 把角色项目等同于角色库详情页：拒绝，因深度创作、候选、测试和发布需要独立项目生命周期。
- 每个 NPC 都必须先成为完整角色 IP：拒绝，因会给世界创作引入不必要成本。
- 世界运行自动回写角色长期记忆：拒绝，因 save-scoped 经历不能静默成为跨项目角色事实。
- 恢复旧 Model/Puppet/Scene/Market 包和兼容 route：拒绝，因当前架构已删除这些产品事实，未来必须建立新的 canonical owner。

## 参考

仓库内：

- [`adr-neko-desktop-composition-and-open-source-reference-boundary.md`](adr-neko-desktop-composition-and-open-source-reference-boundary.md)
- [`adr-neko-desktop-professional-tool-handoff-and-mcp-boundary.md`](adr-neko-desktop-professional-tool-handoff-and-mcp-boundary.md)
- [`application-composition.md`](application-composition.md)
- [`package-boundaries.md`](package-boundaries.md)
- [`adr-agent-message-task-queue-boundary.md`](adr-agent-message-task-queue-boundary.md)
- [`adr-agent-tool-call-domain-job-lifecycle-boundary.md`](adr-agent-tool-call-domain-job-lifecycle-boundary.md)
- [`adr-agent-skill-catalog-activation-boundary.md`](adr-agent-skill-catalog-activation-boundary.md)
- [`asset-library.md`](asset-library.md)
- [`unified-entity.md`](unified-entity.md)
- [`adr-preview-3d-reference-staging-boundary.md`](adr-preview-3d-reference-staging-boundary.md)
- [`../research/desktop-agent-client-architecture-reference-2026-07-22.md`](../research/desktop-agent-client-architecture-reference-2026-07-22.md)
- [`../../openspec/changes/consolidate-desktop-shell-activity-profile-docs/`](../../openspec/changes/consolidate-desktop-shell-activity-profile-docs/)

外部参考快照（2026-07-22，产品界面和能力可能变化，实施时需重新核验）：

- [MiniMax Hub](https://hub.minimaxi.com/)
- [MiniMax Hub 新手指南](https://my.feishu.cn/wiki/VEoVwpfCKiTHvHkAGQ7cQJxCncf)
- [OpenCode Server](https://opencode.ai/docs/server/) 与 [Agents](https://opencode.ai/docs/agents/)
- [Zed Agents](https://zed.dev/docs/ai/agents) 与 [Parallel Agents](https://zed.dev/docs/ai/parallel-agents)
- [Craft Agents 文档](https://agents.craft.do/docs/getting-started/introduction)
- [Goose Desktop](https://github.com/aaif-goose/goose/blob/main/ui/desktop/README.md) 与 [ACP 集成说明](https://github.com/aaif-goose/goose/blob/main/CUSTOM_DISTROS.md)
- [OpenAI Codex](https://github.com/openai/codex)
