## Why

OpenNeko Cut 当前在 NKV、Webview timeline store、Extension DTO 和 Rust timeline 之间重复维护工程语义，同时保留了超出首版目标的专业剪辑能力。当前应先收敛为 OTIO-only 基础剪辑器，让 `.otio` 文件成为可复制、移动、另存和复用的真实工程记录，并把 Webview 限定为临时交互状态。

现有“分离音频”不会生成 WAV：它创建一个继续引用原视频文件的 Audio element。本变更保留同源引用的简单路径，但明确把 Video Clip 的内嵌音频和独立 Audio Clip 作为用户可分别静音的混音输入；分离操作本身不自动静音、不自动去重，也不建设媒体派生系统。

本 change 与对应 Cut OTIO ADR 是最新目标。更早文档中的 Cut NKV、专业多轨、隐式目标、项目内媒体目录或 Desktop Cut 推断不再构成实施约束；在本 change 完成前，它们只描述当前代码事实或历史设计。

## What Changes

- **BREAKING** 将 `.otio` 设为唯一 Cut 持久工程格式；Cut 不再创建或写入 `.nkv`，也不把 timeline 写入 `.nkc`。
- `.otio` 文件本身是唯一持久 timeline 权威。Extension/Host 的 document session 负责读写、revision、undo/redo、save、backup 和 revert；Webview 只保存 selection、playhead、zoom、hover、panel layout 和缓存等可恢复状态。
- Cut v1 最多保留 5 个轨道：固定一个 Video Track、最多三个 Audio Track、最多一个 Subtitle Track；支持添加可选轨道与音视频/字幕 Clip、可切换的顺序/定位拖拽移动、Gap 规范化、按明确时间落点 link media、split、trim、常量变速、ripple delete、gain/mute/fade、undo/redo、preview 和 export。
- Subtitle Track 初版只持久化并排列 workspace 内的 SRT/VTT 外部引用；当前 VS Code 媒体 adapter 不负责字幕解析渲染或烧录，非空 Subtitle Track 的媒体导出必须 fail-visible，不能把未烧录字幕伪装成成功。
- **BREAKING** 删除速度曲线/time-remap、倒放、多视觉层、overlay/PIP、富文本字幕编辑与样式、字幕生成、transition、nested timeline、mask、blend、keyframe、color/effect/plugin、专业模式和开放 DSP graph 的全链路；保留 OTIO `LinearTimeWarp.1` 表达的 `0.25x–4x` 常量播放速度、基础 Subtitle Track 与外部字幕 Clip。
- Host 接受文件选择器或 VS Code Explorer/系统文件拖入的本地媒体 URI。外部拖入使用鼠标所在 Track 与时间落点；文件选择器使用当前所选兼容 Track 与播放头，无选择时按媒体 kind 选择固定 Video Track 或第一个兼容 Track。workspace 内文件直接链接；workspace 外文件先由 Host 原子复制到当前 `.otio` 同目录的 `media/`，再进入同一 link/probe/command 路径。OTIO `ExternalReference` 始终持久化为相对 `.otio` 所在目录的规范化路径；复制冲突分配新文件名，不覆盖既有媒体。
- Host 从 `.otio` 目录解析 ExternalReference 并完成 workspace containment/symlink 检查后，向 Preview、Engine、Canvas 和其他现有消费者只投影规范化的 workspace-relative source；该投影不写回 OTIO，也不构成第二份持久路径事实。
- 整体移动 `.otio` 与其相对素材树时引用保持有效；只移动 `.otio` 可能失效。受控 Save As 必须重写相对路径以保持原媒体目标；跨 workspace 缺失媒体时保留工程结构并返回 missing-media diagnostic，后续通过显式 relink 修复。
- 用户显式执行“分离音频”时，先复用当前语义：创建引用同一媒体路径的 Audio Clip，并持久化稳定 Clip identity 与 `linkedAudioClipId` / `linkedVideoClipId`。不创建 WAV、不转码、不修改源文件。
- Video Clip 可以播放内嵌音频，并提供 Clip 级静音按钮。分离后，Video Clip 保持原静音状态，新 Audio Clip 默认未静音且 unity gain；系统不自动静音 Video Clip，也不根据 link 自动消除重复混音，用户负责选择静音哪一路。
- 媒体执行通过 host-neutral probe、preview、PCM、frame capture 和 export ports 表达。VS Code 当前仍组合现有 Neko Engine adapter，但 OTIO、Cut Core 和 Webview contract 不持有 Engine 类型；后续可整体替换媒体 adapter。
- 项目拥有固定 edit rate，v1 默认 `30/1`。复杂 mixed-rate 输出策略和可选 `30000/1001` 创建 UI 留给后续 change。
- 支持 workspace-relative `cut.defaultProjectRoot`，它只决定新 `.otio` 的默认保存位置，不成为媒体引用基准，也不创建强制 `media/` 或 `exports/` 目录。
- 右侧属性面板保留但收敛为单一上下文 Inspector，位于 Preview 右侧且只占 Timeline 上方的预览工作区；播放控制条和时间线工具条只保留 v1 操作。Inspector 提供项目、Track、Clip、Gap 的基础可编辑字段，而不是只读 Clip 信息。每个上下文在同一连续滚动面中按基础、时间与裁剪、速度、音频、画布或状态等实际职责分组，不使用 Tab 隐藏属性类别，也不展示当前 OTIO/Core 未支持的变换、混合或蒙版入口。Timeline 提供与工具条复用同一 typed command 的上下文菜单。旧 NKV Minimap 及其 writable store/message 路径垂直删除，但基础界面提供一个只读 OTIO Timeline Overview：它只从当前 `TimelineView`、滚动窗口和播放头派生显示，并且只改变 Webview 临时滚动状态。
- 保留已经完成的基础编辑器交互骨架：上方 Preview/Inspector 与下方 Timeline 的分栏高度可调，Preview 与 Inspector 的横向宽度可调；预览舞台在可用区域内保持项目画幅且播放控制位于舞台下方，画布不叠加装饰边框、文件名或源路径；Inspector 可折叠并保存为 Webview 可恢复状态，唯一显隐入口位于 Preview controls 最右侧，折叠后不增加独立右侧工具栏；Clip 拖拽保留 pointer 生命周期、兼容 Track 反馈、时间落点与吸附指示。清理专业功能不得再次把这些 UI 基础能力替换成固定尺寸或最低限度 HTML drag。
- 项目画布尺寸仍由 OTIO `openneko.cut` profile 的明确 `width/height` 持久化。Project Inspector 提供 TV `16:9`、电影 `2.39:1`、短视频 `9:16` 与方形 `1:1` 等基础预设，并通过 revisioned typed command 修改同一 profile；预设只是确定宽高的 UI 入口，不建立独立持久导出配置事实。Preview 先把源视频完整 `contain` 到项目画布，再把项目画布完整 `contain` 到当前可调整容器；后台导出默认读取该 profile，并允许宽高/FPS 作为当次 job 的显式不可变覆盖，但不写回 OTIO 或形成第二份项目事实。
- 基础 Webview 必须保留可测试的组件边界，而不是把预览、控制条、Inspector、时间线、标尺、播放头、轨道和 Clip 全部内联进 `App.tsx`。组件可以通过 props 或 document-scoped Zustand Presentation Store 消费同一个只读 `TimelineView` 投影和临时交互状态；不得重新拥有 writable project store、第二份 timeline DTO 或保存快照。
- 基础时间线保留刻度、可定位播放头、水平滚动、缩放、可辨认的只读 Overview、轨道头、音视频/字幕入口、Clip 选择与拖拽；尾部裁剪且 Track/item identity 与顺序未变时不得立即收缩当前时间线画布范围，删除、移动或重排改变结构后则必须按当前投影收缩，不能把历史最大 duration 显示成伪 Gap。真实 OTIO Gap 使用有别于普通轨道背景的明确视觉。轨道头以媒体类型图标和显隐、锁定、静音、删除等 Track 图标操作代替 `V1 / Video 1 / A1 / Audio 1` 标签，不再为每条 Track 放置媒体“+”；媒体添加与 Track 创建统一位于 Timeline controls。视频缩略图和音频波形必须由 Host 通过当前 Neko Engine 媒体能力派生为只读、可丢弃展示，不写入 OTIO，也不得恢复旧 Webview 媒体缓存/项目 IO 路径。
- 基础 Clip 编辑保留选择、兼容轨道按时间放置、可见的首尾 trim 边界/时长调整、常量速度、播放头 split、ripple delete、音量/静音/淡入淡出和上下文菜单；时间线提供“顺序 / 定位”模式切换。顺序模式压实被修改 Track 的 Gap，并在最近顺序边界插入；ripple delete 同样压实实际删除 Clip 的 Track，删除末尾 Clip 后不得遗留旧 trailing Gap。定位模式以等长 Gap 保留源位置并按精确 frame 时间放置，重叠时 fail-visible。时间定位、放置与 trim 按 project frame 对齐，并在接近播放头或 Clip/Gap 边界时吸附。定位放置和显式 route 通过 OTIO Gap 表达空白时间，不持久化自由像素坐标；所有修改仍通过 revisioned typed command。同一 Webview 快速连续产生的 durable edit 必须按 Host revision 串行提交，不能让后续操作继续携带旧 revision 而随机失败。
- 保留并适配旧版导出配置、进度、取消、后台运行和任务恢复交互。Extension Host 持有 document/session/job-scoped 导出任务以及 staging/原子替换生命周期；关闭面板或重建 Webview 不得终止任务，重新打开相同文档可恢复进度。Webview 不再发送 `ProjectData` 或自行校验工作区媒体。
- 旧版基础功能的详细保留/删除矩阵以 `legacy-webview-capability-audit.md` 为实施约束。旧实现依赖 NKV/Zustand 只说明其数据边界需要替换，不构成删除已完成组件、交互和回归测试的理由。
- UI 迁移必须以变更前的 Cut Webview 组件树为实现基线：先一次性恢复旧 `components/`、`hooks/`、i18n 和样式，再把旧 Zustand 收敛为 document-scoped Presentation Store，并通过一个集中 OTIO adapter/controller 替换 NKV `ProjectData`、保存和 mutation 依赖，最后只删除矩阵中明确延期的专业功能。仅恢复原文件名但重写组件实现，不算复用完成。
- Canvas 与 Cut 保持独立。Canvas route 只能创建新 Cut 或追加到带 URI/revision 的指定 `.otio`；不推断 active/recent Cut，不持续同步。
- **BREAKING** 不建设 NKC/NKV 在线迁移、双读或双写。旧文件保持字节不变并明确拒绝。
- Desktop Cut、TUI/Agent Cut authoring、通用媒体库 ingest/复制、转码、格式转换、proxy/original、补帧和专业 NLE 能力均不在本 change 范围；唯一例外是 VS Code Host 对用户显式导入的 workspace 外普通文件执行受控工程内复制。
- 实施采用清理优先硬门禁：首先从现有 Cut Webview 垂直删除废弃功能及其专属测试，保留经审计可服务基础剪辑面的 package/build、应用壳、Host adapter 和共享 UI primitive；再删除其余被替代代码、注册、测试、fixture 和依赖。`cleanup-audit.md` gate 未标记 `passed` 前不得开始新的 OTIO 生产实现或把保留 Webview 接入新模型。

## Capabilities

### New Capabilities

- `lightweight-creative-editing`：定义 OTIO 文件权威、基础操作、`.otio`-relative link、显式 Canvas target、legacy 拒绝和 Cut Core/UI。
- `vscode-cut-media-runtime`：定义当前 VS Code 媒体 adapter、现有逻辑音频分离语义、preview/export 执行与 Webview 数据边界。

### Modified Capabilities

更早未归档 change 中的 Cut NKV、项目内媒体路径和 Desktop 推断由本 change 的最新目标取代。它们在归档或提升为稳定 spec 时必须按本 change 收敛，不得把旧 Cut 目标重新提升为 canonical behavior。

## Impact

- Cut：`packages/neko-cut` Extension、Webview、Custom Editor、timeline store、operations、messages、undo、项目 codec、preview、audio、export UI、Inspector、控制条和 Minimap 路径。
- 共享边界：OTIO codec、Cut Core、document session、`TimelineView`、`.otio`-relative media reference 与 host-neutral media ports。
- 当前媒体实现：复用现有同源媒体访问、PCM、preview 和 export 路径；不把 Engine 类型写入新的公共 contract。
- Canvas：VS Code 内的 Cut target 从隐式 `.nkv` 改为新建或显式 `.otio` URI/revision。
- 用户数据：旧 NKC/NKV Cut 文件不迁移、不覆盖；workspace 内 link 与音频分离不会复制或修改媒体文件，workspace 外显式导入只创建工程内副本且不覆盖源文件或既有目标。
- 验证：OTIO contract、Host document ownership、Webview 无持久 timeline、`.otio`-relative path rebasing、workspace containment、legacy poison、手动静音分离语义、Canvas 指定目标和 VS Code 运行态。
