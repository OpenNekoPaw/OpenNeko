# neko-canvas 架构

> 无限画布 + 语义编排编辑器，支持媒体节点内联播放、分镜系统、输入引用节点、候选审阅和跨扩展回流。

---

## 系统定位

neko-canvas 是 OpenNeko 的可视化编排工具。以 VSCode CustomEditor 方式打开 `.nkc` 画布文件，提供无限画布上的节点摆放、连接、媒体内联播放、分镜生成审阅、上下文引用组织等能力。它通过共享契约连接 neko-agent、neko-assets、neko-preview 与 neko-cut，不发现或激活已删除的 Story/Sketch 扩展。

`neko/boards/*.nkc` 不构成新文档类型。未给出显式 Canvas target 时，Canvas-owned Workspace Board projector 只写 `neko/boards/workspace.nkc`；调用方也可以显式指定其他普通 `.nkc`。系统不通过目录索引、会话 binding、scope、活动或最近编辑器推断目标，Agent 也不解析或直接写 `.nkc`。

Workspace Board 直接使用顶层普通 Media、Document 和 Text 内容节点以及普通 Canvas connection。生成结果先由 generated-output owner 保存到 `neko/generated/<kind>/` 并建立稳定 identity，再由 projector 按 canonical content identity 幂等写入 `.nkc`。AssetLibrary membership 不是投影前置条件。`.nkc` 是布局权威；目录树、对话和生成记录不能重建节点坐标、分组、标题、批注或用户移动。

Workspace Board delivery 是 Canvas domain 的 host-neutral canonical path：每个 terminal batch 原子地创建或复用顶层普通内容节点，稳定 ResourceRef/DocumentArchiveResourceRef revision 跨 delivery 去重，已证明的 `sourceArtifactIds` 投影为普通 `derived-from` connection。Inbox、Task、Run 和 delivery batch 只保留为 ledger/provenance，不创建视觉 Group。Extension、TUI 和 headless Host 只能通过 `WorkspaceBoardDeliveryCoordinator` 与最小 mutation port 接入；不得维护第二个 `.nkc` writer。Coordinator 先将 validated batch 写入用户级 LocalMetadata 的 `tasks` / `task_checkpoints` ledger，再以 fenced writer epoch reload 最新 revision、原子保存并写 projected/noop receipt。receipt 不重建 Board，也不恢复用户删除或移动的节点；旧 Board 中已有的历史 Group 保持可读，但新投影不得继续写入。

打开且未保存的 Canvas document 是 editor owner：外部 Host 保持 delivery pending，直到该文档 clean 或 lease 安全接管；revision/dirty 冲突必须可见，不使用 last-write-wins、active/recent Canvas 推断或 generic Send to Canvas fallback。显式 ordinary `.nkc` authoring 仍只写显式 target，不镜像 Workspace Board。

Canvas 编辑与预览共享同一个 `neko.canvasEditor` Webview。播放预览不是第二个独立 Webview，而是 Canvas Editor Webview 内的 `PlaybackWorkspace`：上方可显示/隐藏画布区与预览播放区，下方可显示/隐藏 Canvas 预览路线条。该决策遵循系统级 ADR：[`../../docs/architecture/adr-canvas-cut-playback-route-and-timeline-boundary.md`](../../docs/architecture/adr-canvas-cut-playback-route-and-timeline-boundary.md)。

旧的 `openNarrativePreview` 命令只保留为迁移 shim，行为必须转发到 `neko.canvas.revealPlaybackWorkspace` / `playback:revealWorkspace`，不得再作为独立 Canvas Preview Webview 的成功路径。`NarrativePreviewBridge` 只允许作为迁移来源、协议测试对象和后续删除候选；owner 为 `neko-canvas`，移除条件是同 Webview `PlaybackWorkspace` 覆盖 narrative/media route 渲染与真实 VS Code Webview 功能场景，验证至少包括 `pnpm --dir packages/neko-canvas exec vitest run packages/extension/src/__tests__/protocol.test.ts`，以及本地 Extension Development Host + `vscode-extension-debugger` 的聚焦场景。UI 运行态测试不得进入 CI。

---

## 子包结构

```
packages/neko-canvas/
├── packages/
│   ├── extension/    # Extension Host（Node.js）— 文件 I/O + 媒体代理
│   └── webview/      # Webview（React 18）— 无限画布 UI
└── package.json      # VSCode 扩展清单
```

---

## 整体架构

```
┌───────────────────────────────────────────────────────────┐
│                   VSCode Extension Host                    │
│                                                           │
│  extension.ts                                             │
│    ├─ CanvasEditorProvider (CustomEditorProvider)          │
│    │    └─ 处理 .nkc 文件读写                              │
│    │    └─ 消息分发（save/pick*/dropFiles/media:*）        │
│    │                                                     │
│    ├─ Views                                              │
│    │    ├─ CanvasOutlineProvider (TreeView 大纲)           │
│    │    ├─ CanvasStatusBar (节点数/选区/缩放)              │
│    │    ├─ CanvasTimelineProvider                        │
│    │    └─ AssetLibrary (资产库视图)                      │
│    │                                                     │
│    └─ 媒体代理 → neko-preview API（延迟加载）              │
│         └─ probe / play / seek / pause / captureFrame    │
│                                                           │
│         │ postMessage                                     │
│         ▼                                                 │
│  ┌─────────────────────────────────────────────────┐      │
│  │            Webview (React 18 + Vite)             │      │
│  │                                                 │      │
│  │  CanvasApp.tsx                                  │      │
│  │    ├─ InfiniteCanvas                            │      │
│  │    │    ├─ CanvasGrid (背景网格)                 │      │
│  │    │    ├─ CanvasViewport (CSS transform 变换层) │      │
│  │    │    ├─ ConnectionLayer (SVG 连线)            │      │
│  │    │    └─ Node Components                      │      │
│  │    │         ├─ Media / Storyboard / Annotation │      │
│  │    │         ├─ Text / Artboard / Group         │      │
│  │    │         ├─ Shot / Scene / Gallery          │      │
│  │    │         └─ Script / Document / Model / CanvasEmbed │
│  │    │                                            │      │
│  │    ├─ Controls                                  │      │
│  │    │    ├─ ZoomControls (缩放控制)               │      │
│  │    │    ├─ MiniMap (全局缩略导航)                │      │
│  │    │    └─ LayerPanel (图层树)                   │      │
│  │    │                                            │      │
│  │    ├─ CanvasToolbar (工具栏)                    │      │
│  │    ├─ PlaybackWorkspace                         │      │
│  │    │    ├─ CanvasViewportPane (画布区，可隐藏)   │      │
│  │    │    ├─ PlaybackStage (预览播放区，可隐藏)    │      │
│  │    │    ├─ RouteStoryboardMatrix (路线分镜矩阵，可隐藏)│
│  │    │    ├─ PlaybackRouteStrip (紧凑 fallback)    │      │
│  │    │    └─ PlaybackSession (route/playhead 状态) │      │
│  │    ├─ PropertyPanel (属性面板)                   │      │
│  │    └─ ContextMenu (右键菜单)                    │      │
│  │                                                 │      │
│  │  Zustand Stores                                 │      │
│  │    ├─ canvasStore (节点/连接/选区/视口)           │      │
│  │    ├─ historyStore (撤销/重做)                   │      │
│  │    ├─ canvasOperationStore (EditOperation bridge) │    │
│  │    └─ clipboardStore (复制/粘贴)                 │      │
│  │                                                 │      │
│  │  Interaction Hooks                              │      │
│  │    ├─ useViewportTransform (平移/缩放)           │      │
│  │    ├─ useNodeDrag (节点拖拽)                     │      │
│  │    ├─ useNodeResize (8 点缩放)                   │      │
│  │    ├─ useConnectionDrag (拖拽连线)               │      │
│  │    ├─ useViewportCulling (视口裁剪优化)           │      │
│  │    ├─ useSnap (对齐吸附)                        │      │
│  │    └─ useCanvasCoordinates (屏幕↔画布坐标转换)    │      │
│  └─────────────────────────────────────────────────┘      │
└───────────────────────────────────────────────────────────┘
          │ WebSocket (通过 neko-preview API)
          ▼
    neko-engine (Rust Sidecar)
      └─ H.264 + PCM 流（媒体节点内联播放）
```

---

## 节点系统

Canvas Basic/Professional 共用下列节点 schema 与 renderer。Basic 仅把右侧创建目录投影为 Media、Annotation、Group、Text、Artboard、Script 和 Document 等基础入口；已有 Storyboard/Scene/Shot/Gallery 等节点仍正常渲染。Professional 继续组合完整子系统目录。

### 支持的节点类型

| 节点类型          | 用途            | 特殊能力                                                                                                     |
| ----------------- | --------------- | ------------------------------------------------------------------------------------------------------------ |
| `MediaNode`       | 视频/音频/图片  | 内联 H.264+PCM 播放、帧截取                                                                                  |
| `StoryboardNode`  | 场景/故事板卡片 | 标题 + 描述 + 缩略图                                                                                         |
| `AnnotationNode`  | 文字注释        | 自由文本                                                                                                     |
| `TextNode`        | 排版文字        | 按显式 `plain` / `markdown` 格式在不透明正文面展示；导入快照 Header 使用来源标题与文件图标，内容浮层显式编辑 |
| `ArtboardNode`    | 画板/画框       | 固定尺寸容器                                                                                                 |
| `GroupNode`       | 分组            | 子节点列表 + 标签 + 颜色 + 组/取消组                                                                         |
| `ShotNode`        | 单镜分镜节点    | 候选版本导航、prompt/生成状态、cut 回流元数据                                                                |
| `SceneGroupNode`  | 场景语义容器    | 镜头纳管、排序、自动布局、场景级批量生成                                                                     |
| `GalleryNode`     | 角色/视角画廊   | cell 级生成、候选审阅、角色引用                                                                              |
| `ScriptNode`      | 剧本引用        | 低干扰 TOC、scene 跳转、显式 loading/empty/error runtime 状态                                                |
| `DocumentNode`    | 文档引用        | PDF/DOCX/EPUB/CBZ 等二进制文档预览；历史文本 Document 仍可读取                                               |
| `ModelNode`       | 模型引用        | reference/workflow 双模式                                                                                    |
| `CanvasEmbedNode` | 子画布引用      | `.nkc` 嵌入和打开                                                                                            |

### 节点增强功能

| 功能         | 节点                                                            | 说明                                              |
| ------------ | --------------------------------------------------------------- | ------------------------------------------------- |
| 富文本工具栏 | `TextNode`                                                      | 字号、粗体、对齐（左/中/右）、文字颜色            |
| 画板导出     | `ArtboardNode`                                                  | postMessage → Extension 保存对话框，导出配置 JSON |
| 分组管理     | `GroupNode`                                                     | BaseNode 包装、子节点列表、标签/颜色编辑          |
| 候选审阅     | `ShotNode` / `GalleryNode`                                      | N/M 切换并稳定写回选中结果                        |
| 输入引用     | `ScriptNode` / `DocumentNode` / `ModelNode` / `CanvasEmbedNode` | Explorer 拖入 + toolbar picker                    |

文本文件添加是 Canvas 快照导入。`.md` / `.markdown` / `.txt` / `.log` / `.fountain` 通过显式扩展名统一分类为 Text 资产；Extension Host 使用 Canvas 路径解析边界完成最大 1 MB 的严格 UTF-8 读取，只有读取成功才返回内容并创建 `TextNode`。正文、显式 `plain | markdown` 格式和可移植来源 provenance 写入 `.nkc`，绝对路径、读取状态和 diagnostic 不持久化。Markdown 通过 `@neko/ui` 基于 `@neko/markdown` normalized AST 渲染，raw HTML 保持 inert，未授权图片/本地资源不触发隐式读取。普通文件添加不创建 Script 节点，Script 留给未来显式剧本工作流。

### 连接系统

```
节点可定义 ports（输入/输出端口）
  → 拖拽连线时实时预览
  → 类型验证（image/video/audio/text/any）
  → 端口最大连接数限制
  → 连接标签编辑（PropertyPanel 内 label/type 属性面板）
```

---

## 核心数据流

### 打开画布

```
用户打开 .nkc 文件
  → CanvasEditorProvider.resolveCustomEditor()
    → 读取 JSON → postMessage('update', canvasData)
      → canvasStore 初始化节点/连接/视口
```

### 节点交互

```
用户拖拽节点
  → useNodeDrag hook 更新位置
    → useSnap 计算吸附（网格/其他节点）
      → AlignmentGuides 显示辅助线
        → canvasStore 更新
          → historyStore 推入撤销栈

用户拖拽连线
  → useConnectionDrag hook
    → 类型兼容性验证
      → ConnectionLayer SVG 渲染
        → canvasStore.addConnection()
```

### 媒体内联播放

```
用户点击 MediaNode
  → postMessage('media:play', {path})
    → Extension Host → neko-preview API
      → neko-engine 流启动
        → H264StreamClient / AudioStreamClient
          → InlineMediaPlayer 渲染
```

### Canvas 播放工作区

```
用户点击左侧工具栏“预览/播放工作区”
  → 同一 Canvas Editor Webview 显示/聚焦 PlaybackWorkspace
    → 基于当前 CanvasData 按需生成 CanvasPlaybackPlan
      → PlaybackStage 渲染当前 unit
      → RouteStoryboardMatrix 展示 route family / branch row / step cell / container group
      → PlaybackRouteStrip 作为紧凑路线条 fallback 展示 selected route
      → PlaybackSession 保存当前 route、unit、playhead 和播放状态
```

`RouteStoryboardMatrix` 是 `CanvasPlaybackPlan` 的 Webview-local 投影视图：行表示 route family 下的分支路线，列表示容器边界内的播放步骤，cell 表示可播放 unit/shot，空 cell 仅用于对齐。矩阵运行态只保存 view mode、active family、filter/highlight、fold、focus 等 UI 状态，不保存私有排序、列、空 cell 或矩阵顺序到 `.nkc`，也不成为第二个 timeline。若未来启用 route edit mode，写操作必须调用 canvasStore 的容器/节点/连线排序命令写回 `.nkc`，再重新生成 `CanvasPlaybackPlan`。

从矩阵发送到 Cut 时，Webview 只提交 route id 和当前 revision；Extension Host 重新从当前 `CanvasPlaybackPlan` 创建 `CanvasCutDraftPayload`，再调用 `neko.cut.importCanvasDraft`。矩阵折叠、筛选、空 cell 和可见列不会进入 draft。媒体、缩略图和视频流仍通过 Extension Host、`neko-preview` API 和 Engine 授权，不由 Webview 直接访问工作区文件。

Agent 对 Canvas 播放顺序的参与仅限读取 `CanvasPlaybackPlan`、展示 route card、触发 reveal/import/reorder capability 和执行确认门控。Agent 不持有 `PlaybackSession`、playhead、播放器或私有 route 顺序；播放请求应定位到 Canvas `PlaybackWorkspace`，后续剪辑请求应投递到 Cut。

### Agent Canvas Authoring

Canvas 对 Agent 暴露的是 Canvas-owned authoring surface，而不是 Webview 私有命令或 `.nkc` 原始 JSON。Agent 可以按需查询 `canvas_describe_authoring_capabilities`、`canvas_get_active_context`、节点/连接详情和 Canvas Markdown lifecycle capabilities；Canvas 返回版本化、分段的 authoring catalog，描述节点类型、presets、容器策略、连接规则、目标字段、风险级别、确认要求和推荐 recipe。

Canonical authoring path：

```text
Agent / Agent Webview handoff
  -> Agent 查询 Canvas authoring catalog / active context
  -> Agent 选择 Canvas-owned query 或 mutation tool
  -> Canvas Extension Host 校验 target、refs、字段/profile、资源和 approval
  -> CanvasProjectAuthoringService 解析 active / explicit / new .nkc target
  -> ProjectFileStore + .nkc codec 保存节点、连接、block 或 content mutation
  -> 已打开 Canvas Webview 作为投影同步 host-applied document state
  -> Canvas 返回 structured authoring result envelope
```

边界约束：

- `Send to Canvas` 是 Agent-visible handoff intent。Agent Webview/Extension 不得把按钮点击隐式转成 `neko.canvas.importAsset`、Canvas Markdown capability 或 `canvas_create_node`。
- 直接素材导入是显式 Import / Add Source 路径，只接收已授权 stable resource/source；如果需要写入 `.nkc` media/reference 节点，也必须通过 `CanvasProjectAuthoringService`，不能让 Webview 自行创建持久节点。
- `CanvasProjectAuthoringService` 是生产 `.nkc` 写入路径：无活动 Canvas Webview 时可创建新的 `.nkc` 并写入；已有目标时写入显式 `documentUri` 或当前 active Canvas。打开/聚焦 Webview 只是显式 reveal 行为，不是写入前置条件。
- Canvas Webview 是交互投影：负责选择、拖拽、视口、键盘、inspector、播放和预览；不再是 Agent/Send to Canvas/asset import 生产节点创建的 executor。
- Canvas 是 durable field/profile authority。Skill、Markdown 表头、`@` 文本和 prompt span 只能作为 hint；未知字段进入 review/custom metadata 或 diagnostic，不直接写 semantic node field。
- 分镜表按 prompt-first、field-backed 处理：prompt text 与 semantic spans 是用户直接编辑对象；表格列是审阅投影。prompt 与字段不一致时返回 alignment diagnostics 或 explicit merge/regenerate next actions，不静默反向解析覆盖字段。
- Mutation tool 必须返回 structured authoring result：status、refs、diagnostics、blocked reason、changed fields、prompt-field alignment 和 approval-gated next actions。渲染这些结果不能自动执行下一步 action。
- 未来如果提供 Canvas MCP server，它只能作为 Extension Host typed Canvas API 的 adapter。它不能绕过 active editor、Webview state、resource authorization、undo/history 或 Canvas descriptor registry 成为第二套状态权威。

### 文件拖放

```
VSCode Explorer 拖放文件到 Webview
  → postMessage('project:addSource', ProjectSourceAddRequest)
    → Extension Host 统一路径/资产持久化
      → postMessage('project:sourceAdded' | 'project:sourceRejected')
        → 成功后转为 dropAssets 域操作
          → canvasStore.addNode(MediaNode | TextNode | DocumentNode | ModelNode | CanvasEmbedNode, dropPosition)
```

---

## 性能优化

| 策略              | 实现                                                          |
| ----------------- | ------------------------------------------------------------- |
| **视口裁剪**      | `useViewportCulling` — 仅渲染可见区域内的节点                 |
| **CSS Transform** | `CanvasViewport` — 通过 CSS transform 实现平移/缩放，避免重绘 |
| **对齐缓存**      | `snapEngine` — 缓存对齐线计算结果                             |
| **按需加载**      | neko-preview API 延迟获取，仅在媒体播放时加载                 |

---

## 通信协议

### Webview → Extension

```
ready                             — Webview 就绪
save(canvasData)                  — 保存画布 JSON
canvasStatus(info)                — 同步大纲/状态栏
pickMedia                         — 打开媒体选择器
pickScriptDocument                — 打开剧本选择器
pickReferenceDocument             — 打开文档选择器
pickModelReference                — 打开模型选择器
pickCanvasDocument                — 打开 .nkc 选择器
project:addSource(request)        — 统一添加拖放/选择/素材库来源
media:probe(path)                 — 媒体探测
media:play/seek/pause/stop        — 播放控制
media:captureFrame                — 截取帧
operationApplied                  — EditOperation 脏标记桥接
exportArtboard(data)              — 导出画板配置
playback:revealWorkspace          — 显示/聚焦同一 Webview 内的 PlaybackWorkspace
playback:createCutDraft(route)    — 从当前 route 创建发送到 Cut 的剪辑初稿快照
```

### Extension → Webview

```
update(canvasData)               — 加载画布数据
keyboardAction(action)           — 转发快捷键
addMedia(mediaInfo)              — 文件选择器结果
dropAssets(assetDtoList)         — 拖放/选择文件解析结果
generationProgress               — 批量生成进度
timelineSync(payload)            — cut → canvas 最小回流（共享契约，仅操作元数据）
importStoryboard(payload, opts)  — story/agent → canvas 分镜导入（CanvasStoryboardPayload）
playback:loadPlan(plan)          — 加载/刷新 CanvasPlaybackPlan 投影
playback:timelineSync(payload)   — Cut 轻量回流后的播放路线状态刷新
```

---

## 关键设计模式

| 模式                      | 应用                                                            |
| ------------------------- | --------------------------------------------------------------- |
| **CustomEditorProvider**  | .nkc 文件的 VSCode 编辑器集成                                   |
| **Zustand Store**         | 集中式不可变状态（canvasStore + historyStore + clipboardStore） |
| **Hook 组合**             | 交互逻辑封装为可组合的自定义 Hook                               |
| **Viewport Culling**      | 性能优化 — 仅渲染视口内节点                                     |
| **Lazy API**              | neko-preview API 延迟获取，按需加载                             |
| **Port-based Connection** | 类型化端口 + 连接验证                                           |

---

## 项目文件格式

- **扩展名**: `.nkc`（JSON Visual Canvas）
- **格式**: 序列化的画布数据（节点列表 + 连接列表 + 视口状态）
- **编辑器 viewType**: `neko.canvasEditor`

---

## 技术栈

| 层级           | 技术                                                          |
| -------------- | ------------------------------------------------------------- |
| Extension Host | VSCode Extension API + TypeScript + esbuild                   |
| Webview UI     | React 18 + Zustand + Tailwind CSS + Vite                      |
| 画布渲染       | CSS Transform（平移/缩放）+ SVG（连线）                       |
| 媒体播放       | 委托 neko-preview API（H264StreamClient / AudioStreamClient） |
| 交互系统       | 自定义 React Hooks（drag/resize/snap/connect）                |
| 测试           | Vitest                                                        |
