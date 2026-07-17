## Context

Canvas 目前由 `SelectionContextToolbar` 把 NodeCard policy、通用复制/删除和 descriptor 全屏动作拼接成顶部浮层，但所有单节点都会得到一个只会重新选中节点的 `edit` 动作，且全屏固定进入 overflow。Media policy 只有 `open-media-preview`；Extension Host 已能通过 `ResourceRef`、`DocumentArchiveResourceRef` 或持久路径解析本地素材并打开系统预览，也已有 AssetLibrary `importFile` API，但 Canvas Webview 没有提升入口。

生成结果存在两条真实路径：Shot 节点在 `storyboardPrompt` 与 `generatedAsset` / `generatedVideoAsset` 中保存创作上下文；Workspace Board 将持久生成结果投影为普通 Media 节点，并在 provenance 与 `ResourceRef` 中保存生成来源。前者已有 GenerationPromptPanel 和 Canvas creative-AI action，后者缺少独立的可执行生成目标，不能伪装成可直接重新生成。

本改动跨越 Webview、Extension Host、共享 Canvas DTO 与 AssetLibrary 命令边界，必须保持 `.nkc` 只保存稳定身份和可移植生成上下文，Webview 不持有本地文件能力，模型/provider 选择继续由 application composition root 管理。

## Goals / Non-Goals

**Goals:**

- 依据节点的真实素材能力投影顶部动作，而不是给所有节点相同按钮。
- 让引用 Media 素材可直接全屏、系统预览、复制节点、编辑图片和保存到素材库。
- 让生成素材显示持久提示词、模型（存在时）和参数摘要；有合法 Shot 生成目标时可快速打开既有 GenerationPromptPanel。
- 复用现有资源解析、AssetLibrary、fullscreen descriptor 和 Canvas creative-AI canonical path，并对无法解析或缺失能力的操作 fail-visible。
- 保持动作 UI 为短生命周期 Webview 投影，不改变节点边框、内容布局或画布坐标。

**Non-Goals:**

- 不在 Canvas 内实现新的图片编辑器、媒体 provider/model picker 或第二套生成执行器。
- 不让普通 Media 节点绕过候选审阅或假装成为 Shot creative-AI target；缺少合法生成 target 时只展示来源信息。
- 不把 Webview URI、cache path、temp path 或本地绝对路径写入 `.nkc`。
- 不为视频、音频强行提供当前没有 owning editor 的“编辑”按钮。

## Decisions

### 1. 用纯解析器生成素材能力与生成上下文

在 Canvas Webview 增加 package-local 的纯 `materialPresentation` 解析器，输入单个 `CanvasNode` 与当前画布节点集合，输出引用/生成来源、媒体类型、可用动作以及可展示的生成上下文。解析器只读取稳定 node data，不读取 DOM 或全局 store，便于单元测试和未来增加其他素材类型。

选择该方案而不是在 `SelectionContextToolbar` 内继续堆叠 node-type 条件，是因为动作来源、生成上下文和快速生成 target 是同一个变化点；也不建立跨包通用 registry，因为当前只有 Canvas 一个调用方。

### 2. 顶部动作按 capability 直接展示，危险操作留在 overflow

对可解析 Media/Shot 素材，顶部优先顺序为编辑（仅图片且有真实 host 路由）、打开预览、复制节点、保存到素材库、全屏；删除保留在 overflow。普通节点继续使用既有 NodeCard policy，但移除无副作用的通用 `edit`。

全屏继续由 `resolveNodeFullscreenPresentation` 决定，系统预览继续由 `openMediaPreview` 决定，复制明确表示 Canvas 节点复制而非复制二进制文件。没有素材或没有编辑器能力时不显示对应按钮。

### 3. Extension Host 拥有素材副作用与本地路径解析

新增 `saveCanvasMaterialToAssetLibrary` 与 `editCanvasImage` typed message。消息携带 node identity、稳定 `ResourceRef` / `DocumentArchiveResourceRef`、持久 asset path 和媒体类型。Extension Host 通过现有 content-access / local-resource 边界解析本地文件：

- 保存素材调用现有 `neko.assets.importFile`；
- 图片编辑读取已授权文件并调用现有 `neko.sketch.editImage`；
- 解析失败、插件不可用或类型不支持时显示明确用户诊断。

不从 Webview 发送或持久化 materialized cache path，也不直接导入 neko-assets 内部实现。

### 4. 生成上下文是持久来源证据，编辑态仍由语义提示词拥有

共享 Media node 增加最小 `generationContext`：prompt、可选 model、sourceNodeId、generatedAt 与参数摘要。`createGeneratedAssetWorkspaceProjectionRequest` 从 `GeneratedAsset` 投影该上下文，Workspace Board 计划原样写入 Media 节点。Shot 节点优先从当前生成 asset 的 prompt/model 读取历史来源；缺失时从对应 semantic prompt document 显示当前可重生成 prompt，但不读取已废弃字段。

历史生成 prompt 不会静默覆盖 Shot 的语义提示词。用户点击快速生成后仍打开现有 GenerationPromptPanel，由该面板写入语义提示词文档并走 `canvasCreativeAiAction`。

### 5. 快速生成只绑定合法的 Canvas creative target

生成上下文栏显示在选中节点下方。Shot 的生成结果可直接以自身作为 target；投影 Media 只有当 `generationContext.sourceNodeId` 能在当前 Canvas 中解析到 Shot 时才显示快速生成按钮并路由到该 Shot。找不到 target 时仍显示 prompt/model 来源，但不提供必然失败的按钮。

该限制避免为普通 Media 节点新增第二套生成/apply 协议。后续若产品需要独立 Media 派生工作流，应以新的 target/apply contract 实现，而不是复用 Shot 字段或自动创建隐藏 Shot。

### 6. Agent Evaluation disposition

Disposition: `excluded`。本改动不修改 Neko Agent prompt、Skill、capability/tool registry、provider/model selection、AgentSession 或 TUI 投影；快速生成只打开既有 Canvas GenerationPromptPanel 并沿已有 Canvas creative-AI action 路径执行。路径由纯解析器测试、Webview action dispatch 测试、Extension message/资源解析测试和真实 Extension Development Host 交互覆盖。若实现阶段改变 creative-AI executor、purpose routing 或有效 model 选择，则本结论失效，必须创建或更新对应 Evaluation suite 并运行真实 case。

## Risks / Trade-offs

- [旧生成 Media 没有 prompt/model 元数据] → 根据 generated `ResourceRef` 仍识别为生成素材，显示“未记录提示词”；不从标题或缓存反推 prompt。新投影开始写入 `generationContext`。
- [素材库重复导入] → 复用 AssetLibrary 自身的导入/去重语义；Canvas 不维护第二份 membership 状态。
- [Sketch 未安装或不接受图片] → Extension Host 显示明确错误，Webview 不假装编辑成功。
- [顶部动作过宽] → 素材动作最多五个直接操作，危险删除和低频动作进入 overflow；位置继续按屏幕空间 clamp。
- [生成 Media 的来源 Shot 不在当前画布] → 只展示生成来源，不提供无效快速生成；后续独立素材派生需要新的 OpenSpec。

## Migration Plan

1. 共享 `generationContext` 字段为可选；现有 `.nkc` 无需迁移且保持可读。
2. 新生成资产 Workspace Board 投影开始写入上下文；旧节点不做猜测性 backfill。
3. 移除顶部通用 no-op edit，替换为能力驱动动作；若需回滚，可仅撤销 Webview 动作投影和新消息处理，持久化的可选上下文仍可安全保留。

## Open Questions

- 独立生成 Media 的“重新生成后创建兄弟节点、替换当前节点还是进入候选审阅”需要单独产品决策，本变更不预设。
