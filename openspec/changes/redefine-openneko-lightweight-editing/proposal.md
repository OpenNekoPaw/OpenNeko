## Why

OpenNeko Cut 当前在 NKV、Webview timeline store、Extension DTO 和 Rust timeline 之间重复维护工程语义，同时保留了超出首版目标的专业剪辑能力。当前应先收敛为 OTIO-only 基础剪辑器，让 `.otio` 文件成为可复制、移动、另存和复用的真实工程记录，并把 Webview 限定为临时交互状态。

现有“分离音频”不会生成 WAV：它创建一个继续引用原视频文件的 Audio element，并通过现有 link 关系避免视频和独立 Audio element 重复混音。本变更先保留这条已经工作的简单路径，不在同一次替换中重做完全独立的音视频关系或媒体派生系统。

本 change 与对应 Cut OTIO ADR 是最新目标。更早文档中的 Cut NKV、专业多轨、隐式目标、项目内媒体目录或 Desktop Cut 推断不再构成实施约束；在本 change 完成前，它们只描述当前代码事实或历史设计。

## What Changes

- **BREAKING** 将 `.otio` 设为唯一 Cut 持久工程格式；Cut 不再创建或写入 `.nkv`，也不把 timeline 写入 `.nkc`。
- `.otio` 文件本身是唯一持久 timeline 权威。Extension/Host 的 document session 负责读写、revision、undo/redo、save、backup 和 revert；Webview 只保存 selection、playhead、zoom、hover、panel layout 和缓存等可恢复状态。
- Cut v1 只保留一个顺序 Video Track、零到多个 Audio Track、Clip/Gap、link media、split、trim、reorder、ripple delete、gain/mute/fade、undo/redo、preview 和 export。
- **BREAKING** 删除固定/复杂变速、多视觉层、overlay/PIP、title/subtitle track、transition、nested timeline、mask、blend、keyframe、color/effect/plugin、专业模式和开放 DSP graph 的全链路。
- 当前不建设媒体 import/ingest/copy。添加媒体只接受规范化的 workspace-relative path，并创建 OTIO `ExternalReference`；允许引用 Cut 项目目录外、同一 workspace 内的文件。
- `.otio` 在同一 workspace 内复制、移动或另存后继续解析相同 workspace-relative 引用。跨 workspace 缺失媒体时保留工程结构并返回 missing-media diagnostic，后续通过显式 relink 修复。
- 用户显式执行“分离音频”时，先复用当前语义：创建引用同一媒体路径的 Audio Clip，并持久化稳定 Clip identity 与 `linkedAudioClipId` / `linkedVideoClipId`。不创建 WAV、不转码、不修改源文件。
- 分离前，Video Clip 可以继续按当前媒体运行时播放内嵌音频；分离后，link 关系确保该音频由显式 Audio Clip 承担且不重复混音。完全独立编辑、provenance-only 关系和多音频流选择留给后续 change。
- 媒体执行通过 host-neutral probe、preview、PCM、frame capture 和 export ports 表达。VS Code 当前仍组合现有 Neko Engine adapter，但 OTIO、Cut Core、Agent、TUI 和 Webview contract 不持有 Engine 类型；后续可整体替换媒体 adapter。
- 项目拥有固定 edit rate，v1 默认 `30/1`。复杂 mixed-rate 输出策略和可选 `30000/1001` 创建 UI 留给后续 change。
- 支持 workspace-relative `cut.defaultProjectRoot`，它只决定新 `.otio` 的默认保存位置，不成为媒体引用基准，也不创建强制 `media/` 或 `exports/` 目录。
- 右侧属性面板保留但收敛为单一上下文 Inspector；播放控制条和时间线工具条只保留 v1 操作；Minimap 垂直删除。
- Canvas 与 Cut 保持独立。Canvas route 只能创建新 Cut 或追加到带 URI/revision 的指定 `.otio`；不推断 active/recent Cut，不持续同步。
- Agent/TUI 只获得 host-neutral 离线 OTIO authoring：创建、打开、保存、另存、结构导入/导出、link reference、新增、编辑、删除、reorder 和 revision 校验。TUI evaluation 不验证媒体 probe、截帧、PCM、播放或 MP4 导出。
- **BREAKING** 不建设 NKC/NKV 在线迁移、双读或双写。旧文件保持字节不变并明确拒绝。
- Desktop Cut、媒体复制/转码、TUI 媒体运行时、TUI 截帧、通用格式转换、proxy/original、补帧和专业 NLE 能力均不在本 change 范围。
- 实施采用清理优先硬门禁：先垂直删除被替代代码、注册、测试、fixture 和依赖，并在 `cleanup-audit.md` 记录通过证据；清理 gate 未标记 `passed` 前不得开始新的 OTIO 生产实现。

## Capabilities

### New Capabilities

- `lightweight-creative-editing`：定义 OTIO 文件权威、基础操作、workspace-relative link、显式 Canvas/Agent target、legacy 拒绝和共享 Cut Core/UI。
- `vscode-cut-media-runtime`：定义当前 VS Code 媒体 adapter、现有逻辑音频分离语义、preview/export 执行与 Webview 数据边界。

### Modified Capabilities

更早未归档 change 中的 Cut NKV、项目内媒体路径和 Desktop 推断由本 change 的最新目标取代。它们在归档或提升为稳定 spec 时必须按本 change 收敛，不得把旧 Cut 目标重新提升为 canonical behavior。

## Impact

- Cut：`packages/neko-cut` Extension、Webview、Custom Editor、timeline store、operations、messages、undo、项目 codec、preview、audio、export UI、Inspector、控制条和 Minimap 路径。
- 共享边界：OTIO codec、Cut Core、document session、`TimelineView`、workspace-relative media reference 与 host-neutral media ports。
- 当前媒体实现：复用现有同源媒体分离、PCM、preview 和 export 路径；不把 Engine 类型写入新的公共 contract。
- Canvas/Agent/TUI：Cut target、capability schema、approval、revision 和 evaluation 从 `.nkv` 改为显式 `.otio`；TUI 只组合离线 OTIO authoring。
- 用户数据：旧 NKC/NKV Cut 文件不迁移、不覆盖；link 和分离都不会复制或修改媒体文件。
- 验证：OTIO contract、Host document ownership、Webview 无持久 timeline、workspace containment、legacy poison、当前 link separation、Canvas/Agent 指定目标、VS Code 运行态和 TUI 离线 artifact evidence。
