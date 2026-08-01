## Context

Phase 1 的产品范围已在 [`ROADMAP_CN.md`](../../../ROADMAP_CN.md) 中确定：先交付 Desktop
前端与现有子包真实接入，跨平台资格和 MCP/插件/专业工具分别留给 Phase 2、Phase 3。

P1.0 重新审计后的代码与 change 状态如下：

| 能力               | 当前事实                                                                                                   | 剩余 focused owner                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Application/Host   | `apps/neko-desktop`、`neko-desktop` identity、Electron Host ports、AppHost、typed preload 和安全基线已建立 | P0 build change 关闭 typecheck/package/Windows runner 证据；Host Proposed ADR 不自动成为 P1 gate       |
| Shell/State        | Home、Project/Window/View identity、owner projection 和受控 Workbench 已建立                               | `fix-desktop-agent-shell-regressions` 完成本地图形化回归                                               |
| Agent              | Pi/AgentSession/Conversation/Tool/Approval/Skill 与 Desktop composition 已接入                             | `integrate-desktop-agent-home`、Shell regression 和 capability catalog 完成真实 API/本地 Electron 验收 |
| Assets/Canvas      | Assets Root、Resource Browser、完整 Canvas Root 与 workbench composition 已接入                            | `integrate-desktop-assets-canvas` 完成最终节点/UI 验收；OpenNeko resource transport 接管媒体节点       |
| Cut                | Desktop Cut Root/OTIO/Export/Node media adapter 已接入                                                     | `redefine-openneko-lightweight-editing` 拥有剩余编辑/保存/生产力任务；OpenNeko transport 拥有字节投影  |
| Preview/Media      | Preview viewers、Node/FFmpeg 和 Desktop media transport 可运行                                             | OpenNeko resource transport 收敛；`fix-epub-preview-resource-readiness` 完成 EPUB 本地 Electron 验收   |
| Generation/Quality | GenerationJob、Quality Gate 与相关投影基础存在                                                             | 尚未创建的 `integrate-desktop-creative-support-domains` 重新审计并组合                                 |
| Chara/Entity/Tools | Chara、Entity、Search、Tools 能力分散存在，部分 package 是零 manifest consumer                             | zero-consumer disposition 提供证据；P1.6 只接入被明确保留的能力                                        |

本提案是项目级 delivery contract，不直接实现以上缺口。每个实施切片必须拥有独立 OpenSpec、
canonical path、回归测试和运行态证据。

## Goals / Non-Goals

**Goals:**

- 让 Phase 1 的范围、依赖顺序、公共 contract、所有权和完成门禁可直接转成实施变更。
- 交付一个真实、可恢复、可编辑和可导出的 Content Project 工作流。
- 让所有功能包继续拥有自己的领域事实与 public Root，Desktop 只做宿主与组合。
- 让 renderer 竞态、安全、用户数据和资源生命周期在写 UI 前成为硬约束。
- 保持 Electron Desktop 为唯一产品组合根，并通过依赖/残留/path tests 证明已退休宿主、
  demo、legacy 和 fallback 路径不能参与成功。
- 让确定性 CI、真实 API Evaluation 和图形化 UI 验收分别拥有清晰且不可互相替代的证据。

**Non-Goals:**

- 在本提案中创建 Electron runtime 或修改生产代码。
- 完成 Phase 2 的 Windows 安装/升级、签名、更新、GPU/媒体和完整发布资格。
- 完成 Phase 3 的 MCP UI、插件 Host、ComfyUI 或专业工具 adapter。
- 实现完整 CharacterProject/Version、WorldProject/Run/Save 或空壳 World 页面。
- 恢复旧 Desktop、Workbench Core、Market Core、Rust Engine、EngineClient 或 `neko-home`
  兼容成功路径。
- 在 Desktop 内复制专业 NLE/DCC/游戏引擎能力。

## Five-Layer Analysis

| 层   | Phase 1 决策                                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 职责 | Desktop composition root 拥有 Electron 生命周期、Shell、typed bridge 和依赖注入；功能包拥有领域事实、application service 和 UI Root；Host 拥有权限/IO/进程/持久化。      |
| 依赖 | renderer 只依赖 browser-safe public entry；preload 只依赖固定 IPC contract；main/AppHost 依赖 Host/domain public ports，不依赖 React；功能包不导入另一个功能包私有实现。 |
| 接口 | 先冻结 application/workspace/project/window/view identity、projection attachment、domain adapter、command/revision、resource descriptor 和 diagnostic，再实现页面。      |
| 扩展 | Phase 1 只显式组合内置功能包，不建立插件 registry；每个 domain adapter 是未来受控贡献的基础，但不提前开放。                                                              |
| 测试 | CI 执行 contract/producer/consumer、架构依赖和 headless functional；真实 API Agent Evaluation 与图形化 Electron UI/E2E 显式本地执行。                                    |

## Decisions

### 1. P1.0 重整 program，Phase 1 仍由 focused changes 交付

P1.0 不实现产品代码。它把旧 program 的工作转移到当前事实对应的唯一 owner，并冻结以下
依赖关系：

```text
P0 build/typecheck gate + ResourceRef retirement
  -> P1.3 Agent/Shell acceptance
  -> P1.4 Assets/Canvas media acceptance
  -> P1.5 Cut/Preview/OpenNeko resource closure
  -> P1.6 retained supporting domains
  -> P1.7 reference-platform end-to-end qualification
```

`retire-resource-ref-contract` 先关闭 public durable identity；OpenNeko resource、Agent display、
Canvas、Preview 和后续 support-domain contract 不得继续新增或恢复 `ResourceRef`。
P1.4/P1.5 的媒体路径由统一 `openneko:` scheme 与 exact-resource registry 替换，不能分别
保留私有 media scheme、loopback HTTP、upstream proxy 或普通 Canvas PCM 成功路径。

当前 successor ownership 为：

| Program slice          | Current/focused changes                                                                                      | P1.0 disposition                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| P1.1 Foundation        | `bootstrap-neko-desktop-foundation`                                                                          | 已实施；最终 package 证据由 P0 build change 持续跟踪                                            |
| P1.2 Shell/state       | `implement-desktop-shell-project-state`、Home/Workbench refinements                                          | 已实施；可见回归由 `fix-desktop-agent-shell-regressions` 验收                                   |
| P1.3 Agent/Home        | `integrate-desktop-agent-home`、`clarify-desktop-capability-catalog`                                         | 保留剩余真实 API Evaluation 与本地 Electron scenario，不重复实现 Agent runtime                  |
| P1.4 Assets/Canvas     | `integrate-desktop-assets-canvas`、OpenNeko resource Canvas slice                                            | Assets/Canvas child 只关闭剩余 UI/节点验收；媒体 transport 交给 Desktop resource registry        |
| P1.5 Cut/Preview/Media | `redefine-openneko-lightweight-editing`、OpenNeko resource、EPUB readiness、`integrate-desktop-cut-preview-media` | Cut 编辑、transport、格式 readiness 和最终文档分别由各 owner 关闭                            |
| P1.6 Support domains   | 尚未创建 `integrate-desktop-creative-support-domains`                                                        | 先读取 zero-consumer disposition，再只接入明确保留的 Generation/Quality/Chara/Entity/Tools 能力 |
| P1.7 Qualification     | 尚未创建 `qualify-neko-desktop-phase-1`                                                                      | 只做 frozen fixture、canonical-path assertion、图形化 E2E 和最终文档/归档                       |
| Sync recovery          | `optimize-workspace-media-library-sync`                                                                      | 是独立 portability enhancement；除非 P1.7 后续 spec 显式需要，不自动成为 Phase 1 gate           |
| Package topology       | Platform/Shared/Host/zero-consumer/identity Proposed changes                                                 | 保持独立架构线；Proposed ADR 未接受前不自动成为产品 Phase 1 gate                                |

P1.3-P1.5 可以在各自 owner 内推进，但不得并行修改同一个 public contract。尤其
ResourceRef retirement 与 OpenNeko resource 的 shared/Agent/Canvas consumer migration 必须串行；
package identity normalization 必须等其 proposal 声明的 Platform/Shared/Host/zero-consumer
前置完成后再原子执行。

### 2. Phase 1 只保留一个 composition root

当前 canonical 目录职责：

```text
apps/neko-desktop/
  src/main/          Electron lifecycle, AppHost, security, windows, protocols
  src/preload/       fixed, versioned, purpose-scoped context bridge
  src/renderer/      React bootstrap and Desktop Shell composition
  src/shared/        app-specific serializable IPC envelopes only
  test/fixtures/     isolated synthetic workspaces
```

领域 contract、UI Root 和可跨宿主复用的 controller 不放在 `apps/neko-desktop`。它们留在
owning package：

```text
Desktop renderer -> package public UI Root -> package UI/domain adapter
Desktop preload  -> fixed typed bridge
Desktop main     -> AppHost -> host-neutral domain service / @neko/media
```

不得新增 `@neko/desktop-core`、万能 `HostAdapter`、全局 command router 或第二套 design
system。只有当两个保留 package/runtime owner 出现真实、同语义实现时，才把共同算法提升到
准确的中立 owner；已退休宿主不能作为新增抽象的消费者证据。

### 3. Electron 基线是安全产品边界

P1.1 必须固定：

- Electron Forge 作为优先打包基线，Vite 继续构建 renderer；精确 Electron/Forge 版本由
  P1.1 锁定并进入 lockfile。
- `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`、
  `nodeIntegrationInSubFrames: false`、`webSecurity: true`、
  `allowRunningInsecureContent: false`。
- preload 不暴露 raw `ipcRenderer`、任意 channel、Node object、path、credential、
  `WebContents` 或 Electron event。
- Main 根据真实 `webContents`/frame/window registry 反查 `WindowId` 和 sender identity，
  不信任 renderer 自报权限或 application identity。
- CSP 由 Desktop 安全模块统一生成；不得使用 `unsafe-inline`、任意远程 script、
  `file://`、未经 Main 启动并发布的 localhost origin 或 custom protocol `bypassCSP`。
- renderer 崩溃、reload、window close 和 app quit 有不同生命周期，所有 disposable、
  stream、timer、protocol session 和 runtime handle 明确释放。

preload API 按 domain namespace 暴露固定方法或已经版本化的 adapter，不提供任意
`executeCommand(channel, payload)`。Agent 可以复用其完整 typed protocol adapter；Canvas、
Cut、Preview 和 Assets 各自使用 owning package contract，不能合成跨领域 command router。

### 4. application identity 收敛为 `neko-desktop`

P1.1 在同一最小边界内：

- 将 `neko-desktop` 加入 canonical application identity；
- 删除或 poison 未发布的 `neko-home` 成功路径，不能保留 alias fallback；
- 更新 application-boundary guards、测试和所有生产消费者；
- 在修改前审计本机/fixture/仓库是否存在 `neko-home` 数据。

用户数据处置必须覆盖 `NekoApplicationStorageCategory`：

| 分类                | Phase 1 默认处置                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------- |
| settings            | 已知 schema 通过显式 migration 进入 canonical settings owner；未知 schema 拒绝并诊断         |
| conversations       | 复用 workspace/Conversation authority 的稳定 identity，不按 application 复制 transcript      |
| project-registry    | 基于现有 workspace registry 建立 Desktop project catalog projection；不重新生成 workspace id |
| credentials         | 继续由 HostSecretPort/OS credential owner 持有，不复制明文                                   |
| trust-state         | 只复用与相同 workspace/config digest 绑定的明确授权；不扩大权限                              |
| installed-packages  | 保留安装记录和 owner；Phase 1 只投影可用性，不启用 Phase 3 插件 UI                           |
| generated-artifacts | 通过稳定 `ContentLocator` 或 owning domain identity 复用；不移动或重写源产物                 |
| rebuildable-cache   | 可以显式重建；清理必须限定 cache owner 和目标，不能删除源素材                                |

若审计没有任何 `neko-home` 用户数据，迁移实现可以只提供明确拒绝/诊断测试并删除 legacy
路径；不得为了假想兼容保留双读或双写。

### 5. Project catalog 只拥有导航身份

Phase 1 需要一个最小、Host-owned、revisioned Project catalog，建议 record 至少包含：

```text
projectId
workspaceId
profile = content
displayName
workspaceLocator
catalogRevision
createdAt / updatedAt
```

约束：

- 复用 `<workspace>/.neko/workspace.json` 与用户级 workspace registry，不创建第二个
  workspace identity。
- `ProjectId` 与 `WorkspaceId` 显式绑定但不由 active folder 推断；是否采用相同字符串由
  P1.2 contract 决定，所有 operation 仍携带准确字段。
- 绝对 workspace path 只存在于 Host user-local grant/catalog，不写入项目事实、Tab state、
  renderer persistence 或跨包 DTO；portable locator 使用现有 contract。
- catalog 只拥有最近项目、标题、profile、open/relink 和导航 metadata，不拥有 Canvas、
  Cut、Conversation、GenerationJob 或 artifact 事实。
- Phase 1 只允许 `content` profile 成功打开。Character/World 项目创建返回 unavailable
  diagnostic，不能写入空 record。

### 6. Shell 使用唯一 Window/View 状态模型

P1.2 实现：

```text
DesktopAppHost
  -> ProjectCatalogProjection
  -> AttentionSummaryProjection
  -> WindowLayoutProjection(WindowId)
  -> owner projections

Renderer
  -> immutable replicas keyed by owner
  -> WindowStore(WindowId)
  -> ViewStore(ViewId)
  -> package UI Roots
```

Desktop 使用一个可展开/折叠为图标轨道的一级侧边栏承载 Home、创建入口、项目导航、最近工作、
素材中心、角色、Skill、Activity 和设置。折叠只改变 Shell 展示密度，不销毁 Project/View
attachment，也不复制另一套 Activity Rail。Home 是固定、不可关闭的启动 Surface；Content Project 在
同一 Shell 内切换，但不再通过第二套顶部 Project Tab 暴露。Window 仍保存每个打开 Project
的 `ProjectTabId`/`ViewId` 作为恢复和 owner attachment identity；该 identity 是状态契约，
不要求渲染成视觉 Tab。Content Project 不渲染全局 Header 或统一工作区 Tab 行；窗口顶部只保留
macOS traffic lights 所需的透明拖拽区。Conversation Tab、Canvas/Preview 文档 switcher 与
Cut/Timeline Tab 必须由 owning package 在各自 surface 内渲染，Shell 不复制或合并这些 Tab。

```text
Primary Sidebar | Resource Dock | Main Creative Surface | Agent Dock
                                  +---------------------+
                                  | Cut Timeline Panel  |
                                  +---------------------+
```

Content Project 的受控 slot 为：

- 一级侧边栏：Shell-owned、可显隐，只拥有全局导航与稳定 Project/Conversation 快速入口；
- 主创作区：Canvas、Cut Stage、Preview、Agent Main 和后续 Character/World Surface；
- Agent Dock：同一 Conversation/CharacterRun View 可停靠左/右、隐藏或作为唯一 Chat
  presentation 占据可用工作区；它不嵌套进 Main Creative Surface，也不增加 Desktop-owned
  Agent header、连接提示、配置入口或 onboarding；
- Resource Dock：目录树、Media Library、Search 和 Entity projection，可停靠左/右；
- Timeline Panel：Cut-owned 底部面板，可显隐和调整高度；
- Overlay：只用于资源选择、Quick Look、菜单和小窗口临时面板，不拥有持久领域事实。

Phase 1 的展示菜单只控制 Chat 与 Main Creative Surface 的组合：Chat + 主面板可选择
Chat 左/右，也可选择 only Chat 或 only Main。它不提供独立的“移到左侧/右侧”工具按钮。
主面板由已有 owner View 组成，可展示 Canvas、Cut Stage + Timeline、Model Preview，
以及受控的 Canvas + Timeline 或 Canvas + Model 双视图；组合只复用既有
Canvas/Cut/Preview Root、View identity 与至多一个 `sideViewId`，不创建第二套 viewer/editor。
Preview owner 将 `previewContentKind` 投影到 View metadata；Renderer 不得从 opaque
`resourceId`、本地路径或文件名猜测 Model 能力。
Files、Media Library 与 Entity 是 Resource owner 内的独立 facet/入口，不进入 Chat/Main
preset，也不因主创作 View 切换而改变 authority。Phase 1 不建立 VS Code 式任意 Dock tree、
无限分栏或跨 slot 拖拽。Project 内文档通过项目树、
面包屑或领域内紧凑 View switcher 管理。Canvas/Cut/Preview 可以打开多个不同文档，但同一
文档在同一 Window Phase 1 聚焦既有 View，不创建重复 View。

macOS 参考平台使用隐藏 inset titlebar，仅保留 traffic lights 与透明拖拽区；Renderer
不渲染全局 titlebar/header，也不显示 Electron/系统默认边框。布局、设置和 surface 入口收敛到
一级侧边栏或 owning panel header。Canvas 和 Model Viewer 继续由 owning package
提供同一套工具组件，但主 viewport 工具栏统一为底部居中的横向 icon toolbar；宿主只提供
尺寸和 slot，不复制按钮、命令或 capability 判断。

Canvas 默认显示一个 Board，显式“在侧边打开”时最多同时显示两个不同 Board。Cut 可以保持
多个独立 `.otio` 打开，但 Phase 1 每次只渲染一个 Cut；优先支持 Canvas + Cut，而不是
Cut + Cut。通用 Preview 默认复用主创作区的临时 Preview View，固定后成为持久 View，显式
“在侧边打开”时与 Canvas/Cut 并排；Canvas 节点和 Cut Clip 继续使用 owning Surface 内嵌
Preview。Canvas 与 Cut 只通过显式 URI/revision handoff 和 source mapping 关联，不建立
一对一绑定或实时双向同步。

projection attachment 复用当前 Agent 已验证的协议语义并提升最小 host-neutral primitive：

- endpoint/attachment/window/view/owner identity；
- snapshot-first + acknowledgement；
- 连续 frame sequence 与 base/projection revision；
- gap、未知 schema、owner mismatch、旧 view/endpoint epoch fail-visible；
- fatal 后获取新 snapshot，不用 last-write-wins 或 active selection fallback。

Window layout/Project Tabs 由 Host 按 revision/CAS 持久化。ViewStore 只保存 draft、scroll、
selection、viewport 和临时输入。Project/Conversation/Run/Tool Call/Job/document facts 只存在于
Host/domain authority 与 renderer replica；不得创建全局 `desktopStore` 作为第二真值。

### 7. Package integration 保持 owner 和 Root 唯一

| Owner              | P1 child change 的 canonical 工作                                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent              | 复用唯一 Agent controller、`AgentWebviewRoot`、Pi/AgentSession、Conversation projection 和 Tab render runtime；剩余工作只补真实 API Evaluation、Desktop route 和生命周期证据             |
| Assets/Content     | 复用 `ContentLocator`、workspace-linked library、Entity/Search/local metadata 与 Assets-owned browser Root；Desktop 不建立第二套 catalog                                                 |
| Canvas             | 完整 `CanvasRoot` 注入 versioned `CanvasHostAdapter`；`.nkc`/domain 保持真值；OpenNeko resource transport 接管普通 audio/video 与真实媒体验收                                          |
| Cut                | 完整 `CutRoot`/OTIO/Cut command/ExportJob 保持 authority；`redefine-openneko-lightweight-editing` 关闭编辑/保存缺口，OpenNeko resource 保留 Cut mixed PCM                               |
| Preview            | 建立 package-owned `PreviewRoot`/descriptor lifecycle，组合现有格式 renderer；只消费 Host 授权 ContentLocator/media descriptor；提供临时、固定和显式侧边 Preview View，不默认覆盖 Canvas |
| Media              | Desktop Main 组合唯一 OpenNeko handler 与 exact-resource registry，实现 sender/owner/generation/Range/CORS/cancel/backpressure；删除 loopback HTTP、私有 media scheme 与 upstream proxy；PCM 只服务 Cut 等显式处理语义 |
| Generation/Quality | 只通过 GenerationJob/Quality owner 的 command 和 projection 接入 Agent、Canvas、Activity；P1.3 只消费已有 Job link/status，P1.6 才组合具体领域 port；不建立 Desktop task                 |
| Chara/Entity       | 根据 zero-consumer evidence 复用明确保留的 Chara application/core 和 Entity binding，通过 Agent/Context Dock 投影当前能力；不创建 CharacterProject/Version 或独立空编辑器                |
| Tools/Diagnostics  | 将媒体比较/metadata/diagnostic 的 browser-safe presenter 与 Host effect 分离；日志和错误使用公共 Logger/Errors，不暴露绝对路径或 runtime console                                         |

每个 child change 必须迁移 Desktop producer/consumer 到同一 owning Root/contract，并通过
import/path/residue guards 证明已退休的 VS Code/TUI/Engine/demo 路径不可达。不得为了保留
历史宿主测试而恢复 compatibility package、平行 adapter 或双 transport。

Character Dialogue/Embody 使用 Chara-owned session 和独立 Agent Tab kind，但投影在同一个
Agent Shell；不得建模为普通 conversation mode。Resource Dock 可以提供由 Entity authority
投影的“角色”分类和显式 Roleplay/引用入口，但不创建第二套 Chara 素材 catalog。完整
CharacterProject/Version、Character Studio、持久 CharacterRun、Companion projection 和
World 多角色运行不属于 Phase 1，必须保持 unavailable。

### 8. Phase 1 的真实纵向路径

P1.7 以隔离 fixture 验收：

```text
launch Desktop
  -> open/create content project
  -> Home/Project Tab binding
  -> start Agent conversation
  -> import/link media into Media Library
  -> place or generate a candidate in Canvas
  -> accept candidate through owning operation
  -> open media in Preview
  -> add selected media to Cut
  -> preview and export through Cut ExportJob
  -> inspect result and Activity/Attention
  -> close/reopen Tab and restart renderer/app
  -> recover project, conversation, view and owning Job facts
```

“完成”必须同时证明 UI 结果和执行路径：

- Agent 命中 Pi conversation runtime、Pi Session 与 Product Turn Bridge canonical path；
- Assets/Canvas/Cut/Preview 命中各自 public adapter；
- Generation/Export 命中 owning Job；
- Desktop media 命中 Main-owned OpenNeko handler、exact-resource registry 与 `@neko/media`；
- `neko-media:`、upstream proxy、已退休宿主、`neko-home`、Engine/client、mock store 和 demo
  surface 被删除、poison 或 residue guard 拒绝后仍通过。

### 9. 生命周期与错误语义

- 关闭 View/Project Tab 只 detach；Stop/Abort/Cancel/Delete 使用准确 owner identity。
- Window close 释放 window/view subscription 和 window-owned前台资源；detached Job 按 owner
  policy 继续。
- app quit 取消 surface-owned前台 run，等待或持久化 recoverable Job，并在 deadline 后输出
  明确 diagnostic；不能直接丢弃。
- IPC retry 使用 command id/idempotency key；outcome unknown 不自动重提生成、导出或写操作。
- autosave single-flight/coalesced latest intent；旧 completion 不能清除新 dirty revision。
- renderer reload 从 Host snapshot 恢复；持久化 UI state 不成为 runtime 真值。
- 缺失 adapter、unsupported route、unknown schema/version、无权限路径和非法状态全部
  fail-visible，不回退 retired host、legacy、active object 或 no-op。

### 10. 构建目标与 Phase 1 参考平台分离

当前原生构建闭集是 `darwin-arm64` 与 `win32-x64`，Linux 只运行 host-neutral CI。P0 build
change 拥有两个真实 host package artifact、Desktop typecheck 和 Windows build/startup
证据；这些证据不能被普通 Linux build 或 cross-package 替代。

Phase 1 产品级图形化纵向验收仍固定在 `darwin-arm64`，因为这是当前可执行完整本地 UI、
媒体和创作 fixture 的参考平台。代码和 contract 必须保持平台中立，但 macOS 的 Phase 1
E2E 与 Windows package 均不等于 Windows 安装/升级、凭据、GPU/媒体和发布资格完成。

P1.7 至少验证：

- Electron package、安装/启动、窗口、菜单、文件选择和应用退出；
- Node 24/native dependency/FFmpeg closure；
- scoped OpenNeko resource Range、图片/音频/视频/文档/3D preview；
- SDR baseline；HDR/10-bit 只报告 capability/diagnostic，不成为 Phase 1 完成条件；
- IME、快捷键、DPI、可访问性、crash/reload；
- 隔离 synthetic workspace，禁止使用真实用户配置、credential 或私人素材。

Windows 的完整 installer、签名、更新、凭据、GPU/媒体矩阵和产品 E2E 进入 Phase 2；Linux
不得重新获得 Desktop artifact、native runtime 或产品 fallback。

### 11. CI、Agent Evaluation 与图形化 UI 证据分离

- CI 必须运行 host-neutral static build、`darwin-arm64`/`win32-x64` package、
  deterministic unit/contract tests 和无 GUI headless Desktop functional subset。
- `pnpm test:agent:eval` 只验证 key-free harness/schema/dry-run，不是 AI 行为验收。
- Prompt、Skill、capability/tool routing、provider/model、AgentSession 或 Desktop Agent
  event projection 变化时，必须通过显式本地命令运行真实 provider API Evaluation，并记录
  provider/model/cost、canonical path 和 no-fallback evidence；不得加入 CI。
- Renderer layout、焦点、Portal 样式、IPC/CSP、窗口生命周期和媒体可见行为必须通过隔离
  fixture 的本地图形化 Electron 验收；不得加入 CI，也不能用普通浏览器替代。
- P1.7 必须组合确定性结果、真实 API Agent case（适用时）和图形化 Electron evidence；
  任一类证据不能冒充另一类。

## Risks / Trade-offs

- **范围仍然较大**：通过七个 child change、依赖 gate 和最终纵向验收限制并行漂移。
- **Canvas/Cut/Preview 解耦可能暴露旧设计问题**：必须修改唯一 Root/contract，不能旁建
  Desktop-only adapter 链来规避。
- **历史宿主文字可能重新进入任务事实**：只保留为历史/拒绝/residue evidence；当前 owner、
  package 和 Desktop 路径由 Accepted 文档、代码与 focused OpenSpec 决定。
- **Project catalog 可能被误写成 ContentProject**：catalog 只拥有导航 metadata；领域
  aggregate 另行设计。
- **Electron 依赖增加供应链和打包成本**：P1.1 锁定版本、fuses、安全测试和依赖闭包。
- **Phase 1 只在一个参考平台做完整图形化验收**：Windows package 是必要构建证据，但对
  Windows 的完整产品支持声明必须等 Phase 2。
- **Proposed package ADR 扩大关键路径**：Platform/Shared/Host/zero-consumer/identity changes
  维持独立 owner；未接受前不自动阻塞产品 P1，接受后按其显式依赖顺序实施。
- **Program change 可能长期悬空**：每个 child change 独立完成/归档，program 只跟踪 gate；
  P1.7 完成后立即归档本 change，不在其中继续 Phase 2/3。
