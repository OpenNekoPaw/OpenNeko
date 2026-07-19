# NekoCanvas

> 无限画布编辑器：节点图编排、媒体资产管理、故事板、富文本、内联媒体播放

## Context Summary

- 项目：OpenNeko - VSCode 创意工作套件
- 架构：Extension Host + Webview (React + DOM/SVG) 双进程

## Quick Reference

- **职责**：无限画布编辑、节点图编排、媒体资产预览、故事板管理
- **入口**：`packages/extension/src/extension.ts`
- **项目格式**：`.nkc`（JSON Visual Canvas）
- **Board 约定**：`neko/boards/workspace.nkc` 是工作区默认 Board；其他 `neko/boards/*.nkc` 仍是可显式打开和定向写入的普通 Canvas 文档，不存在会话 Board、Draft 格式或 profile 转换
- **子包**：`extension/`（Host）、`webview/`（React UI）
- **依赖**：`@neko/shared`
- **激活依赖**：neko-engine、neko-tools、neko-preview
- **节点类型（现有）**：Media / Storyboard / Annotation / Text / Artboard / Group / Shot / Scene / Gallery / Script / Document / Model / CanvasEmbed（13 种）
- **核心功能**：富文本编辑、分组管理、连接标签、图层面板、画板导出（PNG/SVG）、原地粘贴、分镜候选审阅、场景容器排序、输入引用节点投放
- **布局**：Webview 使用 Creative Workbench Shell：左侧 CanvasToolbar 承接 Pan/Add/Import/Undo/Redo 等全局画布工具，底部显隐组承接 HUD（MiniMap/ZoomControls）与右侧 NodeLibrary 显隐；FloatingPanelHost、PlaybackControllerHost、GenerationPromptPanel、ContentOverlay 保留为主面板控件或 overlay；NodeLibrary 作为右侧创建面板。
- **Basic 目录**：默认只展示 Media、Annotation、Group、Text、Artboard、Script、Document 等基础入口；Storyboard/Table/Scene/Shot/Gallery、timeline/workflow 和专业子系统入口仅在显式 Professional 路径出现。Basic 不改变 `.nkc` schema，也不隐藏文件中已有的专业节点。
- **基础展示**：基础内容节点按 descriptor 使用名称加内容的 low-chrome shell；Foundational Header 保持透明、无分隔线，导入 Text 显示文件图标和来源标题。Text、文本文件和 Script 的正文面使用不透明主题背景，避免网格和连线干扰阅读。专业节点保持 structured renderer。普通 Group 是半透明空间容器，浮动标签以 `名称 x数量` 概括后代，真实后代继续使用绝对 Canvas 坐标。
- **状态显示**：subsystem summary 与 projection state 由 Extension 侧 CanvasStatusBar 显示，Webview 不再在无限画布左下角渲染状态徽章。
- **已落地 AI / 编排能力**：Canvas-owned typed creative action、GenerationPromptPanel、ScriptNode TOC、Document/Model/CanvasEmbed 引用、`CanvasProjectAuthoringService` 无 UI `.nkc` 写入路径、`NekoCanvasAPI.importAsset()` 无 UI media 节点导入、`NekoCanvasAPI.storyboard.import()` 内部 API、Canvas Markdown lifecycle capability（`canvas.ingestMarkdown` review-only、`canvas.createStoryboardFromMarkdown` 生产 scene/shot 创建）、`NekoCanvasAPI.storyboard.getExecutionSummary()` 只读执行摘要

## Architecture

```
Extension Host
  ├── CanvasProjectAuthoringService → 无 UI 创建/修改 .nkc 生产事实
  ├── CanvasEditorProvider  → CustomEditorProvider（Webview 交互投影）
  └── AssetLibrary 视图

Webview (React + Vite)
  ├── InfiniteCanvas        → 无限画布（CSS Transform 平移/缩放）
  ├── NodeLayer             → DOM 节点渲染（13 种节点类型）
  ├── ConnectionLayer       → SVG 贝塞尔曲线连线 + 类型化端口
  ├── InlineMediaPlayer     → H.264+PCM 流式内联播放（WebCodecs）
  ├── ViewportCulling       → AABB 视口裁剪（仅渲染可见节点）
  ├── GenerationPromptPanel → 内嵌 AI 生图对话框（委托 neko-agent）
  └── Zustand Store         → 画布状态 + EditOperation 记录
```

### 包结构

```
packages/
├── extension/src/
│   ├── editor/     # CanvasEditorProvider
│   └── views/      # 资产库侧边栏
└── webview/src/
    ├── components/ # InfiniteCanvas + 节点组件
    ├── hooks/      # 交互 Hooks
    ├── stores/     # Zustand 状态
    └── services/   # postMessage 通信
```

### 技术栈

DOM / SVG / CSS Transform、Canvas 2D（媒体帧）、WebCodecs（H.264 解码）、React 18、Zustand、Tailwind CSS、Vite

### EditOperation 集成

Webview 端通过 `canvasOperationStore` 作为运行时桥接层生成 `EditOperation`，与现有快照式 undo/redo 并行：

- **操作类型**：`canvas.node.*`（节点 CRUD/移动/缩放/旋转/分组/重排）、`canvas.connection.*`（连接 CRUD）
- **Store**：`stores/canvasOperationStore.ts` — 运行时生成操作并同步到 Extension
- **canvasStore 集成**：节点与连接变更会调用 operation bridge 生成统一操作协议
- **Extension 同步**：`operationApplied` 消息 → CanvasEditorProvider dirty 事件

### 资产导入

| 方式             | 状态 | 说明                                                                                                                           |
| ---------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| Explorer 拖拽    | ✅   | `useDragDrop` → `project:addSource` → `dropAssets`（media/text/document/model/canvas）；文本文件统一导入 TextNode              |
| 素材库拖拽       | ✅   | `application/json` 协议 → `project:addSource`，Extension Host 统一解析路径变量                                                 |
| 工具栏文件选择器 | ✅   | `pickMedia` / `pickFile` 生成 `ProjectSourceAddRequest` 后再创建节点                                                           |
| 引用节点选择器   | ✅   | `pickScriptDocument` / `pickReferenceDocument` / `pickModelReference` / `pickCanvasDocument`                                   |
| 文件类型         | ✅   | `.md` / `.markdown` / `.txt` / `.log` / `.fountain` 统一导入 `TextNode`；二进制文档继续创建 `DocumentNode` |

所有受支持文本文件统一导入低干扰 Text 节点。Extension Host 经既有 Canvas 路径边界执行最大 1 MB 的严格 UTF-8 读取，成功后把内容作为可编辑快照写入 `TextNode.data.content`，并在 provenance 中保留可移植来源路径；源文件后续变化不会静默覆盖 Canvas 编辑。`.md` / `.markdown` 使用 `format: markdown`，`.txt` / `.log` / `.fountain` 使用 `format: plain`。普通文件添加不再自动创建 Script 节点；Script 保留给未来显式的剧本工作流。

外部 `neko.canvas.importAsset` / `NekoCanvasAPI.importAsset()` 不再要求 Canvas Webview 已打开；它通过 `CanvasProjectAuthoringService` 创建 media 节点，只持久化 `${VAR}/path`、workspace-relative path、`ResourceRef` 或 `DocumentArchiveResourceRef`。Webview URI、blob、cache path 和 temp path 不能作为 `.nkc` 身份写入。

`NekoCanvasAPI.boards.project()` 是唯一公共 Workspace Board 投影入口。未指定显式 `.nkc` 时，Canvas 确定性写入 `neko/boards/workspace.nkc`；显式目标只接受调用方给出的普通 `.nkc` identity。它不扫描目录选择“最近/匹配”画布，也不读取会话绑定或活动编辑器。Markdown 使用普通 Text/Markdown 内容；文件引用使用支持稳定 `ResourceRef` 的 DocumentNode；图片、音频和视频使用普通 MediaNode。所有重放按 provenance/artifact identity 幂等。

Creator-visible generated output 在投影前已由 owning service 持久化到 `neko/generated/<kind>/`。Canvas 将其稳定 generated-output `ResourceRef` 写成普通持久 Inbox Group/Media/Document 节点，不要求先加入 AssetLibrary，也不创建 runtime-only review Group。AssetLibrary promotion 是独立的显式整理动作；`.nkc` 不保存 cache path、render URI、Webview URI 或 runtime Group ID。

选中引用或生成素材时，Canvas 通过统一的素材展示解析器提供预览、复制、存入素材库和全屏等当前保留的操作；Webview 只发送带节点与稳定资源身份的动作消息，文件读取、资源解析和 AssetLibrary 导入均由 Extension Host 执行。已移除或不可用的能力不会显示，也不会以空操作或运行时路径兜底。

生成素材可在节点下方展示持久化的生成提示词、模型与画面参数。只有生成上下文包含仍存在的 Shot 来源时才显示“再次生成”，并复用该 Shot 的 `GenerationPromptPanel` 与 Canvas creative action；缺少来源或历史提示词时只展示可验证的信息，不把 Media 节点伪装成新的生成目标。

`.nkc` 是节点、连接、Group、坐标、尺寸、标题、批注和用户空间调整的唯一权威。目录树只能发现普通 Canvas 文件，不能从 `neko/generated/`、对话或任务历史重建布局。重新投影同一 provenance 不重复创建节点，也不得覆盖用户移动和可编辑空间属性。

### 分镜系统（现状）

- **ShotNode**：单镜节点（景别/运镜/多角色/情绪/生图状态）
- **SceneGroupNode**：场景容器，支持镜头纳管、排序、自动布局、场景级批量生成
- **GalleryNode**：多视图画廊（三视图/四视图/九宫格/转面8方向），支持 cell 候选审阅
- **GenerationPromptPanel**：点击节点弹出，提交 Canvas-owned typed creative action
- **批量分镜生成**：逐节点进入同一 Canvas-owned action/执行/apply 路径，不维护第二套调度协议
- **候选审阅闭环**：ShotNode / GalleryCell 均支持 N/M 切换，并把筛选结果写回节点状态
- **cut 最小回流**：通过共享 `timelineSync` 契约仅回写 `lastImportedToTimeline*` 等操作元数据
- **asset 代理边界**：`NekoCanvasAPI.asset` 仅代理 `neko-assets` 的 `import/list/getById`，不作为资产事实源
- **执行摘要边界**：`storyboard.getExecutionSummary()` 与 `neko.canvas.getStoryboardExecutionSummary` 只投影 SceneGroup / ShotNode 的执行进度、选中资产引用、缩略图引用和 timeline import 元数据；它不是第二份 storyboard 数据源，也不暴露 Webview runtime URL、blob/data URL、播放状态或候选图墙 UI。

### Shot 创作 AI 按钮

Shot overlay 中的“优化提示词 / 生成图片 / 编辑图片 / 生成视频 / 编辑视频”是 Canvas creative AI action，不复用 `Send to Agent` 前台上下文交接，也不通过 Webview 直接调用 provider/model SDK。

- Webview 只发送 `canvasCreativeAiAction` / `canvasCreativeAiCandidateAction` typed message，并显示本地可判断的参数诊断、Canvas 执行状态和候选卡片。
- Extension Host 负责解析 `.nkc` 文档身份、shot/scene prompt document、source media、creative 参数、target/candidate refs、revision 和 idempotency，并调用 Canvas-owned executor；不经过 Agent creative run 或 Agent command。
- Canvas executor 只通过语义化 purpose port 请求 prompt/judge/媒体能力，不接收 Pi、provider/model、credential、token、temperature 等 LLM 细节。结果先写入 `node.data.creativeAiCandidates`；正式字段只有在用户接受或 judge 通过且 revision re-check 成功后才会更新。
- 候选卡片只展示 `ResourceRef`、generated asset id、workspace-relative path 或 `${VAR}/path` 等稳定身份摘要。Webview URI、blob/object URL、cache path、temp path 和 `dataUrl` 不能作为 durable result identity。
- GenerationPromptPanel、Shot overlay 与批量入口统一进入 typed creative action 和 Canvas candidate apply；不存在 `neko-agent.generateForNode`、Agent creative run 或旧面板 fallback。
