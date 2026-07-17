# neko-cut 架构

> 专业视频编辑器，提供时间线编辑、GPU 预览、多格式导出、特效/调色/字幕/遮罩等能力。

---

## 系统定位

neko-cut 是 OpenNeko 的核心创作工具。以 VSCode CustomEditor 方式打开 `.nkv` 项目文件，Extension Host 负责文件 I/O 和引擎通信，Webview 承载完整的时间线编辑 UI。通过 EditOperation 管道实现可撤销的操作历史，所有媒体处理委托给 neko-engine。

每个 `.nkv` 是独立的时间线事实和并发单元，用户可以同时维护多个项目。所有跨 Webview、Agent、Canvas、Sketch 或后台 Task 的 durable mutation 必须携带显式 `.nkv` document URI 和 expected project revision，或显式创建新项目；缺失、陈旧或后缀错误时 fail-visible。活动编辑器只拥有交互播放/选择状态，不能作为跨边界项目 target。

`CutProjectAuthoringService` 是生成素材、Storyboard 和 Canvas draft 进入 Cut 的 canonical 写入口。它为每次 closed-document authoring 创建隔离 project session，并在异步 ingest 后重新校验 revision。普通生成完成或 Workspace Board 投影不会自动写入时间线；只有显式 authoring intent 才能创建或更新 `.nkv`。

---

## 子包结构

```
packages/neko-cut/
├── packages/
│   ├── extension/    # Extension Host（Node.js）— 文件 I/O + 引擎通信
│   └── webview/      # Webview（React 18）— 时间线编辑 UI
├── l10n/             # 国际化翻译
└── package.json      # VSCode 扩展清单（50+ 命令注册）
```

---

## 整体架构

```
┌───────────────────────────────────────────────────────────┐
│                   VSCode Extension Host                    │
│                                                           │
│  extension.ts → ServiceCollection (DI)                    │
│    │                                                     │
│    ├─ VideoEditorProvider (CustomTextEditorProvider)       │
│    │    └─ VideoEditorModel (.nkv ↔ ProjectData)          │
│    │    └─ MessageHandler (Webview IPC)                   │
│    │                                                     │
│    ├─ Services                                           │
│    │    ├─ MediaService → EngineClient (probe/waveform)  │
│    │    ├─ ExportService (导出管线)                       │
│    │    ├─ ProxyService (流媒体代理)                      │
│    │    ├─ AssetService (资产管理)                        │
│    │    ├─ EngineConnection (端口发现)                    │
│    │    ├─ TimelineToolExecutor (AI 工具执行)             │
│    │    └─ ProjectSessionService (项目会话)               │
│    │                                                     │
│    ├─ Views                                              │
│    │    ├─ StatusBar                                     │
│    │    ├─ OutlineProvider (TreeView)                     │
│    │    └─ PropertyPanelViewProvider                     │
│    │                                                     │
│    └─ Bootstrap (Platform + MCP + Workflow 初始化)        │
│                                                           │
│         │ postMessage                                     │
│         ▼                                                 │
│  ┌─────────────────────────────────────────────────┐      │
│  │              Webview (React 18 + Vite)           │      │
│  │                                                 │      │
│  │  App.tsx                                        │      │
│  │    ├─ Timeline (时间线编辑器)                    │      │
│  │    │    ├─ TimelineTrack                        │      │
│  │    │    ├─ TimelineElement                      │      │
│  │    │    └─ TimelineMinimap                      │      │
│  │    ├─ PreviewPanel (H264 流 → Canvas)           │      │
│  │    ├─ PropertyPanel (属性/关键帧/特效)           │      │
│  │    ├─ AssetLibrary (资产库 + Diff)              │      │
│  │    ├─ ColorCorrection (调色面板)                │      │
│  │    ├─ Subtitles (字幕编辑)                      │      │
│  │    ├─ Mask (遮罩编辑)                           │      │
│  │    └─ Effects (特效编辑)                        │      │
│  │                                                 │      │
│  │  Zustand Store (13 Slices)                      │      │
│  │    ├─ projectSlice      (项目数据)              │      │
│  │    ├─ playbackSlice     (播放状态)              │      │
│  │    ├─ selectionSlice    (选区)                  │      │
│  │    ├─ uiStateSlice      (UI 状态)              │      │
│  │    ├─ operationHistorySlice (撤销/重做栈)       │      │
│  │    ├─ dispatchSlice     (操作分发)              │      │
│  │    ├─ elementOpsSlice   (元素操作)              │      │
│  │    ├─ trackOpsSlice     (轨道操作)              │      │
│  │    ├─ keyframeSlice     (关键帧)               │      │
│  │    ├─ clipboardSlice    (剪贴板)               │      │
│  │    ├─ shapeOpsSlice     (形状操作)              │      │
│  │    ├─ elementSplitSlice (元素分割)              │      │
│  │    └─ aiActionSlice     (AI 操作)              │      │
│  └─────────────────────────────────────────────────┘      │
└───────────────────────────────────────────────────────────┘
          │ HTTP/WebSocket
          ▼
    neko-engine (Rust Sidecar)
```

---

## 核心数据流

### 打开项目

```
用户打开 .nkv 文件
  → VideoEditorProvider.resolveCustomTextEditor()
    → 创建 VideoEditorModel（解析 ProjectData）
    → 创建 Webview + MessageHandler
      → postMessage('update', projectData) → Webview
        → Zustand Store 初始化（三阶段）
```

### 时间线编辑

```
用户操作（拖拽/添加/删除）
  → React 组件调用 Zustand action
    → 创建 EditOperation
      → applyOperation(project, op) → 新 ProjectData
        → pushOperation(op) → 撤销/重做栈
          → syncOperationToExtension(op) → postMessage
            → MessageHandler → VideoEditorModel.setContent()
```

### 视频导出

```
用户点击导出
  → ExportEngineFactory.create(format)
    → 选择导出适配器:
      ├─ StreamingFFmpegExportAdapter (GPU → FFmpeg)
      ├─ WebviewExportAdapter (WebCodecs)
      └─ CanvasExportAdapter (GIF/Image)
    → 渲染帧 → 编码/封装
      → writeExportChunk() → Extension Host → 写入文件
```

---

## 状态管理

### Zustand 三阶段初始化

```
Phase 1（独立 Slice）: project, selection, playback, uiState
Phase 2（历史依赖）:   operationHistory, dispatch, keyframe
Phase 3（组合依赖）:   trackOps, elementOps, elementSplit, clipboard, shapeOps, aiAction
```

### EditOperation 管道

```
用户操作 → dispatch(operation)
  → applyOperation(project, op)     ← 纯函数，返回新 ProjectData
  → pushOperation(op)               ← 推入 undo 栈（200 条上限）
  → syncOperationToExtension(op)    ← postMessage 同步到 Extension
```

- 所有操作可逆（`invertOperation()`）
- 高频操作（拖拽/缩放）跳过历史栈，避免性能瓶颈

---

## Extension Host 服务

| 服务 | 职责 |
|------|------|
| `MediaService` | 媒体探测 + 波形生成 → EngineClient HTTP dispatch |
| `ExportService` | 导出管线编排 + 进度跟踪 |
| `ProxyService` | 流媒体帧代理 |
| `AssetService` | 资产库管理 |
| `EngineConnection` | neko-engine 端口发现 + EngineClient 创建 |
| `TimelineToolExecutor` | AI 工具执行 → ProjectData 变更（Command 模式） |
| `ProjectSessionService` | 项目会话持久化 |

---

## Webview 组件

| 组件 | 职责 |
|------|------|
| `Timeline` | 时间线编辑核心（轨道/元素/缩略图/Minimap） |
| `PreviewPanel` | H264StreamClient → WebCodecs → Canvas 实时预览 |
| `PropertyPanel` | 属性编辑 + 关键帧曲线 + AI 操作 |
| `AssetLibrary` | 资产浏览 + 版本 Diff + AI 分析 |
| `ColorCorrection` | 色轮 + 曲线 + 基础调整 |
| `Subtitles` | 字幕编辑 + 样式 + 导入导出 |
| `Mask` | 遮罩编辑器 + 属性 |
| `Effects` | 特效（Fade/Zoom/Blur 等）编辑 |
| `SpeedControl` | 变速 + 时间拉伸 |
| `ShapeRenderer` | 形状渲染 + 笔工具 |

---

## 关键设计模式

| 模式 | 应用 |
|------|------|
| **CustomTextEditorProvider** | .nkv 文件的 VSCode 编辑器集成 |
| **Service Locator** | ServiceCollection DI 容器 |
| **Registry** | EditorRegistry 管理编辑器 Provider |
| **Command** | TimelineToolExecutor — 时间线操作命令化 |
| **Strategy** | ExportEngineFactory — 多格式导出适配器 |
| **Slice Pattern** | Zustand 13 个独立状态切片 |
| **EditOperation Pipeline** | dispatch → apply → push → sync 统一操作管道 |
| **Facade** | MediaService — 屏蔽 EngineClient 调用复杂性 |

---

## 项目文件格式

- **扩展名**: `.nkv`（JSON Video Instructions）
- **格式**: 序列化的 `ProjectData`（来自 `@neko/shared`）
- **编辑器 viewType**: `neko.videoEditor`

---

## 技术栈

| 层级 | 技术 |
|------|------|
| Extension Host | VSCode Extension API + TypeScript + esbuild |
| Webview UI | React 18 + Zustand + Tailwind CSS + Vite |
| 状态管理 | Zustand（Slice 模式，13 个切片） |
| 媒体处理 | EngineClient → neko-engine（Rust/wgpu/FFmpeg） |
| 导出 | StreamingFFmpegExportAdapter / WebviewExportAdapter / CanvasExportAdapter |
| IPC | VSCode postMessage API |
| 测试 | Vitest |
