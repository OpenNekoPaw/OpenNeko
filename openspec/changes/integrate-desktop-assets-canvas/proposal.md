## Why

Desktop P1.3 已接通真实 Agent/Home，但 Content Project 仍以 Agent 为唯一主 Surface，
Assets/Media Library 和 Canvas 只显示 unavailable。当前 Shell 还保留顶部 Project Tabs、
窄 Activity Rail 和固定 Context Dock，与已经确定的一级侧边栏、多文档 Canvas 和受控创作
布局不一致。后续实现又把 Project Resource Browser 迁入 Main View/Tab 并加入一级侧边栏，
导致项目上下文工具替换主创作内容，也与全局 Asset center 争用一级导航语义。继续保留该
路径会让 Project Resource Browser 错误继承文档 Tab 生命周期。

## What Changes

- 在 `@neko/assets` owning boundary 建立 browser-safe Resource Browser Root，复用
  ContentLocator、workspace-linked Media Library、Entity/Search 和 local metadata，不包装
  VS Code TreeView 或复制资源 catalog。
- 定义 Desktop Assets/Canvas 的固定、sender-bound bridge 与 Host adapter，所有文件、
  搜索、缩略图、导入和写入 effect 由 Main 授权并返回稳定 identity，不向 renderer 暴露路径。
- 将完整 package-owned Canvas Root 迁移到 versioned `CanvasHostAdapter`，让 VS Code 与
  Electron 组合同一 authoring contract，并 poison Desktop 可命中的 demo/fixed Canvas 成功面。
- 接通资源搜索、预览意图、拖放/添加、Canvas 持久化、重新打开、candidate/accept 和
  Workspace Board delivery 的唯一 canonical path。
- **BREAKING** 将 Desktop Content Project 的视觉布局从顶部 Project Tabs + Activity Rail +
  固定占位 Context Dock 收敛为可显隐一级侧边栏、主创作区、可控 Agent Dock、固定右侧
  Project Resource Dock 和保留的 Timeline slot；Window 内部仍保留 ProjectTab/View
  identity 作为恢复契约，但不渲染第二套顶层项目 Tab。
- 为不同 Canvas 文档增加紧凑 View switcher、重复打开聚焦和显式双栏；Phase 1 最多同时
  渲染两个不同 Board，同一 Board 不创建重复 View。
- **BREAKING** Project Resource Dock 收敛为 Files/Media/Materials 三个互斥分区，删除没有
  独立职责的 All 分区；Materials 复用 Creative Entity 与有效 representation binding，
  不创建第二个素材 catalog，也不根据文件扩展名推断项目使用状态。
- Project Resource Dock 提供两个显式媒体库设置动作：关联全局已配置媒体库，以及选择目录
  创建并关联媒体库。全局媒体库注册表与工作区关联注册表保持独立 owner，项目侧只消费
  library identity 并建立工作区关联，不共享全局资产中心的 projection、active state 或
  生命周期。
- 将全局资产中心与项目资源管理器拆成两个稳定 presentation owner：全局资产中心在
  Home/Project 上下文中始终作为一级导航进入全局 Media Library / Asset Library；项目资源
  只作为当前 Project/Workspace 的右侧 Context Dock，不进入一级导航或 Main View/Tab。
- 保证开发期共享 Desktop Home contract 重新构建时 Main/preload/renderer 作为同一版本
  生命周期切换，禁止新 preload 请求命中旧 Main parser；真实 renderer 必须加载
  Assets-owned Global Library stylesheet，不能把源文件静态存在误判为运行态样式生效。
- Canvas 音视频节点和 Resource Browser 图片/音频/视频资源增加 package-owned 悬停预览；
  悬停只创建临时媒体会话，离开、切换条目或卸载时立即停止并释放，不打开 Workbench
  Preview、不持久化播放状态，也不向 renderer 暴露路径。
- 保持 Cut、通用 Preview、Generation/Quality 和完整 Chara/World runtime unavailable，
  只保留明确 slot 与 owning-slice diagnostic。

## Capabilities

### New Capabilities

- `desktop-creative-workbench-layout`: 定义一级侧边栏、主创作区、Agent Dock、右侧 Project
  Resource Dock、Canvas View switcher、受控双栏和小窗口 overlay 的 Desktop 布局与状态
  所有权。
- `desktop-assets-canvas-integration`: 定义 Assets browser Root、Desktop content bridge、
  Canvas Host adapter、资源到 Canvas authoring、持久化和 canonical-path 验收。

### Modified Capabilities

无。现有 Media Library、Entity binding 和 Canvas 领域事实不改变；本变更增加 Desktop
组合与 UI/Host adapter requirements。

## Impact

- Desktop：`apps/neko-desktop` Shell contract、Main/preload bridge、AppHost、renderer
  workbench、Window/View presentation state、测试与 Electron fixture。
- Assets/Content/Entity/Search：`packages/neko-assets` 的 public browser Root 和
  host-neutral presenter/adapter；现有 VS Code TreeView 继续作为 VS Code adapter。
- Canvas：`packages/neko-canvas` public Root、Host adapter、Webview transport consumer、
  document/session composition 和 VS Code regression path。
- UI：优先增强 `@neko/ui` workbench/tree/list/dock primitives，不建立 Desktop 私有设计系统。
- 数据：复用 workspace identity、ContentLocator、Entity bindings、`.nkc` 和 Workspace
  Board authority；不迁移或复制源素材，不持久化绝对路径。
