# ADR: Cut OTIO 工程与可替换媒体运行时边界

状态：Accepted（目标架构，尚未实施）
日期：2026-07-22
范围：`neko-cut`、`neko-canvas`、`apps/neko-vscode`、OTIO 工程、媒体引用、逻辑音频分离与媒体执行。

本文是 Cut 最新目标架构。它补充 [`package-boundaries.md`](package-boundaries.md) 和 [`webview-media-security.md`](webview-media-security.md)，并取代更早文档中的 Cut `.nkv`、专业多轨、隐式活动目标、持续同步、项目内媒体目录和从 Desktop 提案推断出的 Cut 格式结论。

实施状态（2026-07-23）：VS Code Cut 已切换到本 ADR 定义的 `.otio` authority、基础 Webview 与选定媒体 adapter；NKV/NKC 可写路径、Webview writable project store、专业功能和旧 NKV Minimap 已从该边界删除。Webview 保留 document-scoped Zustand Presentation Store，用于不可变 `TimelineView` 投影和可恢复 UI/gesture 状态；只读 OTIO Timeline Overview 承担基础长时间线导航。Desktop/TUI/Agent Cut authoring 仍不在本 ADR 的实施范围。

Desktop Cut 与未来媒体 adapter 由独立 OpenSpec/ADR 决定。本 ADR 只要求新的 OTIO/Cut Core contract 不依赖当前 Neko Engine，以便未来替换或删除媒体实现时不重写工程模型。

## 决策摘要

1. `.otio` 文件是唯一持久 Cut 工程；整体项目树移动和 Cut Save As 按下述引用规则保持媒体目标。
2. Host document session 拥有 OTIO bytes、revision、undo/redo 和文件生命周期；Webview 只拥有可恢复临时状态。
3. 媒体进入 Cut 后统一形成相对 `.otio` 所在目录的持久 link；workspace 内媒体原地链接，workspace 外媒体由 Host 先原子复制到 `.otio` 同目录的 `media/`，再向现有消费者投影 workspace-relative source。导入不转码，Save As 负责重写持久路径。
4. Video Clip 可播放内嵌音频并拥有静音状态；分离创建同源 Audio Clip，但不自动静音或去重，用户手动决定混音。
5. VS Code 当前媒体能力通过 host-neutral ports 接入；Engine 类型不得进入 OTIO、Cut Core 或 Webview contract。
6. 不支持的工程、路径和 operation fail-visible，不回退旧实现。
7. 实施必须先删除并验证旧路径，且 Cut Webview 中废弃的功能切片及其专属测试最先删除；基础 Webview 壳与 primitive 经审计后保留。`cleanup-audit.md` gate 通过前不得开发新的 OTIO 生产实现或把保留 Webview 接入新模型。

## 五层分析

| 层   | 决策                                                                                                        |
| ---- | ----------------------------------------------------------------------------------------------------------- |
| 职责 | OTIO 文件是工程事实；Cut Core 拥有 codec/command；Host session 拥有文件生命周期；Webview 只展示。           |
| 依赖 | Cut Core host-neutral；VS Code 注入 workspace IO；媒体能力通过窄 port 注入。                                |
| 接口 | 所有 durable command 携带 document URI/session identity/expected revision；媒体 contract 不含 Engine 类型。 |
| 扩展 | Desktop、TUI/Agent authoring 和未来媒体实现单独设计。                                                       |
| 测试 | OTIO/路径/命令用确定性测试，VS Code Debug Host 验证媒体/UI。                                                |

## 1. `.otio` 文件是唯一持久工程

```text
workspace/project.otio
  -> CutDocumentSession
      -> OtioDocument
      -> typed command + expected revision
      -> serialized OTIO bytes
      -> TimelineView
  -> Webview temporary presentation state
```

`CutDocumentSession` 按 document identity 隔离，拥有 dirty state、revision、undo/redo、save、save-as、backup、revert 和外部变更处理。Webview 只提交 command intent，不提供保存时的权威 project snapshot。每个 Webview 实例可以拥有一个 Zustand Presentation Store，直接保存不可变的 revisioned `TimelineView` 与可恢复的 UI/gesture 状态；它不得转换或维护第二份 writable project model，也不得拥有 OTIO serialization、save 或项目 undo/redo。

selection、playhead、zoom、hover、panel layout、缓存和 pointer gesture draft 均为可恢复状态。Preview 媒体 session 由 Webview controller 管理资源生命周期，后台导出 task 由 Extension Host 管理；两者在 Presentation Store 中只有只读展示投影。Webview 被销毁后，Host 仍必须能够保存和重新打开完整 OTIO，并继续已入队的导出任务。

新 Cut 只创建和打开 `.otio`。不双读/双写 NKC/NKV，不在 OTIO 失败后 fallback。旧文件保持字节不变并返回 unsupported diagnostic。

## 2. 冻结小型 OTIO 子集

只接受 `Timeline.1`、`Stack.1`、`Track.1`、`Clip.2`、`Gap.1`、`ExternalReference.1`、`RationalTime.1` 和 `TimeRange.1`。

顶层 Stack 包含且只包含一个 Video Track、零到三个 Audio Track 与零到一个 Subtitle Track，总数不超过 5。每条 Track 具有稳定 `trackId`；Track 只含 Clip/Gap，Clip 只含一个可用 ExternalReference。Subtitle Track 只承担 workspace 内 SRT/VTT 外部字幕 Clip 的基础排列，不包含富文本、样式、自动生成、预览叠加或导出烧录；当前 adapter 对非空 Subtitle Track 导出 fail-visible。nested Stack、Transition、Effect、TimeWarp、Marker、第二 Video Track、第四 Audio Track、第二 Subtitle Track、多个 media reference 或未知 schema version 在 mutation 前返回 object/path diagnostic。

OpenNeko metadata 只保存：

- project profile、`30/1` edit rate、width/height；
- 每个 Track 的稳定 `trackId`；
- 每个 Clip 的稳定 `clipId`；
- 当前 separation 所需的 `linkedAudioClipId` / `linkedVideoClipId`；
- Video Clip mute 与 Audio Clip gain/mute/fade。

link identity 只服务当前 separate/unseparate 关系，不参与自动静音或混音去重，也不承诺完全独立音视频编辑。未知 OpenNeko 字段直接拒绝。

Project Canvas 的明确 width/height 是 Preview 与后台导出的共同尺寸事实。TV、电影、短视频、方形等只作为 Project Inspector 的 profile 预设；Preview 必须先把源帧 contain 到黑色项目 Canvas，再把项目 Canvas contain 到当前容器，不得裁切或拉伸。

## 3. 媒体入口统一为 `.otio`-relative workspace link

```text
prepareMedia(localFileUri)
  -> workspace 内：原地链接
  -> workspace 外：原子复制到 <otio-directory>/media/<allocated-name>
linkMedia(workspaceRelativePath)
  -> Host containment + symlink check
  -> relativize(mediaUri, documentDirectory)
  -> ExternalReference(target_url = otioRelativePath)
```

文件选择器和 Explorer/系统拖入共享一个 Host prepare path。workspace 内媒体不复制；workspace 外普通本地文件先复制到 `.otio` 同目录的 `media/`，通过同目录 staging 与排他发布避免半成品和覆盖，名称冲突分配可移植后缀。复制成功后才执行 containment、probe 和 `link-media`；失败清理 staging 且不产生 OTIO mutation。Webview 不处理媒体 bytes，导入不转码、不创建 derived media。

ExternalReference 以 `.otio` 所在目录为解析基准，使用规范化 POSIX 相对路径；可通过 `..` 引用 Cut 项目目录外、同一 workspace 内的文件。禁止 absolute path、file/Webview/localhost/blob URL、runtime token、临时路径和解析后逃逸 workspace 的 symlink。

ExternalReference 是唯一持久路径。Host 解析并完成 workspace/symlink 安全检查后，向 Preview、Engine、Canvas 和 export adapter 只投影规范化 workspace-relative source；该投影可重建，不写入 OTIO metadata 或并行持久 DTO。

`cut.defaultProjectRoot` 只决定新 `.otio` 的默认保存位置，不写入工程，不成为媒体引用基准，也不要求 `media/`、`exports/` 或 derived 目录。

整体移动 `.otio` 与相对素材树时引用语义不变。只移动或直接复制 `.otio` 文件可能使引用失效；通过 Cut 执行 Save As 时，Host 必须先按旧目录解析媒体目标，再相对新目录原子重写所有 ExternalReference。普通文件系统复制不做隐式修复。跨 workspace 缺失媒体时保留工程结构并返回 missing-media diagnostic；用户通过显式 relink 修复。

OTIO Core 只持久化 `target_url`，没有规定所有工具必须相对 `.otio` 目录解析；官方 [File Bundles 文档](https://opentimelineio.readthedocs.io/en/latest/tutorials/otio-filebundles.html) 说明其 adapter 会按调用进程的 current working directory 解释裸相对路径。因此“document directory”是 OpenNeko 的固定解析契约，不是通用 OTIO 保证。第三方工具如果采用其他基准，仍需以项目目录为工作目录或显式 relink。

workspace-root 路径方案在同一 workspace 内移动单个 `.otio` 时更稳定，但它依赖 OTIO 文件之外的 OpenNeko workspace-root 上下文，第三方工具更无法独立解析。为保证整体项目树搬移并减少宿主隐藏上下文，本 ADR 选择 `.otio`-relative 作为 OpenNeko 唯一持久路径语义。真正自包含的 OTIOZ/OTIOD bundle 涉及媒体复制，不属于本 change。

## 4. Cut Core 与媒体校验分离

Cut Core 实现 create/open/save projection、可选轨道增删、按 `trackId` link/relink、兼容轨道内/之间的 Clip move、split、trim、ripple delete、Gap、audio gain/mute/fade、undo/redo 和 revision。Video Track 固定；Audio 最多三条、Subtitle 最多一条；跨 kind move 在 mutation 前拒绝。OTIO schema、path grammar 与 command invariants 可离线验证。

codec、duration、stream、frame、PCM 和 export 只在对应媒体操作发生时由选定 adapter 验证。Host 未组合媒体 adapter 时，结构编辑保持可用，媒体请求返回 `media-runtime-unavailable`。

## 5. 分离音频不自动改变混音

用户显式执行“分离音频”时，当前 VS Code media adapter 先检查源音频；Cut Core 再用一个 command 创建引用同一 ExternalReference、复制当前 ranges 的 Audio Clip，并写入双向稳定 link identity。新 Audio Clip 默认未静音、unity gain，Video Clip 的静音状态保持不变。

该操作不转码，不创建 WAV、staging、媒体副本或派生任务，也不修改源文件。

Video Clip 无论是否分离都可播放内嵌音频，并在 Inspector 提供 Clip 级静音。分离后，Video Clip 与 Audio Clip 是两路由用户分别静音的输入；两者都未静音时允许重复混音，adapter 不得擅自抑制其中一路。unseparate 删除 linked Audio Clip 并清理 link metadata，但保留 Video Clip 当前静音状态。

当前 move/trim/delete/undo 的 linked 行为可以保留；provenance-only identity、完全独立编辑和多音频流选择属于后续 change。

## 6. 媒体执行通过可替换 ports 接入

共享 contract 只定义 `MediaProbePort`、`FrameCapturePort`、`VideoPreviewPort`、`AudioPcmStreamPort` 和 `ExportJobPort`。

VS Code 当前 adapter 内部复用 Neko Engine probe、preview、PCM 和 export，但 Engine request、token、timeline DTO、native handle 和生命周期不得越过 adapter。媒体失败返回选定 adapter 的明确 diagnostic，不回退 NKV、Webview timeline 或隐藏实现。

未来替换或删除 Neko Engine 时，应由独立 change 实现新的唯一 adapter，再垂直删除当前 adapter。FFmpeg 或其他后端只执行 typed media operation，不能直接解释 OTIO 或成为第二个 timeline owner。

## 7. Canvas 使用显式目标

Canvas route 只包含有序且限制在 workspace 内的 media/gap snapshot。它只能创建新 `.otio` 或追加到显式 document URI + expected revision，不允许 active/recent fallback、隐式覆盖、replace selection 或持续同步。本次不增加 Agent/TUI authoring。

## 8. Webview 保留基础界面

Inspector 显示 Project、Track、Video Clip、Audio Clip、Subtitle Clip 与 Gap 的基础信息和已有 typed command 可编辑字段，并为 Video Clip 显示内嵌音频状态与 Clip 级静音。播放控制条保留开头、上一 project frame、播放/暂停、下一 project frame、结尾、时间码、全局静音/音量和全屏；时间线工具条及上下文菜单保留添加 Audio/Subtitle Track、向指定轨道链接音视频/字幕、split、删除、静音/音量、分离、undo/redo、zoom、fit-all 和 media export。时间线拖拽按稳定 `trackId` 与 frame 时间提交 `place-clip`，通过 Gap 表达空白并拒绝覆盖、超限或跨 kind 放置；Explorer/系统文件拖入复用 `prepareMedia -> link-media` Host path。

旧 NKV Minimap、专业/基础切换和 deferred property surface 从组件、state、message、i18n、style 和测试中垂直删除。基础时间线保留一个只读 OTIO Timeline Overview：仅从 revisioned `TimelineView`、播放头和真实 viewport 派生结构显示，交互只改变 Webview 水平滚动，不持有项目 store、媒体 IO 或 Host command。

Preview 舞台填满 Preview 分区的剩余空间并保持项目 profile 画幅，播放控制固定在舞台下方。Inspector 位于 Preview 右侧且只占 Timeline 上方区域；Timeline 横跨完整下方宽度。Inspector 折叠后保留窄 reveal rail，展开宽度限制在 220–420px；这些布局值均为 Webview 可恢复状态，不写入 OTIO。

Video/Audio Clip 可以使用一个 OTIO `LinearTimeWarp.1` 表达 `0.25x–4x` 常量速度；速度曲线、倒放和 time-remap 仍不支持。Preview adapter 必须返回活动输入集合的下一边界，Webview 到达边界时终止旧流并按 timeline time 请求新 Video/Audio inputs；preview 和 export 使用同一 source-time/constant-speed 映射。

不整包删除 Cut Webview。现有 package/build、应用壳、Host adapter、Zustand selector/action 交互模式和符合基础界面职责的 UI/media primitive 经清理审计后保留；NKV `ProjectData`、writable project mutation/history/save、project snapshot 与废弃功能切片必须删除。

## 9. 替换与验证

测试必须 poison NKV/NKC codec、Webview project snapshot save、active/recent target、旧 media ingest/copy 和隐藏 fallback。只有 Host CutDocumentSession、受控外部媒体复制、OTIO command、`.otio`-relative link 与选定媒体 adapter 被断言命中时才算成功。

替换顺序是架构约束：先在文档中冻结目标；第一批从现有 Cut Webview 垂直删除废弃功能切片及其专属测试、fixture、message 和 style，保留经审计的基础壳与 primitive，再删除其余旧代码与成功测试。完成 source/dependency/manifest/legacy/unused/user-data 审计并把 `cleanup-audit.md` 标记为 `passed` 后，才开始新的 OTIO codec、document session 或把保留 Webview 接入新模型。清理阶段不得用兼容层、placeholder、fallback 或 no-op 保持旧请求成功。

最低证据：

- OTIO parse/serialize、commands、revision、undo/redo、save/reopen、Save As rebase、整体 move 和 legacy bytes unchanged；
- document-relative resolution、workspace containment、项目外 link、symlink escape 和 missing-media relink；
- Webview state 丢失后保存、多个 document session 隔离和 no-fallback；
- linked separation 的同源引用、无媒体副本、Video Clip 静音和显式双输入混音；
- Extension Development Host 中的 Cut UI、播放、分离、PCM、export、取消和资源释放。

## 后果与权衡

- 工程权威和 UI 状态边界更简单，`.otio` 与相对素材树可在 OpenNeko 中整体搬移。
- workspace 内普通链接不产生自包含项目，跨 workspace 可能需要 relink；只有显式导入的外部媒体被复制到工程旁的 `media/`。
- 只移动 `.otio` 文件可能使路径失效；Cut Save As 会重写，外部复制不会。
- OTIO 工具对裸相对路径的基准并不统一，第三方迁移可能仍需设置工作目录或 relink。
- 分离后默认可能重复混音，用户通过 Video/Audio Clip 静音明确决定保留哪一路。
- 当前 VS Code 媒体实现仍依赖 Neko Engine，但新的项目与 capability contract 不依赖它。

## 被拒绝的替代方案

- **让 Webview 保存完整工程：** 违反持久事实边界，状态丢失会影响保存。
- **强制复制所有媒体到项目目录：** workspace 内媒体已在授权边界中，重复复制增加空间与生命周期成本；只复制 workspace 外显式导入的媒体。
- **ExternalReference 以 workspace root 为基准：** 单文件移动较稳，但需要隐藏的宿主上下文，第三方工具无法从 OTIO 文件本身推断该基准。
- **点击分离时生成 WAV：** 增加无必要的 job、staging、磁盘和清理。
- **分离时自动静音 Video Clip：** 替用户做不可见的混音决定；本次改为显式 Clip 静音。
- **本次同时重做完全独立音视频：** 扩大替换范围；先保留 link 与现行编辑联动。
- **让 FFmpeg/Engine 直接解释 OTIO：** 会形成第二个 timeline owner；必须先由 Cut Core 产生 typed operation。
