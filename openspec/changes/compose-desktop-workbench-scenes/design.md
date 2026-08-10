## Context

Desktop 目前由 `DesktopShell` 在 Home、Project workspace 和 Settings 三条顶层路径之间切换。Home 与 Project 分别组装 `DesktopApplicationSidebarFrame`，Project 路径才创建 `ControlledWorkbenchShell` 和完整 `DesktopAgentSurface -> AgentWebviewRoot`。Home 的 `HomeStartCreating` 只把文本通过 `agentInitialInput` 预填到默认或选中的 Project Agent；扩展和项目管理 UI 也直接位于 Desktop renderer。

现有 workspace Agent 已拥有完整 composer、模型、文件/mention、命令、Skill、执行/审批、会话 Tab、历史和语音入口。现有 Agent application runtime 按 Workspace identity 组合，Assistant 的用户级 conversation storage、scratch 和无目录 capability scope 尚未定义。Assets 已有 global-library Root，资源管理与 Preview 仍缺少同一 package-owned selection session。

本变更保留 `fix-desktop-agent-shell-regressions` 已验证的 Agent、Canvas、Preview、Cut、Resource Browser、主题、display mode 和 resize 行为，取代 `integrate-desktop-agent-home` 的 Home handoff 目标，并更新 Phase 1 workflow：窗口启动后直接进入统一 Workbench 的 Agent scene，不再经过独立 Home 页面。

### 五层分析

| 层次 | 结论                                                                                                                                                                                                                                |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 职责 | Host Shell 拥有窗口 scene/sidebar projection、实例目录与 owner 内串行 transition；Agent authority 拥有 scope、conversation 和 scratch lifecycle；Assets 拥有资源中心 selection session；Desktop 只组合 Roots 和 Electron adapters。 |
| 依赖 | Scene contract host-neutral；Webview 不依赖 Electron/Node；目录和资源只以 opaque grant/descriptor 跨 preload；领域 package 不依赖 app root。                                                                                        |
| 接口 | 使用 closed scene union、slot-specific Surface refs、精确 instance identity 和 typed transition request；不传 React component、绝对路径、credential 或任意 registry key。                                                           |
| 扩展 | 新 scene 必须先有 owner、runtime、public Surface 和 lifecycle；closed union 按真实能力升级，不建立动态页面 DSL。                                                                                                                    |
| 测试 | Producer/consumer codec、实例隔离、package Root、Desktop delegation、旧路径缺席、Agent evaluation 与真实 Electron layout/lifecycle 分层验证。                                                                                       |

## Goals / Non-Goals

**Goals:**

- 所有 Desktop 产品界面都使用一个窗口级 PrimarySidebar 和一个 ControlledWorkbenchShell。
- PrimarySidebar 在所有场景持续显示应用导航、最近项目、最近 Agent 会话与状态/设置。
- 同一 Workbench primitive 支持 Agent-only、Agent + Main、Agent + Main + Manager 和 management Main + optional Secondary Main 等明确形态。
- 一级侧栏只提交 typed scene intent，不渲染或拥有领域页面。
- 同一个 AgentWebviewRoot 服务入口 draft、Assistant session 和 Workspace session。
- 每次“开始创作”创建新的未绑定 Entry Draft identity，旧 session UI 状态不能泄漏到新 draft。
- 未绑定 Entry Draft 直接提交时自动使用 Assistant 用户区；选择目录/Project 时使用 Workspace；选择角色/Room 时使用对应 owner，不要求发送前先点 owner 卡片。
- Assistant 使用 OpenNeko 用户资源、显式文件 grant 和可恢复 conversation scratch。
- 用户显式选择已添加 Project 或系统目录后只获得当前 Entry Draft 的单选 Workspace target receipt；发送前不切换 Scene、不激活 creative Workbench、不创建 conversation。
- 资源中心以 Assets management 为 Main，authorized Preview 只作为可选 Secondary Main。
- 保持现有 workspace Agent、Canvas、Preview、Cut、Resource Browser 的行为和身份。

**Non-Goals:**

- 不实现尚不存在的 Character Manager、Interactive Main、World authoring 或 World experience owner；只定义角色扮演/聊天室的 Workbench slot 形态和 unavailable 行为。
- 不让模型文本、route string 或 active Project 决定权限 scope。
- 不授予 Assistant 整个用户 Home、配置、credential 或插件目录。
- 不创建通用页面 DSL、动态 scene registry、Desktop manager bag 或第二个 Agent controller。
- 不在本变更实现跨 Assistant/Workspace 或跨目录的 linked conversation/artifact handoff；只禁止原地 rebind。
- 不为缺失的 management detail producer 复制 Desktop-owned 临时业务 UI。
- 不把未实现的 Character/Room owner伪装成普通单 Agent conversation，也不在本变更实现其业务 runtime。

## Decisions

### 1. One window shell composes one current scene

`DesktopShell` 始终渲染一个 `ControlledWorkbenchShell` 结构；Settings 也只是 Workbench scene。该 React
shell 是窗口级 chrome，不是所有历史业务实例的容器。Host 只投影当前 Scene/Workspace/View identity、
布局和 slot refs，renderer 只挂载当前业务 Root；用户显式打开支持的 split 时可额外挂载一个 Secondary
Root。Workbench 的 slot 数量按场景变化，不能把 management Root 压入固定窄栏或用 Preview 替代
management Main：

```text
DesktopApplication
└─ ControlledWorkbenchShell
   ├─ primarySidebar: ApplicationPrimarySidebar
   ├─ currentInteractionOrMain
   ├─ optionalExplicitSecondary
   ├─ currentManager
   └─ status
```

Workspace、Conversation、Room、Project、Asset 和文档 identity 继续由各自 durable catalog 保存，不因
Root 卸载而关闭、删除或归档。Create 与 Assets/Extensions/Projects/Settings 是当前导航 Scene，不进入
Window 级 open Workbench catalog。每个 Window 至多保留一个未发送 Entry Draft snapshot；Conversation
历史不设总量上限，但只有当前/显式分屏 Agent Root 挂载。

切换前，owning package 保存恢复所需的最小 layout、viewport、selection、scroll、playhead 或 draft
snapshot；切回时从 durable facts 与 snapshot 重建。GPU、decoder、playback、frame-loop、subscription
和 React state 不作为持久状态，也不通过隐藏 DOM 保留。没有用户价值的瞬态页面不创建 snapshot。

Agent turn、queue、approval、transcript 和 lease 属于 `@neko/agent-runtime`。运行中、排队中或等待用户
处理的 Conversation 在其 Root 卸载后继续运行；不可见且空闲的 Conversation/Workspace runtime 释放后
从本地 authority 恢复。具体 UI/runtime bounds、应用级 provider 并发和释放条件由
`bound-desktop-ui-residency` 定义，本变更不再声明 Host-owned Renderer lifecycle policy。

实例与状态遵循以下不变量：

1. durable record 存在不代表 Root 或 runtime 常驻；
2. 当前 selection 只选择展示投影，不成为 Conversation、Workspace、Asset 或文档事实 owner；
3. 后台执行是否继续由 exact task/queue/approval identity 决定，不由 active Scene 决定；
4. package snapshot 只保存恢复所需展示状态，不复制领域事实、路径、handle 或 provider stream；
5. Root 重建失败只影响该 Surface，并显示 owner-qualified diagnostic；
6. 不引入通用 LRU、跨领域 cache manager、旧 lifecycle reader 或双路径。

#### Invalid persisted Window isolation

Shell authority 的 outer document、Project catalog 与存储并发字段仍是严格边界；Window 列表则按
`windowId` 逐项解析。一个 Window 使用旧字段、未知 Scene、无效 active Workbench 或跨 owner 引用时，
Host 不把它转换为 canonical Workbench，也不让它阻断 Desktop startup。该 Window 从可运行目录隔离，
原始结构由 Shell codec 的显式 serialization boundary 随后续正常提交保留，安全 diagnostic 投影到新建
Window。`primaryWindowId` 指向被隔离 Window 时只在运行投影中视为无可恢复主 Window，Host 创建新的
Entry Draft Window；不得复用失效 identity、删除原对象或调用旧 reader。有效 Project catalog 和其他
Window 继续可用，因此用户仍可从最近项目显式重新打开 Workspace。

若失效发生在 Window 隔离之前的 Shell authority 根（例如包含已删除的内部版本字段），严格 codec 仍
必须拒绝该文档，不能忽略字段或调用旧 reader。Local Metadata 在显式 Desktop startup recovery 边界内
原样写入独立 quarantine 记录，并在同一事务中初始化新的空 canonical Shell authority；Host 通过只读
diagnostic adapter 将该拒绝投影到新 Entry Draft Window。quarantine 必须保留原 `document_json`、原存储
revision、authority identity、错误摘要和时间，正常 Shell commit 不得覆盖它。该恢复不得重置 Settings、
项目文件、Agent conversation、Assets 或其他 authority；若 quarantine 写入失败，startup 继续 fail-visible。

Application Settings 是与 Shell 分离的 Desktop presentation authority。若它自身因旧字段或非法根 shape
被严格 codec 拒绝，同一个显式 startup recovery 边界必须单独 quarantine 原 Settings 文档并只初始化
canonical 默认 Settings；不得借此重置已恢复的 Shell、项目、Agent conversation、Assets 或其他
authority。Shell 与 Settings recovery 各自产生 owner-qualified startup diagnostic，任一 quarantine 或
replacement 失败都保持 startup-blocking。Shell 失效时不得顺带恢复 Settings，Settings 失效时也不得修改
Shell；只有各自 codec 实际拒绝的 authority 才进入 recovery。

持久 Window/Workbench shape 通过 codec 后，Host 在 Window claim 时仍必须用 Agent authority 的
owner-qualified Home projection 重新资格化每个 session Agent Surface。若某 Surface 的
`conversationId + owner` 已被 canonical Conversation catalog 拒绝或不再存在，Host 只关闭该 Shell
Surface binding；原 Conversation authority row、Pi transcript 和同 Window 的其他 Workbench/Surface
保持不变。若失效 Surface 是该 Workbench 的 active Surface，Host 在同一 owner 下创建新的 draft
Surface 并原子切换 Scene，使 renderer 不会先挂载一个必然 bootstrap 失败的 session。Agent Home 的
`invalid-conversation-record` diagnostic 继续投影给 Desktop 展示；bootstrap 保留 exact context 断言，
不得把错误 Workspace context 转换成 Assistant，也不得回退到 active/recent Conversation。

明确形态矩阵：

| 场景                | Interaction                                                 | Main                                       | Secondary Main                | Manager                                                                 |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------ | ----------------------------- | ----------------------------------------------------------------------- |
| 默认 Agent draft    | 完整 Agent，使用 Workspace Agent 面板样式并占据唯一业务区域 | 无                                         | 无                            | 无                                                                      |
| Assistant activated | 完整 Agent                                                  | Assistant Preview / interaction result     | 可选                          | 无独立 Assistant Resources 栏；授权资源仍由 Agent 控件与 authority 管理 |
| Workspace           | 完整 Agent                                                  | Canvas/Cut/Model/Preview 等 Workspace Main | 按 Workspace display mode     | Workspace Resources 位于右侧                                            |
| Character/Chatroom  | Agent dialogue/group chat                                   | Interactive Main                           | 可选                          | Character Manager 位于右侧；owner 未实现时 fail-visible                 |
| Asset Center        | 无                                                          | Asset Management Root                      | 选中资源的 authorized Preview | 无                                                                      |
| Extensions          | 无                                                          | Extension Management Root                  | 可选 Extension Detail         | 无                                                                      |
| Project management  | 无                                                          | Project Management Root                    | 可选 Project Detail           | 无                                                                      |
| Settings            | 无                                                          | Settings Main                              | 无                            | Settings navigation可位于左侧                                           |

PrimarySidebar 不属于任何旧 Home scene。它持续消费 `catalog.projects` 与 `agentHome.conversations`，因此删除 Home composer/management page 时必须保留最近项目、最近会话、attention 和显式恢复/删除操作。

Extensions Scene 将 management 与 configuration 组合为按选择出现的两个 sibling panel。Agent Webview
拥有当前 `skills | extensions` 分类、查询、`grid | list` 展示模式和精确选择；这些均为 Scene Root
卸载即可丢弃的 presentation state，不进入 Host Scene、durable catalog 或全局 store。Management Main
只呈现可扫描目录与目录级动作；默认不选择条目并独占全部 Main，只有用户选择有效 Skill 或扩展后才
挂载 Secondary Main，呈现对应详情和条目级动作。两个 panel 贴边共享一条视觉边界，resize handle 覆盖
在分界线上而不占据空白 margin/gap。Skill 配置
仅包含 Skill 的来源、描述与允许的个人 Skill 管理操作；Automation endpoint、Computer Use Host
permission 及其他扩展运行时配置只在 `extensions` 分类下挂载。Desktop 只提供两个 Workbench panel
target、typed Host adapter 和 Automation configuration slot，不复制 Agent catalog 或选择规则。目录在
grid/list 间切换时保持同一选择和 detail identity；切换分类时只恢复该分类内仍有效的选择，非法或消失
的条目只清空当前分类的 detail 并恢复全宽 management。

#### Window claim always enters a fresh Entry Draft

应用启动或用户重新打开一个已经释放的 Window 时，Host Shell 的 `claimWindowId()` 是唯一 startup
presentation owner。它先把当前 Project layout 捕获到 exact tab snapshot，再保留 Window identity、
PrimarySidebar、Project tabs/catalog 与所有 durable domain records，随后用新的 `draftId` 原子替换当前
Workbench layout/Scene 为 canonical unbound Entry。上次可见 Workspace、conversation、Assets、Extensions、
Projects 或 Settings Scene 不参与启动选择，也不自动 attach runtime。

该语义不同于 Renderer reload：同一已 claim Window 的 renderer session replacement 继续读取当前 exact
Scene，不创建 draft、不切换入口。Application Settings 因此删除 `startupTarget` 与“恢复上次工作区”UI；
Desktop Main 不再把 preference 传给 Shell，Shell 也不保留 `home | restore` 分支。旧 Settings 文档不能走
兼容 reader 或字段迁移；既有 authority-local strict recovery 将原记录 quarantine 后只初始化 canonical
Settings defaults，并投影 diagnostic。Shell、Project、Conversation、Assets 与用户文件不受影响。

PrimarySidebar 顶部品牌区只承载自身显隐控件。Exact Workspace composition 通过 `ControlledWorkbenchShell.titleBar` 插槽把 Agent、Main、管理面板与 Cut Panel 四个独立控件浮置在现有窗口顶部 chrome 右侧；该插槽在 Desktop 视觉层使用 absolute overlay，不参与 Workbench grid track sizing，不增加背景、边框、标题或额外 header 高度，并保持与 macOS 原生 title chrome 的垂直对齐。每个控件只改变其所属区域的 presentation，不能通过一个混合菜单或 Main 内按钮同时管理多个区域；Agent 与 Main 仍必须保证至少一个业务区域可见。

Window 级 Main、Interaction 与 Manager Surface 必须 full-bleed 占用 `ControlledWorkbenchShell` 分配的完整 grid track。Desktop 不得通过 panel 外层 margin、Dock padding、responsive inset 或顶层圆角缩小 package Root/Webview viewport 或露出 Window 背景；顶层 panel shell 使用直角边界，Sidebar/Main 和兄弟 Surface 的结构关系由 divider、现有 resize primitive 与功能性 gutter 表达。Overlay/Docked manager 在其当前业务 track 内同样使用完整高度、直角和外侧边界。领域页面的 readable width、toolbar alignment、内容 padding 和内部组件圆角继续由 owning package 管理，因此删除 Window 装饰性 inset 与圆角不得拉伸管理控件或把页面内容贴到窗口边缘。

Workspace Main 的真实 View tab strip 与相邻 Resource Manager header 共享 Desktop-owned `38px` panel chrome 尺寸。`@neko/ui` 的通用 editor tabs 保留默认高度；Desktop composition 只在 `.project-main-group__tabs` 内覆盖 strip 的 block padding 和高度，使 `30px` tab 在 `38px` chrome 中垂直居中。Main/Resources resize、显隐与响应式切换不得改变两条 chrome 的 top/bottom 对齐。

Workspace Main 上半区域继续承载 Canvas、authorized file Preview 或 Editor。Main 下方的 Cut Panel 是独立可调整高度的可见 composition；其轻量 projection 保存 exact Cut View refs、active View、显隐和高度，但不拥有 OTIO 事实或 runtime。每个已保存 OTIO 文档或未保存 Cut draft 对应一个 Cut Panel tab；只挂载 active tab 的 `CutWebviewRoot`，并由该 Root 组合上部 Preview、下部 Timeline 与素材拖拽目标。切换 tab 时卸载旧 Root 并从 Cut authority/presentation snapshot 重建新 Root；隐藏 panel 时卸载 active Root但保留轻量 tab refs，不能保留隐藏 DOM/runtime。打开 OTIO 只打开或聚焦对应 Cut tab并显示 panel，不替换当前 Main Canvas/Preview/Editor。关闭最后一个 Cut tab时 panel 回到 canonical hidden fresh state。顶部 Cut Panel 开关在已有 tab 时只修改 panel presentation；没有 tab 且 Cut capability 可用时，请求 Cut application 创建唯一的 exact 未命名内存 draft 并附着一个 Cut View，而不是让 renderer 伪造空 panel、回退历史 runtime 或提前创建 OTIO 文件。已有 panel 的 `+` 紧随最后一个 Cut tab，是独立 Cut 创建命令；标签较少时 tab list 按内容收缩，不把 `+` 推到面板远端，标签溢出时只让 tab list 滚动并保留 `+` 的固定命中尺寸。每次完成的点击都由 Cut application 创建新的 exact draft、生成不冲突的本地化标签、追加并选中 View；同一时刻针对 exact Workbench 的并发请求只共享一次创建操作。Timeline 标尺仍位于 canonical Timeline 滚动容器中，与 clips 共用横向坐标，并在轨道纵向滚动时 sticky 到容器顶部，不能复制为第二个 overlay 标尺。Cut capability unavailable 时按钮才禁用。Scene 可投影 active `workspace-cut` Surface identity，但不投影 standalone Timeline Surface。

任意已有 OTIO 的文件发现和打开继续由 Workspace Resources 与 Cut tab composition 负责；Canvas 不增加文件选择器、OTIO catalog 或另一个打开路径。Canvas 只保留 owner-projected “Open in Cut” 素材动作，把当前精确选择交给 Cut owner；它不能借此推断、浏览或替换已有 OTIO 文档。

未命名 Cut draft 由 Cut application/runtime 拥有稳定 draft identity、canonical 空 OTIO model、dirty 状态和工作区授权；Workbench 只持有 exact View ref。空 OTIO 继续使用同一个 Cut Root、Preview、Timeline、轨道和 canonical 素材命令，Timeline 按文档本身的空轨道状态自然渲染，不叠加独立 empty-state 文案或修改 Timeline 几何。active Cut Root 在现有 Timeline toolbar 提供图标保存命令，且 package-owned keyboard dispatcher 将 `Cmd/Ctrl+S` 绑定到同一个 `CutOtioController.save()`；两者只在 exact active document projection 存在时执行，不新增 Workbench command router 或第二条保存路径。首次保存由 Desktop native adapter 选择当前 Workspace 内的 `.otio` 位置，Cut owner 在一次 identity rebind 中 rebase media refs、排他写入、更新 View document identity/label 并保留同一 View/session；取消选择保持原 draft。关闭 dirty draft 时 Cut owner 请求放弃确认：取消保持 exact draft/View，确认后先移除 exact View projection再释放该 runtime；不得影响 sibling tabs、上部 Main 或 Workspace 资源。保存后的 OTIO 按普通文档 dirty/close policy 处理。

未命名 draft 的 authoritative document/session 不跨应用进程恢复，因此 `cut-draft:*` View ref 不是 durable document fact。Desktop Shell 启动恢复边界必须在挂载 Scene Root 前，从当前 Workbench 与所有 Project presentation snapshot 中逐项移除这些失效 View，并同步重投影 Cut slot；清理必须返回 owner-qualified presentation-reset diagnostic。真实 `.otio` View 与用户文件保持原样。恢复边界不得把 draft identity 传给 Workspace file resolver，也不得创建 canonical 空 OTIO 来伪装恢复可能包含未保存编辑的旧草稿。当前进程内仍有 exact Cut session 的 draft 不受普通布局切换或 React Root 卸载影响。

Workspace 控件使用固定尺寸、无边框、透明默认态和清晰 hover/pressed/focus 状态，并避开实际 Main tab buttons；非 Workspace Scene 不挂载该组控件。按钮按可见空间结构固定为 Agent、Main、Cut Panel、资源管理，保持左侧区域、中心上部、中心下部、右侧区域的阅读顺序。选中态必须同时来自 exact Scene slot 与当前 layout presentation：只有区域实际可见时才选中；仅保留可恢复布局记录、但 slot 缺失或 presentation 已隐藏时保持未选中，其中隐藏的 Cut Panel 在仍有 exact Cut View 时继续可点击恢复，没有 Cut View 时保持未选中但可创建 draft。它们不得沉入侧栏、Workspace Main tab header 或领域 Surface，资源管理标题也不重复提供关闭动作。footer 只保留 lifecycle、attention、Settings 等非布局操作。控件只承担布局命令，不承载任务、运行或错误状态；这些状态继续由 owning panel、内容区或状态栏展示。

`HomeWorkspace`、`ContentProjectWorkspace` 和 Settings 顶层条件分支被替换为 scene slot builders。
Scene 切换只更新 active instance/slot projection；PrimarySidebar、ControlledWorkbenchShell 以及未关闭
instance 的 package Root identity 保持不变。Project slot builder 复用现有 Agent/Main/Resource/Cut
components、View identity、layout helpers 和 `.project-workspace` 视觉契约，不自行创建
Shell 或 sidebar frame。Renderer 必须逐一消费 Host 的 `interaction/main/secondaryMain/leftManager/
rightManager` 语义，不能把 Interaction 临时当 Main、把 management Main 当 Dock，或仅复用 Shell
JSX 而丢失 Workspace CSS scope。

### 2. Scene projection is closed, canonical and slot-specific

`@neko/host/desktop-shell-contract` 增加窗口级 scene aggregate。下列类型表达约束形状；实现必须复用现有 identity codecs，不能退化为未校验字符串：

```ts
type DesktopWorkbenchSceneContext =
  | { kind: 'agent'; agentViewId: AgentViewId; scope: AgentScopeRef }
  | { kind: 'asset-center'; assetCenterSessionId: AssetCenterSessionId }
  | { kind: 'extensions'; extensionManagementSessionId: ExtensionManagementSessionId }
  | { kind: 'project-management'; projectManagementSessionId: ProjectManagementSessionId }
  | { kind: 'settings'; settingsSectionId: SettingsSectionId };

type AgentScopeRef =
  | { kind: 'assistant'; assistantSpaceId: AssistantSpaceId; conversationId?: ConversationId }
  | {
      kind: 'workspace';
      workspaceId: WorkspaceId;
      workspaceGrantId: WorkspaceGrantId;
      conversationId?: ConversationId;
    };

type InteractionSurfaceRef = {
  kind: 'agent';
  agentViewId: AgentViewId;
  phase: 'draft' | 'session';
  scope: AgentScopeRef;
};

type MainSurfaceRef =
  | {
      kind: 'assistant-preview';
      previewSessionId: PreviewSessionId;
      assistantSpaceId: AssistantSpaceId;
    }
  | { kind: 'workspace-main'; workspaceId: WorkspaceId; viewId: ViewId }
  | { kind: 'asset-management'; assetCenterSessionId: AssetCenterSessionId }
  | {
      kind: 'asset-preview';
      assetCenterSessionId: AssetCenterSessionId;
      previewSessionId: PreviewSessionId;
    }
  | { kind: 'extension-management'; extensionManagementSessionId: ExtensionManagementSessionId }
  | { kind: 'extension-detail'; extensionManagementSessionId: ExtensionManagementSessionId }
  | { kind: 'project-management'; projectManagementSessionId: ProjectManagementSessionId }
  | { kind: 'project-detail'; projectManagementSessionId: ProjectManagementSessionId }
  | { kind: 'settings-main'; settingsSectionId: SettingsSectionId };

type ManagerSurfaceRef =
  | { kind: 'workspace-resources'; workspaceId: WorkspaceId }
  | { kind: 'settings-navigation'; settingsSectionId: SettingsSectionId };

interface DesktopWorkbenchSceneProjection {
  sceneId: SceneId;
  windowId: WindowId;
  context: DesktopWorkbenchSceneContext;
  slots: {
    interaction?: InteractionSurfaceRef;
    main?: MainSurfaceRef;
    secondaryMain?: MainSurfaceRef;
    leftManager?: ManagerSurfaceRef;
    rightManager?: ManagerSurfaceRef;
    cutPanel?: CutPanelSurfaceRef;
    status?: StatusSurfaceRef;
  };
}
```

Codec 必须验证 context 与每个 slot 的 identity/scope 一致。例如 Assistant scene 不允许 Workspace Main，Asset Preview 必须与同一 AssetCenterSession 配对，Settings 不允许 Agent。Unknown kind、缺失 owner、跨 window/view/session ref 和 renderer payload 全部失败。`DesktopWorkbenchLayoutProjection.cutPanel` 使用一个 canonical shape 保存 presentation、height、exact Cut View refs 与 active View；Main View 不携带 Cut presentation。Scene 只投影 active `workspace-cut` Surface，不保存 Timeline owner 或 standalone Timeline Surface。

### 3. Scene transitions are typed Host commands

一级侧栏和显式内容操作只发送 typed transition intent：

```ts
type DesktopSceneTransitionIntent =
  | { kind: 'open-agent-entry' }
  | { kind: 'bind-agent-assistant'; draftId: AgentDraftId }
  | { kind: 'open-workspace'; workspaceGrantId: WorkspaceGrantId }
  | { kind: 'open-asset-center' }
  | { kind: 'open-extensions' }
  | { kind: 'open-project-management' }
  | { kind: 'open-settings'; sectionId?: SettingsSectionId }
  | { kind: 'restore-conversation'; conversationId: ConversationId };
```

Request 携带 requestId、Window identity、目标 Workbench/Scene identity 和操作所需的 exact owner identity。Window-owned Shell command queue 串行处理 mutation，并以 request identity 保证重试幂等；跨实例、未知或已关闭 identity 在当前 operation 边界失败。Host Shell service 根据 owner facts 产生下一个 projection；renderer 不根据 route string、组件可用性、active/first/recent Project 或模型文本推断 scene。显式请求尚未具备 owner/runtime/Surface 的 Character/World scene 时返回 owner-qualified unavailable。

Renderer reload 从 Host projection 恢复精确 scene。关闭最后一个 conversation 只回到同 scope 的 Agent draft，不默认切换目录或 Project。跨 scope/目录的 active conversation 不可原地 rebind。

`open-agent-entry` 每次必须分配新的 `draftId`，即使当前已经位于 Agent scene。它原子创建一个没有 conversation/scope binding 的独立 Surface，但不删除任何持久 conversation。Project/directory/Character/Room 选择不是 Scene transition；它只产生 exact Entry `draftId` 的 target receipt 并更新 package-owned Draft snapshot。Canonical first-submit application operation 只能在 local transaction 与 target runtime materialization 成功后激活同一 `draftId` 提交出的 exact conversation。`bind-agent-assistant` 只服务已在 Assistant owner 内发起的新会话 Draft，不用于 Entry target selection。未知、已关闭或不匹配的 draft/target intent 必须失败。未来 Character/Room owner 提供 contract 前，相关选择返回 owner-qualified unavailable。

### 4. Sidebar is a separate window presentation aggregate

Sidebar 是独立窗口 presentation aggregate，不与任一 Workbench instance 的 Main/Manager/Timeline mutable state 共用 owner：

```ts
interface DesktopApplicationSidebarProjection {
  windowId: WindowId;
  visible: boolean;
  width: number;
}
```

Sidebar mutation 携带 requestId 与 exact Window identity，在该 Window 的 presentation owner 中串行执行并只更新 sidebar aggregate。所有 producer/consumer、fixture 和测试同时使用这一 canonical shape；旧字段、旧 handler 和旧 storage dispatch 从产品路径删除，不双读双写、不在启动时转换数据。非法 sidebar 记录只禁用该 Window 的 sidebar record 并返回 diagnostic，不阻断其他 Window 或 Workbench record。

### 5. Workbench consumes Agent phase and binding without owning them

Agent Draft/binding、input catalog、configuration policy、first submit 和 Conversation owner 的 canonical contract 由 `unify-agent-launch-and-domain-bindings` 与 `@neko/agent-runtime/application` 拥有。本变更只拥有 Window Scene、Workbench slots、Root placement 和 committed launch result 的 Scene handoff；后续段落中的 Agent identity 只描述 composition input，不是第二套 Agent authority。

`AgentWebviewRoot` 是唯一 Agent UI/controller/composer。新增显式 presentation contract：

```ts
type AgentRootPresentation =
  | { kind: 'draft'; draftId: AgentDraftId; scope: { kind: 'unbound' } | AgentScopeProjection }
  | { kind: 'session'; scope: AgentScopeProjection; conversationId: ConversationId };
```

Draft 隐藏 conversation Tabs/history 等 session-only chrome，但继续复用当前 `ConversationController`、`EmptyState`、`InputAreaProvider` 和 `InputArea`。Workbench 不按 phase 或 conversation kind 增删可执行能力；Agent Root 依据 canonical launch projection呈现 catalog、配置、资源、输入与诊断。任何 Draft 都不是空 Conversation，Workbench 只在 Agent application 返回已提交并可附着的 exact Conversation 后进入 session presentation。

`draftId` 是 presentation identity，不是 conversation identity。Controller 观察到新的 `draftId` 时，必须在 package 内完成一次显式 draft transition：清空 `openTabs`、`activeConversationId`、旧 transcript/render subscription、entry input/reference/target/configuration 和 transient error；全局模型 catalog、用户 settings 与静态 capability catalog 不重建。当前 Draft snapshot 可以保存未发送 input、resource refs、单选 target receipt 和 model/configuration selection，但不得把它们提前写成 conversation effective configuration 或共享用户设置。Desktop 只挂载当前 package Root，不发送伪造 close-tab 消息，也不保留旧 Root 作为 draft 状态 owner。

Target 选择由 Agent launch application更新 exact Draft binding，Workbench 保持 Agent-only Entry Scene，不因此挂载 Workspace/Character/Room Surface。普通直接提交、Workspace target、未来 Character/Room provider 可用性和 catalog filtering 均由该 application capability 决定；Workbench 不读取关键词或 active Project。每次再次点击“开始创作”只请求新的 unbound Draft presentation，不恢复已有 Conversation。

Entry Draft 中显式授权的文件仍归 exact launch connection 与 `draftId` 所有。确定性 Assistant 首次提交在 conversation validation 前先校验请求中的全部 grant，再将匹配的 `unbound` grants 原子绑定到 exact AssistantSpace；缺失、跨 connection、跨 draft、已绑定其他 scope 或 conversation 的 grant 必须 fail-visible，且验证失败不能造成部分 scope 修改。相同 AssistantSpace 的幂等重试保持成功，但不得扩大授权集合或接受其他 draft 的 grant。

Workbench 不解释 capability catalog。Agent Root 始终使用 `agent-input-capability-catalog` 的 phase/binding availability，缺少 owner capability 时由 Agent 返回 typed diagnostic；Scene composition 不提供 default handler 或 active Project fallback。

Composer 视觉继续由 `@neko/agent-webview` 拥有并增强现有 `InputArea`、`ComposerConfigMenu` 与 `ModeSelector`，不创建 Desktop composer 或平行控件。Desktop 只通过 Agent Root 的 React presentation prop 注入 Entry 的目录选择命令；该短生命周期 UI projection 不进入 Agent authority、conversation facts 或持久 Scene schema。Composer 将 textarea 与工具条收进同一居中悬浮表面：Entry 显示单选“打开项目”和模型配置，会话态隐藏已经锁定的 Workspace 标签、Agent 模式以及 `/`、`$` 快捷按钮，同时保留文本命令/Skill 解析、附件、模型、usage、审批和发送/停止能力；不复制 Codex 的 branch/local 元信息。窄 dock 通过 package-owned responsive CSS 收缩低优先级标签并允许工具条在稳定边界内换行，菜单仍向上定位且不得溢出 Workbench。

### 6. Explicit directory authorization creates Workspace scope

目录选择是明确用户操作，不是模型推断：

1. Desktop Main 通过 native picker 授权目录并创建 sender/window-bound opaque `WorkspaceGrantId`；路径不进入 renderer、Agent message、project fact 或日志。
2. Host workspace authority 验证 grant，建立或恢复精确 Workspace identity，并返回 Workspace scope projection。
3. Agent Webview 把 exact Workspace identity/grant/label 作为当前 Draft 的单选 target receipt；Agent-only Entry Scene、Root 和 launch connection 均不变。
4. 用户提交第一条消息时，Agent authority 验证 receipt 并把 conversation context 冻结为该 Workspace identity，创建 initial message/pending turn；物化 exact runtime 成功后 Host 才切换到 Workspace Scene。

Project catalog entry 可以解析为同一 Workspace identity，但不能用 first/recent/active Project 作为隐式选择。切换到另一目录时，draft 可以替换 scope；active conversation 必须新建 conversation，原会话保持不变。

### 7. Assistant scope owns user-space and conversation scratch

`@neko/agent-runtime` application authority增加单一 canonical `AgentConversationContext`：

```ts
type AgentConversationContext =
  | {
      kind: 'assistant';
      assistantSpaceId: AssistantSpaceId;
      baseGrantIds: readonly ResourceGrantId[];
    }
  | {
      kind: 'workspace';
      workspaceId: WorkspaceId;
      workspaceGrantId: WorkspaceGrantId;
    };
```

AssistantSpace 是 OpenNeko product-managed logical user area，只投影 global resources、用户显式授权文件和该 conversation 的 scratch；它不等于用户 Home，也不包含配置、credential、extension install root 或 raw path。Agent runtime 拥有 conversation/scratch lifecycle metadata，Host Content/File ports 拥有物理 IO 与授权。

Scratch 以 `ScratchArtifactRef` 作为临时 identity，不得作为 durable Asset/Project identity写入领域事实。Conversation 存续期间 scratch 可恢复；删除 conversation 或显式清理时回收。用户接受的产物必须先通过 owning Asset/Workspace publication port 获得 durable identity，之后才能清理 scratch。异常退出只留下可恢复或可诊断状态，不静默删除。

Conversation context 保持稳定字段语义。无法满足 canonical context shape 的记录在该 conversation 边界拒绝恢复并给出 diagnostic，不修改原记录、不猜 active workspace，且不影响其他 conversations。

### 8. First submit separates local commit from external execution

Draft submit request 携带 requestId、scope、selected model/configuration 和 authorized resource refs。Agent application authority：

1. 验证 scope 与 grants；
2. 在本地 authority 原子提交 context、conversation、initial user message 和 durable pending-turn intent；
3. 通过 package-owned session materialization port，把同一 conversation identity 幂等物化到 context 指向的精确 Assistant/Workspace Agent workspace；initial user message 与 pending intent 仍由 lifecycle authority 拥有，Pi terminal checkpoint 只由真实 turn execution 写入；
4. 只有物化成功后才允许 Host 把 Scene 切换为 session 并返回已提交 conversation identity；
5. 以同一 requestId/turn identity 幂等启动 provider execution；
6. renderer 只附着 projection，不触发 turn。

Provider failure、reload 或 adapter replacement不得重复 initial message/turn。失败保留 conversation 和 pending/failed turn diagnostic，可由现有 recovery policy恢复；不能回滚为 Home handoff、空 conversation 或另一个 scope。

Session materialization 与 provider execution claim 是两个独立阶段。重放已提交 record 时，即使 provider claim 已存在，也必须先校验 exact Agent workspace conversation；缺失时由当前 canonical lifecycle operation 幂等物化该 conversation，scope identity 冲突则在该 conversation 边界 fail-visible。Bootstrap 不得改用 active conversation，也不能重新领取或执行 provider turn。lifecycle initial message/pending intent 与后续 Pi terminal checkpoint 使用各自真实 authority，不创建会阻塞同一 turn 执行的伪 pending Pi checkpoint。

Provider execution 只在精确 Conversation projection attachment 建立后启动。`config.toml` 中由配置 owner 解析的 API key 保留为对应 Agent Workspace models 实例的内存配置凭据，不重复导入全局 safeStorage；交互登录与 OAuth 凭据仍由 Host secret port 持久化。该分离避免 Electron Main 在普通配置 turn 中同步访问系统 Keychain，也避免同 provider identity 的不同 Workspace 通过共享可变凭据相互覆盖。

Entry Draft 到 session 的 renderer 交接保留同一个 `AgentWebviewRoot`，launch connection 与 session connection 各自拥有不可复用的 connection identity。Connection replacement 必须先使用创建 attachment 的原 binding/Host owner detach，再接受新 connection attachment；携带未知、旧或不匹配 connection/request identity 的 frame 在该 operation 边界失败，不能吞掉 `attachment-identity-mismatch`、用新 adapter 代旧 owner detach，或通过 React key remount 第二个 controller 规避生命周期。

### 9. Asset Center is an Assets-owned management and preview session

`@neko/assets-domain` 增加 `AssetCenterSession` application contract，拥有 catalog/filter/selection projection、owner 内串行 mutation 和 selected `ContentLocator`/Asset identity。`@neko/assets-webview` 的 Management Root 消费该 projection 并提交携带 exact session/request identity 的 selection intent。

选中资源时，Assets application service通过 Host content authorization port 请求 exact preview descriptor；`@neko/preview-*` 创建与同一 AssetCenterSession 绑定的 PreviewSession。Scene 组合：

```text
main:          AssetManagementRoot(assetCenterSessionId)
secondaryMain: PreviewRoot(previewSessionId) // only when selected and authorized
```

没有 selection 时 Secondary Main 不显示；不支持的内容保留 Main selection 并在 Secondary Main 显示 typed unavailable diagnostic。Desktop 不持有 filter、selection、Asset facts、ContentLocator interpretation 或 preview-kind switch。切换到其他 Workbench/scene 时卸载 Asset Center management 与 Preview Roots，Assets owner 保留必要的 filter/selection snapshot；授权 Preview handle、subscription 和空闲 runtime 随精确 Surface cleanup 释放，Asset catalog facts 不受影响。

### 10. Other management and Settings scenes use the same shell

Extensions 使用 Agent extension application contract 与 package public management Root，并将该 Root 放入 Main；现有 Desktop `HomeExtensions` presentation 迁移后删除。Project management 的 catalog/management Root 同样占据 Main，selection 与 explicit open-workspace action分离。Settings 将当前 configuration Surface 放入 settings navigation/main slots；设置事实继续由 `@neko/host` settings owner管理。

Assets、Extensions、Projects 与 Settings 是单例当前管理 Scene，不拥有 Window 级 durable management
Workbench instance。Settings section、资源 filter/selection 和其他有用户价值的展示状态由 owning
package 保存最小 snapshot；离开 Scene 时 Root 卸载，返回时从领域事实与 snapshot 重建。

Canvas Root 本身继续拥有完整 canvas store/runtime；选择 Canvas node 只更新 Canvas-owned selection，
不创建新的领域 node、独立 node Root 或右侧 inspector/property dock。节点选择继续由画布上的 node-local
controls 消费当前 Canvas facts；viewer 资源释放跟随 Canvas View/Root 可见性，而不跟随节点选择。
Modal/context menu invocation 结束后直接释放。

若当前没有真实 detail Root，scene 只挂载 owner-qualified catalog/empty/unavailable Surface，不在 Desktop 创建临时 domain implementation。所有 scene 都保留同一 PrimarySidebar、Workbench、主题和 resize lifecycle。

Management Main 与可选 Preview/Detail 使用 Workspace Main 相同的 panel shell、content frame 和 resize primitive，但它们是两个 full-bleed 兄弟 shell：各自拥有独立 DOM、边框、直角边界、背景、裁切和 overflow 边界，并由保留可见 gutter 的 resize composition 连接。该 gutter 是 resize 命中与兄弟 Surface 分隔，不是 Window 外层装饰性 margin。禁止让两个内容区共享一块连续 Main 底板后只绘制分隔线。两个 shell 都不渲染 Workspace View tab/header 或 Preview descriptor header；只有 Workspace Main 的真实多 View group 拥有 Workbench tab。Workspace 与 Asset Center 的 Preview 内容都使用 `@neko/preview-webview` 的 content-only chrome，并以透明内容背景继承所在 shell 的主题，而不是在 Desktop 复制 viewer 或硬编码另一组主题 token。只有 owner-qualified 且信息足以支撑独立内容区域的 Preview/Detail 才挂载 Secondary Main；低信息量的 Project selection保留在 catalog 中，显式打开 Workspace 的操作也位于对应 catalog row，不创建空洞的 Project Detail shell。组合时 management panel 默认占可用分栏的 50%，共享 resize binding 将 management ratio 下限固定为 0.5，使 Assets、Extensions 与 Projects 的管理 Main 始终不窄于 Preview/Detail；没有合格 detail 时 management shell 独占可用区域，且不保留 secondary column 或 gutter。Workspace Resource Browser 继续复用 package Root，但隐藏与 Host 自动投影重复的顶部全局刷新按钮；relink/recovery 等真实领域操作保持可用。

PrimarySidebar 顶部布局控件继续复用 `@neko/ui` 的 Codicon 入口。生产 renderer 必须让 Vite 从 query-free 的 canonical 字体引用生成 hashed asset 路径；不能依赖 vendor CSS 自带的 query-bearing URL，因为 `openneko://desktop` 协议有意拒绝所有带 query/hash 的非 canonical 应用资源请求。Desktop Main 只补齐 `.ttf` 的 `font/ttf` 响应类型并保留 `nosniff` 与 query 拒绝规则，不增加旧 URL 读取路径或第二套图标实现。

### 11. Scene activation and empty Main are atomic presentation states

打开显式 Project/Workspace 或恢复 conversation 时，Host Shell 在 Window owner 的一个串行 commit 中同时更新 exact Project `activeTarget`、对应 Workbench attachment、Scene scope/slots 与 Agent `draft | session` phase。Desktop 只有在该提交完成后才返回 transition success；renderer 不得先启动旧 scope 的 launch adapter，再等待布局或 Agent 状态补齐。App composition 可以在返回前 attach 对应 package runtime，但不能改用 active/recent Project 修复不一致状态。

Workspace 的 Main View 集允许因用户关闭最后一个 Preview/View 暂时为空。此时 Workbench 保留 primary group，Scene 移除 `slots.main`，同时继续保留 exact Workspace scope、Agent Interaction、Workspace Resources 与 Status。Renderer projection 只更新实际存在的 Main ref；不得把空 Main 当作 scene corruption。应用重启时现有 `attachProjectWorkbench` 恢复 canonical Canvas，但运行中的关闭操作不隐式发明另一个 View。

Pi transcript 中 `stopReason: error` 的 assistant entry 必须把持久化的 `errorMessage` 投影到 package-owned Agent error presentation。空 content 不得把真实 diagnostic 降级成只有固定 `Error` 标题；错误仍保持 conversation/turn scoped，不自动重试或伪装成功。

### 12. Ownership and canonical paths

### 12. Renderer runtime lifetime is separate from effect subscription lifetime

Desktop scene adapters such as `DesktopAssetCenterRuntime` are view-scoped resources. A React effect that subscribes to an existing runtime owns only that subscription; its cleanup cannot permanently dispose the memoized runtime because StrictMode deliberately executes an extra setup/cleanup/setup cycle. Runtime creation and final disposal must share the same identity owner and dispose only when the identity is replaced or the component actually leaves the tree.

The canonical fix remains fail-visible after final disposal: methods on a disposed runtime still throw. It must not make `dispose()` reversible, ignore subscribe-after-dispose, add another runtime path or remove StrictMode. A StrictMode renderer regression plus a real Electron reload/startup scenario proves the lifecycle path.

### 13. Ownership and canonical paths

| Owner                      | Public path / role                                                   | Producer                      | Consumer                   | Replaced path / user data                                              |
| -------------------------- | -------------------------------------------------------------------- | ----------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| Scene/sidebar/transition   | `@neko/host/desktop-shell-contract` + Shell service                  | Host-neutral Shell service    | Desktop renderer/preload   | 替换 Home/Project/Settings branch；迁移 sidebar presentation value     |
| Entry Draft identity       | `@neko/host/desktop-scene-contract`                                  | Host Scene authority          | Agent presentation adapter | 新 draft 不删除旧 conversation；旧稳定入口 identity 被替换             |
| Workbench primitive        | `@neko/ui/workbench`                                                 | React primitive               | Desktop scene composer     | 删除平行/nested Shell consumers                                        |
| Agent presentation         | `@neko/agent-webview/root`                                           | Agent Webview                 | Desktop Agent Surface      | 删除 Home composer/initialInput；不复制 controller                     |
| Scope/conversation/scratch | `@neko/agent-contracts` + `@neko/agent-runtime/application`          | Agent authority               | Desktop adapter/Agent Root | 补齐 existing Workspace context；新增 Assistant user-space，不暴露路径 |
| Directory authorization    | `@neko/host` workspace grant port + Desktop native adapter           | Host authority/Desktop Main   | Agent/scene authority      | 替换默认 Project handoff；grant 可撤销且 sender-bound                  |
| Asset Center               | `@neko/assets-domain` + `@neko/assets-webview/asset-management/root` | Assets application/session    | Workbench slots            | selection 保留；preview handles 短生命周期                             |
| Preview                    | `@neko/preview-domain` + `@neko/preview-webview/root`                | Preview session owner         | Workbench Main             | 只消费 authorized descriptor，不保存 raw path                          |
| Electron composition       | `apps/neko-desktop`                                                  | Window/sender/native adapters | Product window             | 只保留 slot mapping、typed IPC 和 lifecycle                            |

### 14. Renderer loading fences the outgoing Scene before identity replacement

`renderer-loading` 是 Window lifecycle authority 发出的精确 renderer replacement 边界。Desktop
renderer 必须在收到该事件时使尚未完成的 Shell snapshot 无效、清空 projection sequence，并把当前
Scene presentation 切换为 Window-level loading state，使 Canvas、Cut、Resource Browser 和其他
view-scoped Roots 在旧 `rendererSessionId` 下停止挂载。它不能等待某个 package snapshot 报错后再推断
reload，也不能把 stale package 请求重试到当前 Session。

若同一个 document 继续存活到 `renderer-ready`，它从 Shell authority 获取一次新 snapshot；正常完整
reload 中，新 document 仍通过相同的首次 snapshot 路径启动。两种情况都只使用 Shell 返回的当前
`rendererSessionId` 重建 Roots。旧请求如果已经越过 IPC 边界，Main/Node runtime 继续严格拒绝；该拒绝
只属于旧 Surface，不改变 Shell、Workspace facts 或兄弟 package runtime。preload 不缓存或重写新的
Resource Browser identity，也不从 active/recent Workspace 派生替代 identity。

### 15. Generation Job schema recovery is isolated to an empty package-owned table

Canvas 生成按钮通过唯一链路 `Canvas Webview intent -> Canvas Node runtime -> Workspace Generation owner ->
GenerationJobCoordinator -> persistent GenerationJobStore` 启动任务。provider 调用必须发生在 initial Job
snapshot 成功写入之后；因此 `generation_jobs` schema 不兼容属于 Generation owner 初始化失败，不能由
Canvas 重试、改写请求或切换到内存 store 掩盖。

`@neko/generation` 在初始化自己的表前读取 `pragma_table_info('generation_jobs')`，并与当前 canonical 列集
精确比较。表不存在或列集一致时继续 additive initialization。若同名表包含已删除的内部版本列但行数为
零，owner 在一个 system-write transaction 内删除该空表及其索引，然后立即创建唯一 canonical 表；这个
操作不转换任何记录，也不保留旧 schema 成功路径。若表中存在一条或多条记录，owner 拒绝初始化并报告
`generation-job-persistence-invalid`，原表和全部记录保持不变。用户生成资产由独立 Asset/Workspace 文件
authority 持有，不参与此空 runtime table reset。

该策略只服务真实的 package-owned runtime boundary，不扩展成通用 schema migrator、版本 registry 或
自动 repair framework。SQLite adapter 仍保留原始 cause；Generation UI 投影 owner-qualified diagnostic，
不得只显示无法定位约束的通用 `operation failed: run`。

## Risks / Trade-offs

- [Shell 抽取造成 workspace 回归] -> 先建立 normal workspace baseline tests，再只移动 Shell owner；props、View identity、layout helpers 与 Workspace CSS scope保持不变。
- [删除 Home 容器误删一级侧栏内容] -> PrimarySidebar contract/test 显式断言最近项目、最近会话、attention 和对应操作在所有 scene 持续存在。
- [Management Root 被压进 Dock] -> Scene codec 区分 management Main 与 optional detail/preview；Renderer path test 断言 Assets/Extensions management 位于 Main。
- [Scene contract 演变为 UI DSL] -> slot-specific closed unions和固定 invariants；不提供 component registry、JSON layout或任意 kind。
- [Assistant 变成隐式全盘文件权限] -> product-managed AssistantSpace + explicit ResourceGrant；删除 Home/config/credential/raw-path 成功路径。
- [目录选择误建会话或扩大权限] -> picker grant 与 conversation creation 分离；显式 scope projection 和 owner-identity path tests。
- [初始 turn 重复] -> 本地 pending intent事务 + request/turn identity；renderer只 attach，不执行。
- [提交后 lifecycle record 与 Agent workspace 会话分裂] -> provider lease 前执行幂等 session materialization；replay 先修复 exact conversation/checkpoint，再返回 session Scene，且不重跑 provider。
- [launch/session endpoint replacement 交叉释放] -> attachment 保留创建它的 binding；旧 binding 完成 detach 后再附着新 endpoint，identity mismatch 继续 fail-visible。
- [Scratch 丢失有价值产物] -> publish-before-cleanup contract；conversation删除/显式清理才回收。
- [Asset manager/preview selection 漂移] -> 单一 AssetCenterSession owner 内串行 mutation 与 exact preview session binding。
- [缺失 Extensions/Project detail Root] -> owner-qualified empty/unavailable；不复制 app-local domain UI。
- [Sidebar 双写] -> 原子切换 producer/consumer，并删除旧 Workbench sidebar update handler、字段和注册。
- [已写入的 non-canonical scene 无法启动] -> 保留原字节并只拒绝精确 Scene/Workbench instance；有效 sibling instance 与 Shell 继续可用，不执行 shape migration。
- [新 draft 显示旧 session] -> Host 分配 exact `draftId`，Agent package 在 identity transition 时清除 instance state，并删除通过 stable Scene/View 猜测 draft 的路径。
- [StrictMode cleanup 使 Desktop 白屏] -> subscription cleanup 与 runtime final disposal 分离；保留 disposed fail-visible，并以 StrictMode + development/packaged Electron exception 证据验证。
- [旧空 Generation 表阻止新任务] -> Generation owner 精确校验 canonical 列集；只重置零行 non-canonical 表，含记录表保持原样并 fail-visible。

## Replacement Plan

1. 对齐冲突 active changes，并为 workspace Agent、Project Views、sidebar 和全部 display mode 建立基线与旧路径缺席测试。
2. 添加 slot-specific scene、typed transition 和独立 sidebar canonical contract；一次性更新 producer/consumer/fixture/test，并删除旧字段、handler 与 dispatch。
3. 将 Desktop 收敛为一个 PrimarySidebar + ControlledWorkbenchShell，把现有 Project和Settings转换为 slots并完成 parity gate。
4. 建立 Assets-owned AssetCenterSession，组合 management + preview并删除 Home asset layout。
5. 将 Extensions/Project management presentation 原子切换到 owner-qualified Roots/slots，删除 Home containers。
6. 增加 Agent draft/session presentation、launch-safe catalog和显式 Assistant/Workspace scope。
7. 增加 directory grant、AssistantSpace/scratch、稳定 conversation context 和幂等 first-submit authority。
8. 删除 Home composer、agentInitialInput、模型 intent scene routing 与所有隐式 Project owner selection。
9. 运行 package tests/build、Agent evaluation、legacy/boundary gates和隔离真实 Electron大/小窗口场景。
10. 引入 unbound Entry Draft identity、确定性的自动 Assistant 首次提交、显式 Workspace/Role binding 与 package-owned presentation reset；修复 renderer runtime StrictMode lifecycle并复验用户启动路径。
11. 将 Window claim 收敛为 fresh Entry 的唯一启动路径，删除 startup destination preference，并以持久 Workspace/Settings 冷启动与 renderer reload 验证区分两种生命周期。

回滚只能整体恢复上一稳定 commit 的 composition，不能删除实施期间创建的 conversation、published Asset、Workspace或用户授权记录。非 canonical shape 必须在精确 owner 边界明确拒绝并保持原字节；不能执行产品迁移，也不能静默回退 Home composer、默认 Project或双 sidebar路径。

## Resolved Scope Decisions

- Settings 纳入同一个 Workbench，不保留顶层例外。
- Workspace scope 只由显式目录/Project选择或持久 conversation context建立；不使用模型 intent选 scene。
- 跨 Assistant/Workspace或跨目录的 linked continuation不在本变更实现；active conversation返回 `new-conversation-required`。
- Assistant Preview v1使用现有 Preview Root支持的、可由 Host Content authorization生成 descriptor的内容类型；不支持类型显示 typed unavailable且保留引用。
- 语音能力只保证入口与 workspace使用同一现有 capability projection；本变更不补建缺失的语音 runtime。
- PrimarySidebar 保留最近项，但分为 exact session restore 与 container open：conversation恢复 session，Project打开 Workspace draft；Character/Room owner可用后由其投影顶层 session/container，不暴露内部 AgentSession。

### Cut identity rebind and representation request ownership

An unnamed Cut draft Save As remains one canonical session transition. After the native picker
returns, Desktop revalidates the exact renderer, Workbench and draft View before writing. The Cut
application returns the authoritative event sequence produced by the rebind; preload moves the
current identity, listener identity and sequence cursor together before accepting later events.

Clip representations are disposable projections owned by the exact Cut document/session. The
Webview controller tracks every request by request identity and requested representation key, merges
valid out-of-order results by key, and rejects results from a replaced document/session or removed
Clip. Completion and failure release only those in-flight keys, so resize/scroll overlap cannot make
an earlier valid batch stale or permanently suppress a retry.
