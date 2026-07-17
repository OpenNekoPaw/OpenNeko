# NekoCut

> 剪辑中枢：多轨道时间线、关键帧动画、特效转场、视频导出

## Context Summary

- 项目：OpenNeko - VSCode 创意工作套件
- 架构：Extension Host (Node.js 服务层) + Webview (React 时间线 UI) 双进程

## Quick Reference

- **职责**：专业视频剪辑——时间线编辑、关键帧动画、特效、字幕、导出
- **入口**：`packages/extension/src/extension.ts`
- **项目格式**：`.nkv`（JSON Video Instructions）
- **子包**：`extension/`（Host）、`webview/`（React UI）
- **依赖**：`@neko/platform`、`@neko/shared`、`@neko/neko-client`、`sharp`
- **激活依赖**：neko-engine、neko-tools、neko-preview
- **布局**：Webview 使用 Creative Workbench Shell，不再保留 Cut 专属左侧工具栏；主面板保留 PreviewControls、预览表面、时间线表面、常驻时间线控制条与 minimap，打包工程、右侧属性面板显隐和唯一导出入口统一位于时间线控制条；右侧 PropertyPanel 承接属性编辑按钮；Quality/Speed 收入 Settings，FPS/Screenshot/PiP 收入溢出菜单；PropertyPanel 宽度约束为 200-400px。播放状态、时间、轨道/元素数量和导出进度由 Extension 侧 StatusBar 投射到 VSCode 原生 StatusBar。

## Architecture

```
Extension Host (Node.js)
  ├── ServiceCollection     → DI 容器
  ├── EditorRegistry        → 编辑器注册表（Registry Pattern）
  ├── VideoEditorProvider   → CustomEditorProvider（.nkv 文件）
  ├── VideoEditorModel      → 项目数据模型
  ├── TimelineToolExecutor  → 时间线操作执行器（Command Pattern）
  ├── MediaProcessorService → 媒体处理路由（Facade + Cache）
  │   ├── RustMediaProcessorService  → N-API 调用 neko-engine
  │   └── FFmpegService              → FFmpeg 降级处理
  └── 消息处理器（handlers/）

    ↕ postMessage IPC

Webview (React + Vite)
  ├── EditorStore (Zustand)
  │   └── Slices: Project / Selection / Playback / UI / History
  │              / Keyframe / TrackOps / ElementOps / ShapeOps
  ├── Timeline 组件          → 多轨道拖拽、吸附、波纹编辑
  ├── PreviewPanel          → H264StreamClient → WebCodecs → Canvas
  ├── PropertyPanel         → 关键帧、特效、遮罩属性
  └── AssetLibrary          → 素材导入管理
```

### Headless Authoring Boundary

Host-originated durable `.nkv` writes use `CutProjectAuthoringService` and canonical commands such as `neko.cut.authoring.importGeneratedClip`, `neko.cut.authoring.addSourceToTimeline`, `neko.cut.authoring.importStoryboard`, and `neko.cut.authoring.importCanvasDraft`. Every edit targets an explicit `.nkv` document URI plus expected project revision; creating a project uses an explicit `new` target. The authoring path never infers an active/recent timeline and can edit a closed project through an isolated project session, then optionally reveal/sync that exact editor after save.

Multiple `.nkv` projects are ordinary independent Cut documents. Interactive timeline selection, playback, focused UI commands, export panel display, and custom-editor save snapshots may use their owning editor instance, but the adapter must materialize that editor's document identity and revision before crossing into durable authoring. Generated-output completion and Workspace Board projection do not mutate Cut automatically. A generated output or Canvas route reaches Cut only through an explicit user/Agent authoring intent that names an existing `.nkv` target or a new project target.

### 包结构

```
packages/
├── extension/src/
│   ├── base/         # ServiceCollection DI 容器
│   ├── bootstrap/    # 服务初始化顺序
│   ├── commands/     # VSCode 命令注册
│   ├── editor/       # EditorRegistry + VideoEditorProvider/Model
│   ├── handlers/     # Webview 消息处理器
│   ├── project/      # .nkv 文件加载/保存
│   ├── services/     # TimelineToolExecutor / MediaProcessor...
│   └── views/        # 大纲面板、状态栏
└── webview/src/
    ├── components/   # Timeline / PreviewPanel / AssetLibrary...
    ├── hooks/        # useKeyboardShortcuts / useTimelineActions...
    ├── stores/       # editor-store.ts + slices/
    └── services/     # postMessage 通信封装
```

## Deep Dive

### 设计模式

| 模式 | 应用 |
|------|------|
| Service Locator | ServiceCollection 依赖注入 |
| Registry Pattern | EditorRegistry 编辑器管理 |
| Command Pattern | TimelineToolExecutor |
| Facade + Cache | MediaProcessorService |
| Adapter | Rust / FFmpeg 多后端适配 |
| Slices Pattern | Zustand 状态分片 |

### 快捷键

`Space` 播放/暂停、`Cmd+Z` 撤销、`Cmd+Shift+Z` 重做、`N` 吸附、`R` 波纹编辑、`Delete` 删除
