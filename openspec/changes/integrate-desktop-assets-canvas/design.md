## Context

P1.1/P1.2/P1.3 已建立 Electron AppHost、固定 preload、Window/View identity、可恢复 Shell
projection 和真实 Agent Root。当前 Content Project 仍固定为：

```text
Project Tabs | Activity Rail | capability sidebar | Agent Root | Context Dock
```

Assets 仍是 VS Code Extension package：`MediaLibraryTreeProvider`、`EntityBrowserTreeProvider`
和命令层直接依赖 `vscode`，而真正可复用的 workspace-linked library、Search、Entity facade、
thumbnail/metadata 和 ContentLocator 服务混在同一源码树。Canvas 已有 `.nkc` domain、
`CanvasWebviewRoot` 和 VS Code Custom Editor，但 Root 在模块顶层获取 VS Code API，大量
组件直接 `postMessage`/监听全局 message；`CanvasHostAdapterSurface` 只是演示 Surface，
不能读取、编辑或保存真实 Canvas。

本变更必须先收敛公共 Root/adapter，再将真实功能接入 Desktop。Renderer 不能持有路径、
工作区 IO、项目事实或第二个 Canvas store；VS Code 使用方也必须迁移到同一 contract。

## Goals / Non-Goals

**Goals:**

- 以一级侧边栏、主创作区、Agent/Resource Dock 和保留 Timeline slot 替换当前视觉布局，
  同时保留 Window 内部 ProjectTab/View identity 与 snapshot/CAS 恢复语义。
- 建立 Assets-owned browser-safe Resource Browser Root 和 host-neutral presenter。
- 建立 versioned Canvas host runtime contract，让 `CanvasWebviewRoot` 通过显式 prop/context
  消费，不再在模块加载时获取 VS Code API。
- 在 Desktop 接通真实资源浏览、搜索、metadata/thumbnail、Canvas 打开/创建/保存、资源放置、
  candidate/accept 和 Workspace Board delivery。
- 支持多个不同 Board 打开、duplicate focus 和显式最多双 Canvas View。
- 证明 Desktop 命中 owning services/Root，且 VS Code TreeView/Custom Editor、demo surface、
  active workspace/editor fallback 未参与。

**Non-Goals:**

- 不接入 Cut、通用 Preview media runtime、Generation/Quality 或完整 Chara/World。
- 不实现任意 Dock tree、无限 editor group、同一文档多 View 或实时协作。
- 不改变 `.nkc` codec、Canvas node canonical model、Media Library link model 或 Entity authority。
- 不创建 Desktop-only asset catalog、Canvas document store、文件 IO、thumbnail cache 或搜索索引。
- 不把 Character 建模为 Canvas node；Resource Dock 只投影 Entity，并允许显式 Agent/Chara
  handoff 在对应 slice ready 后启用。

## Decisions

### 1. Shell identity 与视觉导航分离

`DesktopProjectTabProjection` 继续作为 Window-owned Project attachment identity，保证
duplicate-open、close/reopen、multi-window 和 View epoch 不变。Renderer 不再把它渲染为顶部
Project Tab；一级侧边栏以 catalog + Window projection 生成 Home、打开项目和最近工作入口。

Window-owned workbench projection 记录最小展示语义：

```text
primarySidebar.visible
resourceDock.visible / position / width / presentation
agentView.presentation(main|dock) / dockPosition / width
mainViews[] / activeMainViewId / optional split
timeline.visible / height
layoutPreset
```

具体字段由 Shell L0 contract 定义并用 revision/CAS 修改。它只保存布局和 View identity，
不保存 Resource rows、Canvas data、Conversation、Cut timeline 或 domain runtime。

备选方案：删除 ProjectTab contract。拒绝；它是已验证的 owner attachment 和恢复 identity，
视觉布局变化不构成废除运行契约的理由。

### 2. 使用受控 slot 和 preset，不建立 IDE Dock tree

Phase 1 提供固定 preset：

- Agent Focus；
- Canvas Focus；
- Canvas + Agent；
- Canvas + Resources；
- Canvas + Preview（P1.5 激活）；
- Canvas + Cut（P1.5 激活）。

Resource/Agent Dock 只允许 left/right，主区只允许一个主 View 加一个显式 side View，Timeline
只在底部。宽度不足时次要 Dock 转为明确 overlay 或隐藏；不通过无限压缩主区维持所有面板。

Agent Dock 与 Resource Dock 是两个独立侧边栏 owner，不得因为请求了同一 position 而被包装
进一个纵向 stack、共用宽度或共用 resize owner。当两者同时可见且恢复出的 position 冲突时，
Desktop 使用一个确定性展示归一化：Agent 保留 Chat preset 声明的位置，Resource Dock 移到
另一侧；后续 Chat placement 和 Resource reveal transition 同样写入该互斥位置。该归一化只
修改 Window-owned presentation state，不移动 Resource selection、query、Entity、Conversation
或其他领域事实。

`@neko/ui` 的 `EditorWorkbenchShell` 将增强为 slot/presentation primitive；Desktop 保留
产品级组合和 i18n，功能包不依赖 Desktop CSS。

备选方案：复用 VS Code Activity Bar/Workbench。拒绝；Electron 不应嵌入 VS Code Workbench
或复制其通用 Dock 状态复杂度。

### 3. Resource Browser 是 Assets Root，不是 Shell 列表

Assets 新增 browser-safe public entry，职责分层：

```text
assets/domain-or-services
  WorkspaceLinkedMediaLibrary reader
  MediaLibrarySearch
  Entity readers
  metadata/thumbnail projection

assets/resource-browser
  ResourceBrowserController
  immutable ResourceBrowserProjection
  ResourceBrowserRoot

assets/host-vscode
  TreeView/commands/dialog/reveal adapter

desktop Main/AppHost
  sender-bound files/dialog/reveal/content projection effects
```

现有直接依赖 `vscode` 的服务若包含稳定算法，先把算法移动到 host-neutral service，并通过小
ports 注入文件、watcher、metadata store 和 interaction；不能让 Desktop import Extension
或让 browser Root 调用 Node。

Resource projection 使用稳定 `ContentLocator`、`CreativeEntityRef`、fingerprint 和
representation identity。缩略图使用 Host 授权 descriptor，不包含绝对路径、`file://`、
cache path 或 token。

Character 作为 Entity facet 投影，头像/声音/模型仍是 representation bindings。Chara
runtime action 在 P1.6 之前显示明确 unavailable，不创建第二个角色 catalog。

### 4. Canvas Root 接受显式 runtime，而不是全局 VS Code API

Canvas owning package 定义一个固定、versioned、browser-safe runtime：

```text
CanvasHostRuntime
  identity: project/view/document/session/epoch
  getSnapshot / subscribe
  executeIntent(intent with documentUri, expectedRevision, commandId)
  projectContent(locator)
  requestSource / reveal / preview intent
  presentationState
```

`CanvasWebviewRoot` 通过 prop/provider 接受 runtime。所有现有 hooks、store actions、
Preview delegate 和 selection toolbar 使用该 runtime；不得直接调用
`getGlobalVSCodeApi()`。VS Code adapter 把 Custom Editor message 转为同一 runtime；
Electron adapter 使用固定 preload namespace。

Canvas document session、revision、dirty、save/undo/redo 和 `.nkc` codec 留在 owning
Canvas domain/host service。View 只拥有 viewport、selection、popover 和临时播放 UI。

备选方案：在 Desktop 注入假的 `window.vscodeApi`。拒绝；它会保留 VS Code wire 为事实源，
无法提供 sender identity、typed route coverage 或 poison 旧路径。

Canvas Root 的可视契约也由 owning package 拥有。宿主嵌入同一 Root 时，必须让宿主
Tailwind 构建扫描 Canvas package source，并由 Root 提供稳定 scope marker；Canvas 的
reset、token 和 document-only 样式只能作用于该 marker 或独立 Webview document，不能污染
Desktop Shell。复用 React 组件但漏编译其 utility class 不算复用成功。

工具栏按 `CanvasHostRuntime` 的显式 capability/handler 投影。Desktop 未实现 export、
package 或 send-to-Agent owner 时，对应控件保持隐藏并暴露 capability unavailable，
不得显示无 handler 的假按钮；拥有 source-add、undo/redo、preview 等 handler 的控件必须与
VS Code 使用同一 `CanvasToolbar`、popover 和交互实现。Canvas 内嵌 audio/video Preview
不是 Desktop 独立 viewer：Desktop adapter 必须复用 P1.5 的 `@neko/media` Node runtime，
完成 probe、poster/frame capture、HTML video/PCM descriptor、seek/stop 与 session cleanup；
Canvas Webview 继续只渲染 package-owned `PreviewSurface`。

### 5. Canvas 多文档由文档 session 与 View identity组合

每个不同 Canvas document 拥有独立 document session/revision。Window workbench 可以保存多个
`CanvasViewRef`，领域内紧凑 switcher 只显示打开的不同 Board：

- 打开同一 document 时聚焦既有 View；
- 默认只渲染 active Canvas；
- 显式 side open 最多渲染两个不同 document；
- 隐藏 View 保留允许的 View state，暂停重型 media/preview；
- close View 不删除 document，dirty close 必须进入 owning save/discard contract。

Agent、Resource Browser 和 Workspace Board 写入必须携带明确 document identity/revision；
不得使用 active/recent Canvas fallback。

### 6. Resource 到 Canvas 使用显式 authoring intent

主路径：

```text
Resource Browser selection
  -> stable ContentLocator / Entity representation
  -> explicit target Canvas document + expected revision
  -> Canvas authoring service validates/project source
  -> .nkc mutation + revision
  -> authoritative snapshot/patch
```

拖放只携带签名/opaque resource identity，不携带路径。取消 source picker、projection 失败、
stale revision、unsupported resource 或 target mismatch 必须返回 diagnostic，并保持 Canvas
不变。Candidate/accept 和 Workspace Board delivery 继续由既有 owner/coordinator 执行。

### 7. IPC namespace 按 owner 固定

Preload 增加固定 `assets` 和 `canvas` namespace，不提供通用 execute-command。Main 从真实
sender registry 派生 Window/View/Workspace/renderer epoch，并校验：

- request schema/version；
- Project/Workspace/View/document/session identity；
- locator containment 与 trust；
- expected revision/CAS；
- command id/idempotency；
- response owner 与 epoch。

未知、过期或跨 owner 请求 fail-visible。Renderer 不提交绝对路径、workspace root、
Electron event 或 Host object。

### 8. 迁移必须删除演示成功路径

`CanvasHostAdapterSurface` 当前只显示固定节点，它不能在 production Desktop capability
ready 后继续作为 fallback。迁移完成时：

- Desktop Canvas slot 只挂载完整 `CanvasWebviewRoot`；
- startup audit 只有在 Assets/Canvas required effects 全部存在时投影 ready；
- demo surface 被删除、测试 poison 或仅保留明确 story/test fixture，不能返回 production success；
- VS Code Custom Editor 使用同一 Canvas runtime contract；
- Assets VS Code TreeView 使用同一 presenter/service，不保持第二套搜索/身份规则。

### 9. 验收同时证明结果与路径

确定性测试覆盖 contract/parser、producer/consumer、workspace authorization、symlink escape、
ContentLocator-only payload、search/metadata/thumbnail、Canvas session/revision/save、duplicate
focus、双栏、stale epoch/revision、renderer reload 和 cleanup。

Electron fixture 场景覆盖：

```text
open project
  -> reveal Resource Dock
  -> search/import linked media
  -> create/open Canvas
  -> place resource
  -> save/close/reopen
  -> open second Canvas to side
  -> restart renderer/app and recover
```

路径 counter/poison 必须证明 Assets presenter、Content/Entity services、Canvas runtime/domain、
`.nkc` codec 和 fixed bridge 被使用，而 VS Code TreeView/command/Custom Editor message、
active object、demo store/surface 未参与。Canvas Webview 的视觉、交互、焦点和媒体回归仍需
Extension Development Host；Electron 场景使用生产 package 或受控 app runtime，不使用普通
浏览器替代。

Canvas presentation projection 必须携带产生该 revision 的 command identity。Canvas Root
提交的本地 `update-presentation` / `replace-document` 命令仍由 Host Runtime 接受并成为权威
快照，但不得作为异步回声重新覆盖同一 Root 已经继续前进的本地选区。初始恢复、其他 Host
surface、Agent 或外部命令产生的 projection 仍必须回推。不得通过 debounce、清空选区或忽略
全部 Host presentation 掩盖竞态。

### 10. Home 与 Content Project 共用一级导航契约

Home 与 Content Project 的一级侧边栏使用同一个信息架构和视觉 primitive：统一的品牌区、
折叠控制、开始创作、动态、资产中心、最近项目、最近 Agent 会话和底部状态区。Project 只
增加当前项目激活/关闭语义，不再展示一组名为“创作区域”的 Agent/Canvas/Assets capability
卡片；创作 View 的组合继续由主面板 display menu 和各 owning package 的局部 Tab/工具栏拥有。

资产中心是一级导航入口，但 Resource Browser 仍是独立、可调整宽度的 owner sidebar，不得
嵌入 Agent Dock。折叠控制只存在于品牌区，底部只保留 attention、display、timeline 和统一
Desktop 设置等实际可用的全局控制，不重复放置折叠或资源入口。Plugin/Skill 等未来入口只有
在 Desktop 存在真实 owner route 与 capability 后才可显示为可操作项，不得用 no-op 按钮模拟。

### 11. 悬停预览使用临时、owner-released 媒体会话

Canvas Root 和 Resource Browser Root 分别拥有 pointer enter/leave、当前 hover target、
请求序号与可见性状态。它们不得把 hover 写入 `.nkc`、Resource projection、Workbench layout
或最近 Preview。Canvas 继续复用 `@neko/media` 的 probe/play/stop 生命周期；Resource
Browser 通过固定 Host contract 请求精确 ContentLocator 的临时描述符，并由
`@neko/preview-webview` 的 compact surface 渲染图片、音频和视频。

Desktop renderer 只组合 Assets Root 与 Preview compact surface，不实现 `<img>`、`<audio>`、
`<video>` viewer。Desktop Main 从 sender、Resource Browser identity 和 resource identity
解析授权源，向 renderer 返回 opaque descriptor identity；绝对路径、Host secret 和 grant
不会越过 preload。离开、切换、facet 变化、View 隐藏、Root 卸载、窗口 detach 或 runtime
dispose 都必须停止播放并释放 descriptor。异步完成结果必须以请求 identity fencing，旧目标
不得覆盖新目标。

Canvas 的 package-owned Node media runtime 可以继续在 Main 中使用 loopback HTTP
准备视频与 PCM，但这些 upstream URL 不得进入 renderer。Desktop Canvas adapter 必须把每个
upstream 注册为绑定 `webContentsId`、Window、Canvas View/session 和 revision 的
`neko-media:` 描述符；`media:stop`、View detach 与 runtime dispose 释放同一 descriptor
session。Canvas Webview 只通过注入的 Host subscription 接收 probe/stream 结果，不依赖
VS Code 宿主才会投递的全局 `window.message`。

Canvas Webview 的 Host boundary decoder 必须接受并保留 `@neko/media` 声明的全部
`MediaTransport`，包括开发/VS Code 路径的 loopback `http` 和 Desktop sender-bound
`authorized`。decoder 必须同时校验 transport 与 URL scheme/authority 一致，且回归测试
必须使用 Desktop 实际返回的 `authorized` + `neko-media://desktop/...` 描述符并断言
package-owned player 已挂载；只断言 `media:play` 发出不能作为播放成功证据。

### 12. 结构化拖放生命周期只有一个 owner

`useFileDrop` 拥有 drag enter/leave/drop 的计数与遮罩状态；Canvas 不得在它之外为
ContentLocator 维护提前返回的第二条 drop path。共享 hook 接受调用方声明的有序结构化
JSON MIME 列表，Canvas 优先声明 portable ContentLocator MIME，并保留
`application/json` 作为同一 payload 的跨 React Root 表示。一次 drop 必须同步清理遮罩、
只解析第一个有效表示并只调用一次 Canvas `project-content`，不能等待异步 Host mutation
完成，也不能用 timer 或 Desktop-local state 强制隐藏。

### 13. 添加节点目录由 Canvas Root 统一拥有

Desktop 与 VS Code 不得各自实现添加节点菜单。`@neko-canvas/webview` 拥有同一扁平目录、
图标、国际化文本和 intent 路由，两个 Host 只实现来源选择和持久化 effect。Phase 1 目录固定为
文本、表格、图片、视频、音频和 3D 导演台；菜单顺序、说明与可用状态在两个 Host 中一致。
弹层视觉继续使用 13px Canvas control 密度，不套用 Desktop 页面卡片或 VS Code editor 菜单
样式；宿主不得覆写宽度、行高、图标底色或焦点态，从而避免相同组件在两个 Host 中出现尺寸
和颜色漂移。Radix Popover 通过 Portal 挂载于 Canvas Root 之外，因此 owning Canvas 组件必须
为共享 Popover 提供显式 content class，并只使用挂载在 document theme boundary 的全局
`--neko-elevated`、`--neko-border`、`--neko-fg*`、`--neko-hover` 和 shadow token。不得在
Portal content 中读取只定义于 `.canvas-webview-root` 的 toolbar/control/badge token，也不得
以硬编码浅色或 Desktop-local 覆写伪造一致性。共享 Popover 通过
`--neko-popover-background/border/foreground/shadow` 接受 owner surface 投影，避免 Canvas
依靠 stylesheet 顺序覆盖共享 primitive 的默认 glass surface。

文本和表格是两个用户意图，但都投影为 canonical Markdown node：文本使用空正文，表格使用
可直接编辑的 GFM 表格模板。不得恢复 legacy `text` / `table` node type。图片、视频和音频
继续通过 `request-source` 创建 canonical media node。3D 导演台通过显式 `model` source kind
选择 GLB/glTF/OBJ/STL/PLY，并创建 canonical file reference；模型渲染和 3D staging 继续由
`@neko/preview-webview` 拥有，不在 Canvas 或 Desktop 中复制 viewer，也不添加无 handler 的
假按钮。

## Risks / Trade-offs

- [Assets package 当前整体依赖 VS Code] → 先按 presenter/service/effect 责任切开，保留一个
  canonical service；不复制类到 Desktop。
- [Canvas 全局 message 使用面广] → 先定义 runtime facade，并按消息职责逐组迁移；通过 debt
  guard 禁止 production Root 继续读取全局 VS Code API。
- [相同 Root 在不同宿主外观漂移] → 宿主构建显式包含 owning package Tailwind source，
  package CSS 以 Root marker 隔离，并用 Desktop architecture guard 和 Root layout test
  同时验证生成链与作用域。
- [宿主 capability 不完整导致工具栏项目不同] → 只根据已注册真实 handler 显示操作；
  capability tests 区分“组件丢失”和“宿主尚未拥有能力”，禁止 no-op handler。
- [Shell redesign 与 domain integration 同时发生] → Shell 只先接布局/View identity，Assets
  和 Canvas 分别通过 ready gate 激活；未完成路径保持 unavailable。
- [双 Canvas 增加 GPU/媒体成本] → Phase 1 限制两个不同 Board，隐藏 View 暂停重型 Preview，
  同一 Board duplicate focus。
- [Character facet 被误解为 Character Studio] → 只投影 Entity facts/bindings和 unavailable
  Chara actions，不创建 CharacterProject/Version 或角色运行状态。
- [现有工作树已有大量 P1.3 修改] → 修改限定在新增 P1.4 artifacts/entry 和必要共享 contract，
  不回滚或重写 P1.3 用户改动。

## Migration Plan

1. 更新 Phase 1 program 的 workbench contract，创建本 child change。
2. 扩展 Shell L0 projection/CAS 和 `@neko/ui` slot primitive，迁移视觉 Project Tabs/Activity Rail。
3. 提取 Assets host-neutral services/presenter 和 browser Root；让 VS Code adapter消费它。
4. 定义 Canvas runtime contract，迁移完整 Root 与 VS Code adapter，poison demo/global path。
5. 接入 Desktop Main/preload/renderer、Resource Dock、Canvas View switcher和authoring intent。
6. 完成 deterministic、VS Code EDH、Electron fixture、package/build 和 quality gates后，将
   P1.4 capability 标记 ready，并勾选 program 4.x。

回退只能把 Assets/Canvas capability 恢复为明确 unavailable；不得恢复旧 visual mock、
Desktop-only store 或 VS Code fallback。现有 `.nkc`、Media Library link、Entity binding 和
源素材不迁移、不删除。

## Open Questions

无。Cut/Preview 的 View 规则已在 program 中冻结，但具体实现由 P1.5 定义；Character Studio、
Companion 和 World runtime 继续由后续独立 OpenSpec 处理。
