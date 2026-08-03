## Context

Desktop 目前由 `DesktopShell` 在 Home、Project workspace 和 Settings 三条顶层路径之间切换。Home 与 Project 分别组装 `DesktopApplicationSidebarFrame`，Project 路径才创建 `ControlledWorkbenchShell` 和完整 `DesktopAgentSurface -> AgentWebviewRoot`。Home 的 `HomeStartCreating` 只把文本通过 `agentInitialInput` 预填到默认或选中的 Project Agent；扩展和项目管理 UI 也直接位于 Desktop renderer。

现有 workspace Agent 已拥有完整 composer、模型、文件/mention、命令、Skill、执行/审批、会话 Tab、历史和语音入口。现有 Agent application runtime 按 Workspace identity 组合，Assistant 的用户级 conversation storage、scratch 和无目录 capability scope 尚未定义。Assets 已有 global-library Root，资源管理与 Preview 仍缺少同一 package-owned selection session。

本变更保留 `fix-desktop-agent-shell-regressions` 已验证的 Agent、Canvas、Preview、Cut、Resource Browser、主题、display mode 和 resize 行为，取代 `integrate-desktop-agent-home` 的 Home handoff 目标，并更新 Phase 1 workflow：窗口启动后直接进入统一 Workbench 的 Agent scene，不再经过独立 Home 页面。

### 五层分析

| 层次 | 结论                                                                                                                                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 职责 | Host Shell 拥有窗口 scene/sidebar projection 与 transition CAS；Agent authority 拥有 scope、conversation 和 scratch lifecycle；Assets 拥有资源中心 selection session；Desktop 只组合 Roots 和 Electron adapters。 |
| 依赖 | Scene contract host-neutral；Webview 不依赖 Electron/Node；目录和资源只以 opaque grant/descriptor 跨 preload；领域 package 不依赖 app root。                                                                      |
| 接口 | 使用 closed scene union、slot-specific Surface refs、精确 instance identity 和 typed transition request；不传 React component、绝对路径、credential 或任意 registry key。                                         |
| 扩展 | 新 scene 必须先有 owner、runtime、public Surface 和 lifecycle；closed union 按真实能力升级，不建立动态页面 DSL。                                                                                                  |
| 测试 | Producer codec/CAS、package Root、Desktop delegation、poison path、Agent evaluation 与真实 Electron layout/lifecycle 分层验证。                                                                                   |

## Goals / Non-Goals

**Goals:**

- 所有 Desktop 产品界面都使用一个窗口级 PrimarySidebar 和一个 ControlledWorkbenchShell。
- PrimarySidebar 在所有场景持续显示应用导航、最近项目、最近 Agent 会话与状态/设置。
- 同一 Workbench primitive 支持 Agent-only、Agent + Main、Agent + Main + Manager 和 management Main + optional Secondary Main 等明确形态。
- 一级侧栏只提交 typed scene intent，不渲染或拥有领域页面。
- 同一个 AgentWebviewRoot 服务入口 draft、Assistant session 和 Workspace session。
- Assistant 使用 OpenNeko 用户资源、显式文件 grant 和可恢复 conversation scratch。
- 用户显式选择目录后获得 Workspace scope 和现有 creative Workbench composition，不自动创建 conversation。
- 资源中心以 Assets management 为 Main，authorized Preview 只作为可选 Secondary Main。
- 保持现有 workspace Agent、Canvas、Preview、Cut、Resource Browser 的行为和身份。

**Non-Goals:**

- 不实现尚不存在的 Character Manager、Interactive Main、World authoring 或 World experience owner；只定义角色扮演/聊天室的 Workbench slot 形态和 unavailable 行为。
- 不让模型文本、route string 或 active Project 决定权限 scope。
- 不授予 Assistant 整个用户 Home、配置、credential 或插件目录。
- 不创建通用页面 DSL、动态 scene registry、Desktop manager bag 或第二个 Agent controller。
- 不在本变更实现跨 Assistant/Workspace 或跨目录的 linked conversation/artifact handoff；只禁止原地 rebind。
- 不为缺失的 management detail producer 复制 Desktop-owned 临时业务 UI。

## Decisions

### 1. One window owns one Workbench for every scene

`DesktopShell` 始终渲染同一个结构；Settings 也只是 Workbench scene。Workbench 的 slot 数量按场景变化，不能把 management Root 压入固定窄栏或用 Preview 替代 management Main：

```text
DesktopApplication
└─ ControlledWorkbenchShell
   ├─ primarySidebar: ApplicationPrimarySidebar
   ├─ interaction
   ├─ main / secondaryMain
   ├─ leftManager / rightManager
   ├─ timeline
   └─ status
```

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

`HomeWorkspace`、`ContentProjectWorkspace` 和 Settings 顶层条件分支被替换为 scene slot builders。Scene 切换只替换 slots；PrimarySidebar 和 ControlledWorkbenchShell 的 React identity 保持不变。Project slot builder 复用现有 Agent/Main/Resource/Timeline components、View identity、layout helpers 和 `.project-workspace` 视觉契约，不自行创建 Shell 或 sidebar frame。Renderer 必须逐一消费 Host 的 `interaction/main/secondaryMain/leftManager/rightManager` 语义，不能把 Interaction 临时当 Main、把 management Main 当 Dock，或仅复用 Shell JSX 而丢失 Workspace CSS scope。

### 2. Scene projection is closed, versioned and slot-specific

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
  | { kind: 'workspace-main'; workspaceId: WorkspaceId; viewId: ViewId; viewEpoch: number }
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
  schemaVersion: 1;
  sceneId: SceneId;
  windowId: WindowId;
  revision: number;
  context: DesktopWorkbenchSceneContext;
  slots: {
    interaction?: InteractionSurfaceRef;
    main?: MainSurfaceRef;
    secondaryMain?: MainSurfaceRef;
    leftManager?: ManagerSurfaceRef;
    rightManager?: ManagerSurfaceRef;
    timeline?: TimelineSurfaceRef;
    status?: StatusSurfaceRef;
  };
}
```

Codec 必须验证 context 与每个 slot 的 identity/scope 一致。例如 Assistant scene 不允许 Workspace Main，Asset Preview 必须与同一 AssetCenterSession 配对，Settings 不允许 Agent/Timeline。Unknown kind、缺失 owner、跨 window/view/session ref 和 renderer payload 全部失败。

### 3. Scene transitions are typed Host commands

一级侧栏和显式内容操作只发送 typed transition intent：

```ts
type DesktopSceneTransitionIntent =
  | { kind: 'open-agent-assistant' }
  | { kind: 'open-workspace'; workspaceGrantId: WorkspaceGrantId }
  | { kind: 'open-asset-center' }
  | { kind: 'open-extensions' }
  | { kind: 'open-project-management' }
  | { kind: 'open-settings'; sectionId?: SettingsSectionId }
  | { kind: 'restore-conversation'; conversationId: ConversationId };
```

Request 携带 requestId、endpoint epoch、Window identity、expected window revision 和 expected scene revision。Host Shell service 根据 owner facts 产生下一个 projection；renderer 不根据 route string、组件可用性、active/first/recent Project 或模型文本推断 scene。显式请求尚未具备 owner/runtime/Surface 的 Character/World scene 时返回 owner-qualified unavailable。

Renderer reload 从 Host projection 恢复精确 scene。关闭最后一个 conversation 只回到同 scope 的 Agent draft，不默认切换目录或 Project。跨 scope/目录的 active conversation 不可原地 rebind。

### 4. Sidebar is a separate window presentation aggregate

现有 sidebar 已位于 `window.workbench.primarySidebar`，但与 Main/Dock/Timeline 共享 Workbench revision。变更将其拆为独立窗口 presentation aggregate：

```ts
interface DesktopApplicationSidebarProjection {
  schemaVersion: 1;
  windowId: WindowId;
  revision: number;
  visible: boolean;
  width: number;
}
```

Sidebar mutation 携带 expected sidebar revision，并只更新 sidebar aggregate。旧值一次性迁移；所有 producer/consumer 同时切换后删除旧字段和 `workbench.update` 对 sidebar 的成功写入能力，不双读双写。Project Workbench revision 继续只保护 Main/Dock/Timeline/display。

### 5. Agent Root, session phase and authority scope are orthogonal

`AgentWebviewRoot` 是唯一 Agent UI/controller/composer。新增显式 presentation contract：

```ts
type AgentRootPresentation =
  | { kind: 'draft'; scope: AgentScopeProjection }
  | { kind: 'session'; scope: AgentScopeProjection; conversationId: ConversationId };
```

Draft 隐藏 conversation Tabs/history 等 session-only chrome，但继续复用当前 `ConversationController`、`EmptyState`、`InputAreaProvider` 和 `InputArea`。模型配置、launch-safe commands/Skills、授权文件/引用、语音入口以及创建 turn 后的执行/审批均走相同 Webview contract。普通 workspace session 未传入 draft presentation 时，现有 DOM、Host messages 和行为保持不变。

Capability catalog 必须标记 scope requirements。Assistant draft 不展示 Workspace-only Tool/Skill 为可执行成功能力；缺少 Workspace scope 时返回 typed `workspace-scope-required`，不能 fallback 到 active Project。Root 不因 scope 改变而换成另一套 controller。

Composer 视觉继续由 `@neko/agent-webview` 拥有并增强现有 `InputArea`、`ComposerConfigMenu`、`SessionModeSelector` 与 `ModeSelector`，不创建 Desktop composer 或平行控件。Desktop 只通过 Agent Root 的 React presentation prop 注入 Assistant 的目录选择命令，或当前 Project catalog 已有的安全 `displayName`；该短生命周期 UI projection 不进入 Agent authority、conversation facts 或持久 Scene schema。Composer 将目录上下文、textarea 与工具条收进同一居中悬浮表面，保留现有 `+`、模式、模型、命令、Skill、usage、审批和发送/停止能力；不复制 Codex 的 branch/local 元信息。窄 dock 通过 package-owned responsive CSS 收缩低优先级标签并允许工具条在稳定边界内换行，菜单仍向上定位且不得溢出 Workbench。

### 6. Explicit directory authorization creates Workspace scope

目录选择是明确用户操作，不是模型推断：

1. Desktop Main 通过 native picker 授权目录并创建 sender/window-bound opaque `WorkspaceGrantId`；路径不进入 renderer、Agent message、project fact 或日志。
2. Host workspace authority 验证 grant，建立或恢复精确 Workspace identity，并返回 Workspace scope projection。
3. Scene 切换为同一 Agent Root + Workspace Main + Workspace Resources +适用 Timeline/Status；此时尚不创建 conversation。
4. 用户提交第一条消息时，Agent authority 把 conversation context 冻结为该 Workspace identity，并创建 initial message/pending turn。

Project catalog entry 可以解析为同一 Workspace identity，但不能用 first/recent/active Project 作为隐式选择。切换到另一目录时，draft 可以替换 scope；active conversation 必须新建 conversation，原会话保持不变。

### 7. Assistant scope owns user-space and conversation scratch

`@neko/agent-runtime` application authority 增加 versioned `AgentConversationContext`：

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

现有 Workspace conversations 的 context 通过一次性 migration 从其精确 Workspace identity 补齐；无法解析的记录拒绝恢复并给出 diagnostic，不猜 active workspace。

### 8. First submit separates local commit from external execution

Draft submit request 携带 requestId、scope、selected model/configuration 和 authorized resource refs。Agent application authority：

1. 验证 scope 与 grants；
2. 在本地 authority 原子提交 context、conversation、initial user message 和 durable pending-turn intent；
3. 返回已提交 conversation identity；
4. 以同一 requestId/turn identity 幂等启动 provider execution；
5. renderer 只附着 projection，不触发 turn。

Provider failure、reload 或 adapter replacement不得重复 initial message/turn。失败保留 conversation 和 pending/failed turn diagnostic，可由现有 recovery policy恢复；不能回滚为 Home handoff、空 conversation 或另一个 scope。

### 9. Asset Center is an Assets-owned management and preview session

`@neko/assets-domain` 增加 `AssetCenterSession` application contract，拥有 catalog/filter/selection projection、revision/CAS 和 selected `ContentLocator`/Asset identity。`@neko/assets-webview` 的 Management Root 消费该 projection并提交 typed selection intent。

选中资源时，Assets application service通过 Host content authorization port 请求 exact preview descriptor；`@neko/preview-*` 创建与同一 AssetCenterSession 绑定的 PreviewSession。Scene 组合：

```text
main:          AssetManagementRoot(assetCenterSessionId)
secondaryMain: PreviewRoot(previewSessionId) // only when selected and authorized
```

没有 selection 时 Secondary Main 不显示；不支持的内容保留 Main selection 并在 Secondary Main 显示 typed unavailable diagnostic。Desktop 不持有 filter、selection、Asset facts、ContentLocator interpretation 或 preview-kind switch。切换 scene 释放 view-scoped preview handle/subscription，但保留 package-owned catalog/selection事实。

### 10. Other management and Settings scenes use the same shell

Extensions 使用 Agent extension application contract 与 package public management Root，并将该 Root 放入 Main；现有 Desktop `HomeExtensions` presentation 迁移后删除。Project management 的 catalog/management Root 同样占据 Main，selection 与 explicit open-workspace action分离。Settings 将当前 configuration Surface 放入 settings navigation/main slots；设置事实继续由 `@neko/host` settings owner管理。

若当前没有真实 detail Root，scene 只挂载 owner-qualified catalog/empty/unavailable Surface，不在 Desktop 创建临时 domain implementation。所有 scene 都保留同一 PrimarySidebar、Workbench、主题和 resize lifecycle。

Management Main 与可选 Preview/Detail 使用 Workspace Main 相同的 panel chrome、tab/header/content frame 和 resize primitive。Assets、Extensions 与 Projects 只提供各自 package-owned management/detail content，不复制 Workspace Preview viewer 或在 Desktop 创建第二套 panel implementation。组合时 management panel 使用紧凑目录宽度，Preview/Detail 获得主要内容宽度；未选择 detail 时明确省略或显示 owner-qualified empty Surface。

### 11. Scene activation and empty Main are atomic presentation states

打开显式 Project/Workspace 或恢复 conversation 时，Host Shell 在一个 stored-state commit 中同时更新 exact Project `activeTarget`、对应 Workbench attachment、Scene scope/slots 与 Agent `draft | session` phase。Desktop 只有在该提交完成后才返回 transition success；renderer 不得先启动旧 scope 的 launch adapter，再等待布局或 Agent 状态补齐。App composition 可以在返回前 attach 对应 package runtime，但不能用 active/recent Project fallback 修复不一致状态。

Workspace 的 Main View 集允许因用户关闭最后一个 Preview/View 暂时为空。此时 Workbench 保留 primary group，Scene 移除 `slots.main` 和无 owner 的 Timeline，同时继续保留 exact Workspace scope、Agent Interaction、Workspace Resources 与 Status。renderer epoch projection 只更新实际存在的 Main/Timeline ref；不得把空 Main 当作 scene corruption。应用重启时现有 `attachProjectWorkbench` 恢复 canonical Canvas，但运行中的关闭操作不隐式发明另一个 View。

Pi transcript 中 `stopReason: error` 的 assistant entry 必须把持久化的 `errorMessage` 投影到 package-owned Agent error presentation。空 content 不得把真实 diagnostic 降级成只有固定 `Error` 标题；错误仍保持 conversation/turn scoped，不自动重试或伪装成功。

### 12. Ownership and canonical paths

| Owner                      | Public path / role                                                   | Producer                      | Consumer                   | Replaced path / user data                                              |
| -------------------------- | -------------------------------------------------------------------- | ----------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| Scene/sidebar/transition   | `@neko/host/desktop-shell-contract` + Shell service                  | Host-neutral Shell service    | Desktop renderer/preload   | 替换 Home/Project/Settings branch；迁移 sidebar presentation value     |
| Workbench primitive        | `@neko/ui/workbench`                                                 | React primitive               | Desktop scene composer     | 删除平行/nested Shell consumers                                        |
| Agent presentation         | `@neko/agent-webview/root`                                           | Agent Webview                 | Desktop Agent Surface      | 删除 Home composer/initialInput；不复制 controller                     |
| Scope/conversation/scratch | `@neko/agent-contracts` + `@neko/agent-runtime/application`          | Agent authority               | Desktop adapter/Agent Root | 补齐 existing Workspace context；新增 Assistant user-space，不暴露路径 |
| Directory authorization    | `@neko/host` workspace grant port + Desktop native adapter           | Host authority/Desktop Main   | Agent/scene authority      | 替换默认 Project handoff；grant 可撤销且 sender-bound                  |
| Asset Center               | `@neko/assets-domain` + `@neko/assets-webview/asset-management/root` | Assets application/session    | Workbench slots            | selection 保留；preview handles 短生命周期                             |
| Preview                    | `@neko/preview-domain` + `@neko/preview-webview/root`                | Preview session owner         | Workbench Main             | 只消费 authorized descriptor，不保存 raw path                          |
| Electron composition       | `apps/neko-desktop`                                                  | Window/sender/native adapters | Product window             | 只保留 slot mapping、typed IPC 和 lifecycle                            |

## Risks / Trade-offs

- [Shell 抽取造成 workspace 回归] -> 先建立 normal workspace baseline tests，再只移动 Shell owner；props、View identity、layout helpers 与 Workspace CSS scope保持不变。
- [删除 Home 容器误删一级侧栏内容] -> PrimarySidebar contract/test 显式断言最近项目、最近会话、attention 和对应操作在所有 scene 持续存在。
- [Management Root 被压进 Dock] -> Scene codec 区分 management Main 与 optional detail/preview；Renderer path test 断言 Assets/Extensions management 位于 Main。
- [Scene contract 演变为 UI DSL] -> slot-specific closed unions和固定 invariants；不提供 component registry、JSON layout或任意 kind。
- [Assistant 变成隐式全盘文件权限] -> product-managed AssistantSpace + explicit ResourceGrant；poison Home/config/credential/raw-path访问。
- [目录选择误建会话或扩大权限] -> picker grant 与 conversation creation分离；显式 scope projection和 no-fallback tests。
- [初始 turn 重复] -> 本地 pending intent事务 + request/turn identity；renderer只 attach，不执行。
- [Scratch 丢失有价值产物] -> publish-before-cleanup contract；conversation删除/显式清理才回收。
- [Asset manager/preview selection漂移] -> 单一 AssetCenterSession revision与 exact preview session binding。
- [缺失 Extensions/Project detail Root] -> owner-qualified empty/unavailable；不复制 app-local domain UI。
- [Sidebar 双写] -> 原子切换 producer/consumer并 poison旧 Workbench sidebar update。
- [已写入的 prelaunch scene 无法启动] -> Shell state 升级到 v6，仅迁移 v5 中已知的 management catalog 与 Assistant resources Manager Surface；当前或未知 kind 继续 fail-visible。

## Migration Plan

1. 对齐冲突 active changes，并为 workspace Agent、Project Views、sidebar和全部 display mode建立基线/poison tests。
2. 添加 slot-specific scene、typed transition和独立 sidebar contract/CAS，完成旧 sidebar值与已写入 prelaunch management scene 的一次性版本迁移。
3. 将 Desktop 收敛为一个 PrimarySidebar + ControlledWorkbenchShell，把现有 Project和Settings转换为 slots并完成 parity gate。
4. 建立 Assets-owned AssetCenterSession，组合 management + preview并删除 Home asset layout。
5. 迁移 Extensions/Project management presentation到 owner-qualified Roots/slots，删除 Home containers。
6. 增加 Agent draft/session presentation、launch-safe catalog和显式 Assistant/Workspace scope。
7. 增加 directory grant、AssistantSpace/scratch、conversation context migration和幂等 first-submit authority。
8. 删除 Home composer、agentInitialInput、模型 intent scene routing与所有默认 Project fallback。
9. 运行 package tests/build、Agent evaluation、legacy/boundary gates和隔离真实 Electron大/小窗口场景。

回滚只能整体恢复上一稳定 commit 的 composition，不能删除实施期间创建的 conversation、published Asset、Workspace或用户授权记录。新 schema 若已写入，旧版本必须明确拒绝或执行有版本的单次迁移；不能静默回退 Home composer、默认 Project或双 sidebar路径。

## Resolved Scope Decisions

- Settings 纳入同一个 Workbench，不保留顶层例外。
- Workspace scope 只由显式目录/Project选择或持久 conversation context建立；不使用模型 intent选 scene。
- 跨 Assistant/Workspace或跨目录的 linked continuation不在本变更实现；active conversation返回 `new-conversation-required`。
- Assistant Preview v1使用现有 Preview Root支持的、可由 Host Content authorization生成 descriptor的内容类型；不支持类型显示 typed unavailable且保留引用。
- 语音能力只保证入口与 workspace使用同一现有 capability projection；本变更不补建缺失的语音 runtime。
