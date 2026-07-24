## Context

当前 Cut 仍以 NKV、Webview timeline store、Extension-owned timeline conversion 和 Rust timeline 为代码事实。现有“分离音频”会创建一个引用相同视频 `src` 的 Audio element；它不是生成 WAV 的媒体派生流程。本设计保留同源引用，但不保留基于 link 的自动混音抑制。

本设计以 `.otio` 文件取代重复工程模型，同时尽量不重做已经工作的媒体行为。对应稳定决策见 [`ADR: Cut OTIO 工程与可替换媒体运行时边界`](../../../docs/architecture/adr-cut-otio-vscode-media-runtime-boundary.md)。本 change 和该 ADR 是 Cut 最新目标；更早 NKV、项目内媒体目录或 Desktop 推断只作为历史/当前实现说明。

## Goals / Non-Goals

**Goals:**

- 让可复制、移动、另存和复用的 `.otio` 文件成为唯一持久 Cut 工程。
- 由 Host document session 拥有 OTIO bytes、revision、undo/redo 和文件生命周期；Webview 只拥有临时交互状态。
- 提供 create/open/save/save-as、workspace link、外部媒体受控复制、最多 `1 Video + 3 Audio + 1 Subtitle`、添加可选轨道与音视频/字幕 Clip、同类轨道按时间落点移动、split、trim/时长调整、常量变速、ripple delete、Gap、基础音频参数、preview 和 export。
- 复用当前同源媒体 separation，不生成 WAV 或复制媒体；Video Clip 与 Audio Clip 由用户分别静音。
- 允许引用 Cut 项目目录外、同一 workspace 内的普通文件。
- 让 `.otio`-relative ExternalReference 在整体搬移项目树时保持 OpenNeko 解析语义，并减少对 workspace root 的隐藏依赖。
- 保持 Canvas 与 Cut 独立，只允许显式 `.otio` 目标的快照交接。

**Non-Goals:**

- 通用媒体库 ingest/catalog、自动转码、proxy/original 生命周期，或复制 workspace 内已有媒体。
- 在本次替换中重做 provenance-only 音频关系、完全独立音视频编辑或多音频流选择。
- 将 Neko Engine 固化为公共 Cut contract；当前 VS Code adapter 未来可由单独 change 替换。
- 专业 NLE、多视觉层、transition、nested timeline、富文本字幕编辑/样式/自动生成、调色、视觉效果、关键帧、速度曲线/time-remap、倒放、插件或开放 DSP graph。
- 当前媒体 adapter 的字幕预览叠加与导出烧录；基础 Subtitle Track 先提供 OTIO 持久化、排列和移动，运行时支持由后续 change 接入。
- 将导出结果直接发送到 Canvas，或生成/发送 DaVinci Resolve 工程；本 change 只导出用户在原生 Save Dialog 中选择的本地 MP4/MOV 文件。
- NKC/NKV 在线迁移、双读或双写。
- Desktop Cut、TUI/Agent Cut authoring 或非 VS Code Host 集成。

## Five-layer analysis

| Layer          | Decision                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| Responsibility | `.otio` 文件是工程事实；Cut Core 拥有 codec/commands；Host document session 拥有文件生命周期；Webview 只展示投影。 |
| Dependency     | Cut Core 只依赖 host-neutral contract；VS Code 提供 workspace IO；媒体实现通过窄 port 注入。                       |
| Interface      | Document commands 携带 document URI、session identity 和 expected revision；媒体 ports 不暴露 Engine 类型。        |
| Extension      | Desktop、TUI/Agent authoring 和未来媒体 adapter 需要独立 change。                                                  |
| Testing        | OTIO fixtures、document-relative path/rebase assertions 和 VS Code Development Host 分别证明数据与运行边界。       |

## Decisions

### 1. The `.otio` file is the only durable project authority

```text
workspace/project.otio
  -> Host CutDocumentSession
      -> OtioDocument
      -> typed command + expected revision
      -> serialized OTIO bytes
      -> TimelineView projection
  -> Webview presentation state
```

`CutDocumentSession` 按 document identity 隔离，拥有 OTIO bytes、当前 revision、dirty state、undo/redo、save、save-as、backup、revert 和外部文件变更处理。所有 durable command 必须携带显式 document URI/session identity/expected revision；缺失或陈旧时 fail-visible。

Webview 不保存可回写的 timeline snapshot。每个 Webview 实例创建一个 document-scoped Zustand Presentation Store，直接保存不可变的 revisioned `TimelineView` 投影，以及 selection、playhead、zoom、hover、panel layout、waveform/thumbnail cache 和 pointer gesture draft 等可恢复状态。Store 不转换出第二份 `ProjectData`，不提供通用 project mutation、项目 undo/redo、序列化或保存；所有 durable action 通过一个 typed intent dispatcher 提交给 Host，并在 Host 返回新 revision 后替换只读投影。VS Code 保存不得向 Webview 索取完整工程。

Typed intent dispatcher 对 durable edit 只允许一个 in-flight mutation。用户快速连续移动、裁剪或修改属性时，后续 intent 保存在当前 document/session controller 的 FIFO 队列中；Host 返回前一操作的新 `TimelineView` revision 后，下一操作才用该 revision 发送。发生 mutation error 或 document/session 替换时队列 fail-visible 地终止，不能继续以旧 revision 重试，也不能乐观修改 OTIO 投影。

Preview 的 stream/client/generation/cancellation 生命周期由独立 Preview controller 持有，Store 只投影 transport 状态；后台导出 job、staging 和取消生命周期由 Extension Host 持有，Store 只保存显式 job snapshot。这样高频播放头、拖拽和布局不需要 Host 往返，同时 OTIO 仍是唯一持久事实。

同一个 `.otio` 可独立复制、移动、另存和重新打开，但媒体引用是否保持有效取决于第 3 节的移动边界与 Save As rebase。复制不会复制媒体 bytes。

### 2. Cut v1 freezes a small OTIO structural subset

只接受：

- `Timeline.1`、`Stack.1`、`Track.1`；
- `Clip.2`、`Gap.1`、`ExternalReference.1`、最多一个 `LinearTimeWarp.1`；
- `RationalTime.1`、`TimeRange.1`。

Timeline 顶层 Stack 包含且只包含一个 `Track(kind=Video)`、零到三个 `Track(kind=Audio)` 与零到一个 `Track(kind=Subtitle)`，总轨道数不得超过 5。每条 Track 持久化稳定 `trackId`；Track 只含 Clip/Gap，Clip 只允许一个可用 ExternalReference，并最多带一个 `LinearTimeWarp.1(time_scalar=0.25..4)`。Subtitle Clip 不允许 time warp，只链接 workspace 内的 SRT/VTT 外部字幕文件，本 change 不提供字幕文本、样式、生成、预览叠加或导出烧录。当前 adapter 遇到非空 Subtitle Track 导出必须返回明确 diagnostic。nested Stack、Transition、其他 Effect/TimeWarp、多个 LinearTimeWarp、Marker、第二 Video Track、第四 Audio Track、第二 Subtitle Track、多个 media reference 或未知 schema version在 mutation 前返回 object/path diagnostic。

OpenNeko metadata 只保留当前实现需要的最小稳定 identity/link 和音频参数：

```text
timeline.metadata.openneko.cut =
  profile | editRateNumerator | editRateDenominator | width | height

track.metadata.openneko.cut = trackId
clip.metadata.openneko.cut = clipId
video clip metadata.openneko.link = linkedAudioClipId?
audio clip metadata.openneko.link = linkedVideoClipId?
video clip metadata.openneko.audio = muted
audio track/clip metadata.openneko.audio = gainDb | muted | fadeInSeconds | fadeOutSeconds
```

常量速度使用 OTIO 标准 `LinearTimeWarp.1` 而不是 OpenNeko 私有 metadata。`source_range.duration` 表达消费的源媒体时长，Timeline 投影时长为源时长除以 `time_scalar`；split、trim、preview 和 export 都必须使用同一换算。`1x` 不写 time warp。速度曲线、倒放和 pitch-preservation 选项不在本次范围。

`trackId` 在 create/add-track 时、`clipId` 在 create/link/split 时由 Cut Core 分配并持久化。所有目标轨道命令使用 `trackId`，不得以 `kind` 猜测第一条同类轨道。Clip 可在同一轨道内重排；Audio Clip 可在三条 Audio Track 之间移动；跨 kind 移动必须拒绝。Video Track 固定且不可删除，可选 Audio/Subtitle Track 只有为空时才可删除。link identity 只表达当前 separation/unseparation 关系，不参与自动静音或混音去重；本 change 不承诺音视频完全独立。未知 `openneko` 字段直接拒绝，安全的第三方 metadata 可原样保留。

### 3. Media entry normalizes into a workspace link and `.otio`-relative reference

文件选择器与 Explorer/系统拖入共享一个 Host 入口：

```text
prepareMedia(localFileUri)
  -> inside workspace: preserve source
  -> outside workspace: atomic copy to <otio-directory>/media/<allocated-name>
  -> canonical workspaceRelativePath
linkMedia(workspaceRelativePath)
  -> Host containment/symlink check
  -> relativize(mediaUri, documentDirectory)
  -> OTIO ExternalReference(target_url = otioRelativePath)

ExternalReference target_url
  -> resolve(documentDirectory)
  -> Host containment/symlink check
  -> canonical workspaceRelativeSource
  -> Preview / Engine / Canvas / export adapter
```

Host 对 workspace 内媒体只做链接，不复制。显式选择或拖入 workspace 外的普通本地文件时，Host 必须先复制到当前 `.otio` 同目录的 `media/`；复制使用同目录 staging 与排他发布，名称冲突通过可移植后缀分配新文件，不覆盖或修改既有文件。复制完成后和 workspace 内源文件一样进入唯一的 containment、probe 与 `link-media` 路径；失败时不提交 command，并清理 staging。Webview 不读取或复制媒体 bytes。

ExternalReference 持久化为规范化 POSIX 风格的 `.otio`-relative path，并以当前 `.otio` 所在目录为解析基准。它可以通过 `..` 指向 Cut 项目目录外、同一 workspace 内的文件，但不得是 absolute path、file/Webview/localhost/blob URL、Engine token、临时输出或解析后逃逸 workspace 的 symlink。

`.otio`-relative path 是唯一持久事实。Host 解析并通过安全检查后，必须把目标规范化为仓库现有 `neko/assets/...` 或普通 workspace-relative source contract，再交给 Preview、Engine、Canvas 和 export adapter。运行时 projection 可随时从 document URI 与 ExternalReference 重建，不得写入 OTIO metadata、并行 DTO 或缓存作为第二份 durable path。

`cut.defaultProjectRoot` 只决定新 `.otio` 的默认保存目录。它不进入 OTIO，不成为媒体解析基准，也不要求创建 `media/` 或 `exports/`。

移动行为取决于移动边界：整体移动 `.otio` 与其相对素材树时引用保持有效；只移动或直接复制 `.otio` 文件时，引用可能改变或失效。通过 Cut 的 Save As 移动文档时，Host 必须以旧文档目录解析每个媒体目标，再相对新文档目录原子重写 `target_url`，保证仍指向同一 workspace 媒体；普通文件系统复制不做隐式修复。跨 workspace 打开时，结构仍可编辑；不存在的引用产生 missing-media diagnostic，并通过显式 relink 修改。

OTIO Core 只持久化 `target_url`，不规定所有工具必须相对 `.otio` 目录解析；官方 [File Bundles 文档](https://opentimelineio.readthedocs.io/en/latest/tutorials/otio-filebundles.html) 说明其 adapter 会把裸相对路径按调用进程的 current working directory 解释。因此“document directory”是 OpenNeko 的固定解析契约，不宣称为通用 OTIO 语义。第三方工具若采用其他基准，仍需以工程目录为工作目录或显式 relink。

workspace-root path 被拒绝作为持久格式：它在同一 workspace 内任意移动 `.otio` 时较稳定，但需要 OpenNeko 额外提供未写入 OTIO 的 workspace root，第三方工具更无法仅凭工程文件推断。`.otio`-relative path 至少能随整体项目树搬移并减少宿主隐藏上下文，因此作为 OpenNeko 唯一 canonical path。外部媒体复制只是显式导入的 portability 边界，不把普通 workspace 链接改成全量复制，也不等同于 OTIOZ/OTIOD bundle。

### 4. Cut Core owns editing; media validation is operation-scoped

Cut Core 实现 create/open/save projection、add/remove optional track、targeted link/relink、同 kind 按时间放置、Gap 规范化、split、trim/时长调整、常量速度、ripple delete、audio gain/mute/fade、undo 和 redo。`place-clip` 显式携带必填 `sourcePolicy` 与 `overlapPolicy`。`sourcePolicy=ripple` 压实源 Track 的 Gap 后移除 Clip；目标 Track 也先压实 Gap，再按顺序边界插入，同轨向后移动时 Core 还要扣除已移除的 Clip 时长。`ripple-delete` 只压实实际删除 Clip 或 linked Clip 的 Track，其他 Track 保持不变。`sourcePolicy=preserve-gap` 以等长 Gap 保留源时间。`overlapPolicy=insert` 只在稳定 anchor 的前半/后半插入，`reject` 对精确定位重叠 fail-visible。Core 负责拆分、合并相邻 Gap 和顺序规范化，不把正常顺序拖拽覆盖作为错误。属性面板精确起点使用 `preserve-gap + reject`；顺序模式使用 `ripple + insert`；定位模式使用 `preserve-gap + reject`。轨道上限、kind 兼容性、源可用范围和速度范围由 Core 在 mutation 前验证。仍具 reciprocal link identity 的 Clip 进行 source range、source reference 或 constant-speed 编辑时，Core 原子更新关联两侧；音量与静音仍由用户独立控制。`CutDocumentSession` 在提交 revision、dirty 与 undo history 前验证命令结果可按 canonical codec 序列化，不能把非法状态延迟到 save/backup。项目 edit rate 固定为正有理数，v1 新项目统一为 `30/1`。

OTIO schema、路径 grammar 和 command invariants 可以离线验证。codec、duration、stream count、frame、PCM 和 export 能力只在相应媒体 operation 被请求时由当前媒体 adapter 验证。缺少 media adapter 时返回 `media-runtime-unavailable`，但不阻止合法 OTIO 结构编辑。

### 5. Separation creates a linked clip without automatic muting

VS Code 用户显式执行“分离音频”时：

1. 当前媒体 adapter 检查源是否具有可用音频；
2. Cut Core 在 expected document revision 上创建引用同一 ExternalReference 的 Audio Clip；
3. Audio Clip 复制发起时 Video Clip 的 timeline/source range；
4. 两个 Clip 写入稳定 `clipId` 和双向 link metadata；
5. 新 Audio Clip 默认 `muted=false`、`gainDb=0`，Video Clip 的 `muted` 保持不变；
6. 一个 command 原子修改 OTIO 并记录 undo。

该操作不调用音频转码，不创建 WAV、staging 或派生目录，也不修改媒体文件。Video Clip 无论是否分离都可贡献内嵌音频，并在 Inspector 提供 Clip 级静音按钮。分离后 Video Clip 与 Audio Clip 是两路可独立静音的混音输入；若两者都未静音，preview/export 允许听到重复音频，系统不得擅自选择或静音其中一路。

unseparate 删除 linked Audio Clip 并清理 link metadata，但不改变 Video Clip 的当前 `muted`；如果用户此前静音了 Video Clip，需要自行取消静音。移动、trim、delete 和 undo 的现行 coupled 行为可以保留；完全独立编辑和 provenance-only identity 属于后续 change。

### 6. Media execution is behind replaceable host-neutral ports

公共 Cut contract 只定义：

- `MediaProbePort`；
- `FrameCapturePort`；
- `VideoPreviewPort`；
- `AudioPcmStreamPort`；
- `ExportJobPort`。

VS Code 当前提供一个 editor/document-scoped adapter，内部复用现有 Neko Engine probe、preview、PCM 和 export。该实现不能把 Engine request、token、timeline DTO 或 native handle 暴露给 Cut Core、OTIO 或 Webview contract。

导出不是 Webview 等待一次 Promise 的前台操作。Extension Host 持有 `documentUri + sessionId + jobId` 标识的 enqueue、progress、cancel、complete/error、staging 与原子替换生命周期；Webview 的配置/进度面板只发 intent 和订阅只读 job projection。关闭面板、Webview 重建或编辑器失焦不取消任务，重新打开相同文档可以查询仍在运行或最近终止的任务。取消必须针对显式 jobId，不能猜测“最近任务”。Extension Host 同时把运行中、完成和失败状态投影到原生 VS Code 状态栏；状态项只能由显式 task snapshot 驱动，点击时打开该任务所属 `.otio`，不得回退到当前活动或最近编辑器。播放时间与媒体信息仍由 Webview 控制条拥有，不在状态栏重复维护。

`cut:export-start` 被 Host 接受且 identity 匹配时是导出意图的唯一冻结点。Host 必须在打开 Save Dialog 前取得当前已接受的内存 `TimelineView`，并将其 `documentUri/sessionId/revision` 与不可变 export-job settings 一起绑定到 job。不隐式保存 VS Code 文档；Save Dialog 等待期间及 job 运行期间的新编辑只影响下一次导出。导出不得重读磁盘、向 Webview 索取 timeline，或从 active/recent editor 推断源。

项目 Canvas profile 仍是持久宽高和 edit rate 的唯一事实。导出面板为每个 job 提交完整且不可变的 `outputName/container/width/height/framesPerSecond/videoBitrate/includeAudio/audioBitrate/audioSampleRate`。`outputName` 只决定原生 Save Dialog 的默认文件名；`container` 只允许 `mp4 | mov`；分辨率预设保持项目宽高比并生成偶数尺寸；帧率、码率和音频参数直接进入同一个 H.264/AAC adapter。关闭音频时 adapter 必须移除 Video 内嵌音频和独立 Audio Track 的全部贡献，并关闭预期音频流校验；启用音频时 `audioSampleRate` 必须真实进入 Engine mixer/encoder，不能只改变 UI 标签。

这些值在 Webview 中从当前冻结 profile 和明确的面板默认值初始化，随 start intent 一次性提交，由 Host 校验后成为 job settings。它们不写回 OTIO、不成为用户偏好或第二份项目 profile，adapter 不再自行补充隐藏默认值。“按原项目”必须精确使用当前 profile；MP4/MOV 共享同一条导出路径，只由已校验的容器设置和目标扩展名选择 muxer。导出面板不得出现“导出至画布”或“导出到达芬奇”入口。

媒体失败返回明确 diagnostic，不回退 NKV、Webview-owned timeline 或另一隐藏实现。未来删除或替换 Neko Engine 时，先通过独立 OpenSpec 实现新的唯一 media adapter，再垂直删除当前 adapter；OTIO 和 Cut Core contract 不随之变化。

### 7. Canvas and Cut remain independent

```text
Canvas route
  -> ordered workspace-contained media/gap draft
  -> create new .otio
     OR append to explicit documentUri + expectedRevision
  -> Cut Core command
```

不允许 active/recent Cut fallback。已有目标只支持末尾追加，不支持隐式覆盖、replace selection 或持续同步。profile-external cue/transition/effect 返回 diagnostic。本 change 不新增 Agent/TUI authoring contract。

### 8. Webview is selectively reduced to one basic editing surface

Inspector 显示 Project、Track、Video Clip、Audio Clip、Subtitle Clip 和 Gap 上下文；Clip 基础编辑包含名称、时间线起点、源起点、播放时长、常量速度以及可用的音量/静音/淡入淡出与分离关系，不展示专业能力目录。Preview 只展示无装饰边框的黑色视频画布，不把当前文件名或源路径覆盖在画面上。播放控制条只保留开头、上一 project frame、播放/暂停、下一 project frame、结尾、时间码、全局静音/音量和全屏。时间线工具条保留添加 Audio/Subtitle Track、向指定轨道链接音视频/字幕、split、删除、undo/redo、zoom、fit-all 和 media export。Timeline 上下文菜单复用这些 typed intents，并按选中对象显示 split、删除、静音、分离/取消分离和轨道媒体链接。时间线支持在兼容轨道中按时间落点拖拽 Clip：空白落点绝对放置，覆盖落点按前后半区插入；仍以清晰 diagnostic 拒绝超过 `1+3+1` 上限或跨 kind 放置。

旧 NKV Minimap 的 `ProjectData` projection、store-coupled interaction hook、writable state、message 和专属媒体生成路径垂直删除；但保留 `TimelineMinimap` 组件入口并替换其数据适配。它现在只消费 revisioned `TimelineView`、当前 playhead 与真实时间线 viewport，按 Track kind 绘制具有可辨认高度和间距的结构条与 viewport；点击或拖动只更新水平滚动，不发送 command、不持久化项目事实，也不请求第二份缩略图/波形。

不整包删除现有 Webview。`packages/webview` 的 package/build、root/app shell、Host adapter，以及职责与新基础界面一致且不拥有持久 timeline 的 UI/media primitive 可以保留并在 gate 后改接 `TimelineView`。专业面板、旧 NKV Minimap、旧 writable project store/snapshot、旧 operation/message 和只服务这些路径的测试必须删除；不得因为保留应用壳或新增只读 Overview 而保留旧项目事实。

基础界面继续使用原有边界：`PreviewPanel`、`PreviewControls`、`PropertyPanel`、`Timeline`、`TimelineControls`、`TimelineMinimap`、`TimelineRuler`、`TimelineTrack`、`TimelineElementContent` 与 `Playhead`。`App` 只组合 document-scoped Presentation Store、消息 adapter、Preview controller 和布局壳；展示组件可通过窄 props 或 Store selector 消费同一个 revisioned `TimelineView` 与临时状态，通过 typed action 提交 intent。组件不得导入 writable project Store、工作区 IO 或媒体 runtime implementation。

旧版基础组件与 hook 必须按 `legacy-webview-capability-audit.md` 先审计后适配，不得用新的最小壳替代成熟行为。可复用的是组件边界、Zustand selector/action 交互模式、pointer/keyboard/context-menu 生命周期、共享 property input、同步 `DataTransfer` 提取与 drop 串行队列、导出配置/进度展示；必须替换的是旧 Store 中的 NKV `ProjectData`、本地项目 mutation/history/save、旧 message、Webview 媒体 IO 和专业 feature branch。

复用以现有组件边界为默认 canonical path：`PreviewPanel`、`PreviewControls`、`Timeline`/`TimelineTrack`、`PropertyPanel`、`ExportPanel`/`ExportConfigView`/`ExportProgressView` 以及对应 hooks 应在原位置收窄 props 并适配 `TimelineView + typed intent`。不得在 `App.tsx` 或新的 `Basic*` 组件中并行重建同一职责。只有旧实现与 NKV writable Store、专业能力或 Webview IO 不可分割时，才可抽取纯展示/交互部分；此时必须记录无法直接复用的依赖证据，并删除被替代的平行入口。

迁移顺序也是约束：先将 Git 基线中的 Cut Webview `components/`、`hooks/`、i18n 和样式一次性恢复，保留其 DOM/可访问性、pointer/keyboard/focus 生命周期与测试。随后把 Zustand 收敛为按 Webview 实例创建的 Presentation Store，并在组件树外建立唯一 `TimelineView + typed intent` adapter/controller；它直接安装只读 OTIO 投影、临时交互 action 和 Host intent，不得恢复 writable NKV project store。待基础组件重新编译且行为测试通过后，再垂直删除专业 section 及其专属 handler/locale/style。用新的简化 JSX 替换旧组件内容，即使沿用同一文件名，也视为平行重写。

i18n、主题、错误、日志、Dialog、ContextMenu、property inputs、Workbench Shell、resize、键盘和拖拽生命周期等基础能力必须复用现有公共入口和 Cut 已有 runtime。Cut Webview 不得创建 package-local i18n/theme/error/logger/runtime shell；Extension 不得绕过共享 Logger、ErrorHandler 与状态栏生命周期。`CreativeWorkbenchShell`、共享 icon/tag/menu primitive、`ResizeHandle`、`useResizable`/`usePersistedResize`、keyboard dispatcher 和旧 Timeline pointer/drop hook 是 canonical path，Cut 只能提供领域 props、状态投影和 OTIO intent adapter。删除专业功能允许删除其专属文案和组件，但不能连带删除仍被基础剪辑路径依赖的基础设施或测试语义。

用户可见错误不得把 `Error.message` 当作 Extension/Webview 契约。Cut Domain 定义稳定、可穷举的 user diagnostic code；Extension 将已知领域/session/media 错误映射成结构化 diagnostic，未知内部错误通过共享 `ErrorHandler` 记录原始原因后只投影本地化的操作失败类别。Webview 按当前 locale 把 code 翻译为文案，并把 Host、Preview、AudioContext、Export 和本地交互错误统一送入现有 `ToastProvider`。Preview 上方不得再渲染独立 error/notice banner，export task snapshot 和原生状态栏也不得显示未本地化的原始异常字符串。未知 code 或旧 `message: string` 协议属于 contract mismatch，必须 fail-visible，不能回退显示英文原文。

此前已完成的 Workbench 布局与 resize primitives 属于 `retain-shared-primitive`，不是专业项目模型。Cut 继续复用 `CreativeWorkbenchShell`、共享 `ResizeHandle`、`useResizable`/`usePersistedResize`，但 Inspector 不再占据跨越 Timeline 的全高 `rightDock`：上方工作区由 Preview（左）与 Inspector（右）组成，下方 Timeline 横跨完整宽度。Preview/Timeline 默认各占 50%，垂直比例限制在 20%–80%；Inspector 默认宽度 280px，限制在响应式 220–420px，并由左侧 pointer resize handle 调整。Preview 舞台必须占满其剩余空间并保持项目 profile 画幅，transport 固定在舞台下方；Inspector 可折叠并通过 VS Code Webview state 保存，重新展开时恢复折叠前的持久宽度，唯一显隐按钮位于 Preview controls 最右侧，折叠时不渲染独立 reveal rail 或第二个 Timeline 入口。尺寸、折叠、Overview 可见性与拖拽 preview 都是可丢弃展示状态，不进入 OTIO、Host session 或 command contract。

右侧只保留一个上下文 Inspector，不恢复 basic/professional selector。Project、Video Clip、Audio Clip、Subtitle Clip 与 Gap 使用现有 `@neko/ui` property composition/primitives 展示各自拥有的字段；可编辑字段只调用已有 typed command，未有 command 的字段保持只读，不能通过 Webview 本地 mutation 模拟成功。

Inspector 采用一个纵向连续、可滚动的属性面，不增加 Tab、分段导航或每类属性的互斥视图。Clip 按“基本信息 / 时间与裁剪 / 速度 / 音频”分组，并按媒体 kind 省略不适用组；Project 按“画布 / 时间线摘要”分组；Track 按“基本信息 / 轨道状态”分组；Gap 按“位置 / 时间范围”分组。组标题和边界只增强扫描性，不成为新的选择状态。底部上下文操作继续调用现有 controller action，面板不拥有新的 draft store、持久折叠状态或专业属性 schema。

项目画布宽高属于 OTIO timeline profile，而不是 Preview 或 Export 面板状态。Project Inspector 把 TV `1920×1080`、电影 `2048×858`、短视频 `1080×1920`、方形 `1080×1080` 映射为一个 `set-project-canvas` typed command；Core 只持久化明确 profile name/width/height，并保留当前 edit rate。Preview 使用两层 `contain`：解码帧先按源宽高居中绘制到黑色项目 Canvas，项目 Canvas 再依靠浏览器 replaced-element `object-fit: contain` 适配可调整的 Preview 容器。这样 Inspector 展开、上下分栏 resize、全屏和竖屏 profile 都不会裁掉项目画面，也不会拉伸源视频。后台导出继续直接读取同一 `TimelineView.profile.width/height`，不得另存一套临时分辨率。

时间线的基础定位不是仅按数组 index 重排。标尺点击/播放头拖拽产生 timeline time；Clip 主体拖放计算目标 Track 与 frame-quantized 时间落点并通过 revisioned `place-clip` command 持久化。Timeline toolbar 复用现有 icon-only `ToolbarButton` 提供一个 document-scoped、可恢复但不持久化到 OTIO 的顺序/定位模式按钮；它以图标、激活态和本地化 tooltip 表达当前状态，不再渲染两项文字 `SegmentedControl`。初次接收含 Gap 的投影时展示定位模式，避免把尚未压实的文档伪装成顺序结构。用户显式进入顺序模式时，Webview 先通过一个 revisioned `trim-trailing-gaps` typed command 删除所有 Track 的尾部 Gap；该命令不得删除内部 Gap 或移动 Clip，避免破坏 Audio/Subtitle 的显式同步起点。顺序模式后续先压实被修改 Track 的全部 Gap，再把落点收敛到最近 Clip boundary；覆盖 Clip 时按前后半选择稳定 anchor。定位模式保留精确 frame 落点和由 Gap 表达的空白。文件选择器与 Explorer/系统文件拖入最终都进入同一个 `prepareMedia -> link-media` Host 路径，不存在第二套 import path；`link-media` 必须携带 `timelineStartFrames` 与 `overlapPolicy`，缺少字段立即拒绝，不能回退为 append。外部 drop 使用 pointer 所在 Track/time；picker 使用当前播放头和所选兼容 Track，无选择时按媒体 kind 选择固定 Video Track 或第一个兼容 Track。多文件保持输入顺序，后一项从前一项实际插入结束点继续。

Clip 拖拽恢复已验证的 pointer interaction 质量，但不恢复旧 Zustand mutation：pointer capture、cancel/lost-capture/blur cleanup、兼容 Track 高亮、时间落点预览、吸附指示与靠近边缘时的水平自动滚动都属于 Webview 临时状态。顺序模式释放时提交一次 `place-clip(trackId/insertionTimelineStartFrames, sourcePolicy=ripple, overlapPolicy=insert)`；定位模式提交一次 `place-clip(trackId/pointerTimelineStartFrames, sourcePolicy=preserve-gap, overlapPolicy=reject)`；取消、失焦或不兼容目标不提交 command。顺序 OTIO Track 通过 Clip/Gap 次序表达时间位置，不把像素坐标或自由 `startTime` 引入第二套 timeline 模型。

视频缩略图和音频波形是可丢弃的派生表示：Webview 按当前 revision 与可见 Clip 发出有界请求，Extension 解析 `.otio` 相对引用并通过媒体 adapter 调用 Neko Engine frame capture/waveform，Webview 只绘制返回的 data URL/peak samples。结果只进入 Webview 内存 cache，不得生成假波形、直接读取工作区媒体或把派生数据持久化进 OTIO。Host revision 更新时，controller 只把 source identity/range/sampling input 未变化的表示迁移到新 revision；变化或消失 Clip 的结果必须失效。每个 Clip 的失败独立返回 unavailable diagnostic，过期 revision 结果必须丢弃，派生失败不能阻断 OTIO 编辑。

所有 Clip 使用 OTIO `enabled` 表达是否参与 preview/export；所有 Track 也使用 OTIO `enabled` 表达整轨参与状态。Video Clip 的 `enabled=false` 会同时禁用画面和内嵌音频，而 `openneko.audio.muted=true` 只禁用内嵌音频，两者不得合并。正常 Clip 的缩略图必须保持完整不透明度，只有 disabled Clip/Track 才使用弱化视觉；muted 状态通过本地化 icon/tag 表达，不能把所有缩略图统一渲染成类似隐藏状态。

Clip 与 Track 的锁定是 OpenNeko 编辑约束，不伪装成 OTIO 媒体语义：最小 `openneko.cut.locked` metadata 持久化锁定状态。Core 必须拒绝对 locked Clip 或 locked Track 的移动、裁剪、删除、媒体链接和属性修改，只允许显式解锁以及不改变内容的 enabled/visibility 切换。复制内容保存在 document-scoped Zustand presentation clipboard；粘贴通过 revisioned typed Host intent 分配新 Track/Clip identity 并提交唯一 OTIO command，不恢复 Webview 项目副本。

Clip 与 Track 的复制保留旧版相对时间、兼容 Track kind 和批量语义，但 clipboard 只保存稳定 locator 与可恢复展示 payload。paste/duplicate 由 Host 在当前 revision 重新解析目标、验证空间和 `1 Video + 3 Audio + 1 Subtitle` 上限并分配所有新 Clip/Track/link identity。paste 使用 Core `clone-clip-at-time` 直接在最终绝对时间创建副本；禁止先紧邻源 Clip 插入再移动，因为中间 Track 长度变化会推动后续 Clip、污染相对时间并产生伪 overlap。linked Video/Audio 必须在同一 command 中获得 reciprocal identity 与各自最终时间。复制可选 Track 时同时复制其内容；固定 Video Track 不允许复制成第二轨。cut 只有在 copy payload 建立后才提交原子删除，跨文档 paste 在当前 change 中 fail-visible。

基础 Clip 编辑采用 project-frame 量化。ruler/playhead seek、时间落点、trim 预览和最终 command 共享 snapping policy：先量化到 frame，再在屏幕阈值内吸附到播放头与同 Track Clip/Gap 边界。首尾 trim handle 必须显示明确的左右边界和可交互状态；裁短后可在 `available_range` 内从对应边缘重新拉长。时间线画布 extent 由 Webview 通过 Track/item identity 与顺序结构签名管理：签名未变且只有 duration/source range/speed 改变时保留旧范围，签名因删除、移动、重排或 Gap 结构变化而改变时收缩到当前投影 duration。该 extent 只属于展示状态，不能写回 OTIO、参与播放终点或被渲染成真实 Gap；真实 Gap 必须从 `TimelineView` item 派生并具有明确视觉。首尾 trim 与 Inspector 时长输入通过 typed command 持久化；Webview 只保留 pointer gesture 的临时 preview，Host/Core 继续验证正时长、媒体可用范围、速度和 revision。

轨道头不再展示 `V1 / Video 1 / A1 / Audio 1` 等重复标签，改用共享媒体类型图标识别 Video、Audio、Subtitle，并以 localized icon buttons 暴露显示/隐藏、锁定/解锁、音频静音/恢复和删除可选 Track。固定 Video Track 的删除按钮保持禁用；名称仍作为无障碍 label、tooltip、Inspector 与上下文菜单语义存在。媒体添加不在每个轨道头重复放置“+”，而由 Timeline controls 的单一入口以当前选中 Track 为目标；其中新增 Audio/Subtitle Track 的按钮复用与轨道头一致的共享媒体类型图标，只通过 localized title/accessible name 表达“新增”动作，不再渲染 `+A` / `+S` 可见文本。Track 菜单保留目标明确的添加媒体操作。

可逆 trim 必须区分源媒体可用范围、当前 source range、头部 trim 与尾部 trim。Timeline projection 同时给出 available range 的 start/duration；Inspector 分别显示并编辑 start trim 与 end trim。修改时长只调整尾端，不得隐式吞掉头部 trim；左、右 handle 分别恢复对应端，只要没有越过 `available_range` 就允许把此前缩短的范围重新拉长。

基础编辑继续保留多选、框选、批量移动、Track rename/reorder/mute/lock/hide/delete、Timeline copy/cut/paste/duplicate/select-all、播放头自动跟随、zoom/fit/Overview 和 Clip/Track/Gap/空白区右键菜单。Clip 菜单只使用 Clip 语义与 Clip commands，Track 菜单只使用 Track 语义与 Track commands；不得因复用翻译键把“锁定轨道”等 Track 文案混入 Clip 菜单。选择、clipboard、scroll、gesture preview 属于 document-scoped Zustand presentation state；Track/Clip durable state 与编辑结果属于 Host/Core。工具条、快捷键、菜单和 Inspector 不得各自实现 mutation，它们只调用同一 controller action。

AI 快速调用只恢复为统一 Agent 上下文移交，不恢复旧 `executeAIAction` handler、NKV Timeline tools、自动剪辑 stub 或隐式 active editor。Cut Host 在当前 revision 解析选择并构造共享 `AgentContextPayload(type='cut-clip')`，payload 携带显式 `documentUri`、`sessionId`、`revision`、稳定 `trackId/clipId`、时间范围和只读媒体摘要，再调用统一 `neko.agent.sendContext`。这不是 Agent Cut authoring contract；任何后续 Agent 写入仍需独立 capability、显式 target、expected revision 和审批。实现该 handoff 时必须通过聚焦 Agent Evaluation 证明统一 context path 被命中，且旧 handler/fallback 未参与。

VS Code 状态栏继续使用共享 `StatusBarGroup`，并分成互不覆盖的两类 Host projection：后台 export job 状态以 `jobId/documentUri` 为 owner；当前 Cut 文档状态以 `documentUri/sessionId` 为 owner，显示播放状态、时间码/FPS、Track/Clip 数量及 dirty/diagnostic 摘要。active custom editor 只选择显示哪个已存在的文档投影，不能成为状态 owner；隐藏或销毁一个 Webview 不得清空其他文档或后台导出任务。状态文字和 tooltip 使用 Extension i18n，点击命令必须携带精确 document identity。

Preview 不是一次性选中媒体流。Host 对每次 timeline-time intent 返回当前活动的可选 Video input、全部 Audio inputs、下一次任意输入集合变化的 `segmentEndSeconds`，以及当前 revision 最后一个启用 Video/Audio Clip 的 `playbackEndSeconds`。没有 Video 但存在 Audio 时启动 audio-only preview 并保持 Preview 黑屏；没有任何输入但 `playbackEndSeconds` 之前仍存在未来媒体边界时启动无流时钟段并保持黑屏。尾部 Gap 不代表真实媒体输入，不得让 transport 在所有启用的 Video/Audio Clip 播完后继续空跑；用于保持编辑视口宽度的 presentation extent 也不得参与播放终点。源起点按 `sourceStart + localTimelineOffset * playbackRate` 换算，当前 adapter 对视频和 PCM 使用相同常量速度。

连续播放使用唯一的 `prepare -> activate -> retire` session 生命周期。Webview 在当前段边界前的有界 lead window 内，以同一 document/session/revision 和下一边界时间请求一个 next generation；Host 最多同时拥有一个 active generation 和一个 prepared generation。prepared generation 必须完成路径解析、probe、Engine stream/decoder 创建、seek 和 speed 配置，但媒体 stream 保持 paused，不推进内容时间；控制侧只返回可连接的 stream descriptors。到达准确边界时，Webview 激活 prepared generation 并切换客户端，Host 恢复新 Engine streams 后退休旧 active generation。prepared 尚未 ready 时 transport 停在边界，ready 后继续，不能让播放头越界空跑或重新进入边界后才开始的串行创建路径。

初始播放与边界预备复用同一个 session builder，不保留先 resume 再让 Webview 连接的另一套实现。Host 先发布 paused generation descriptor；Webview 完成对应 Video/Audio 客户端连接后发送 activate，Host resume 并确认 activation 后 transport 才建立该 segment 的时钟起点。一个 Webview preview session 必须拥有并跨 generation 复用同一个由用户播放手势启动的 `AudioContext`；generation client 可以替换，但不得在自动边界回调中关闭后新建 `AudioContext`，否则 Web Audio autoplay policy 会让下一代连接永久等待。可用时 transport 以首选 Audio PTS 或已呈现 Video frame PTS 校正 timeline time；墙钟只允许驱动没有活动媒体但尚有未来输入的内部 Gap，不得从 descriptor 到达或客户端连接开始时提前推进。进入边界切换等待态后旧 segment 不再拥有播放头，缺失或早于新 source start 的 PTS 只能保持当前边界，不能把播放头回写到旧段起点。seek、pause、stop、document mutation、revision/session 替换和 Webview dispose 必须递增 generation、取消在途 prepare，并释放 active/prepared 全部 Video/PCM session；Webview dispose 还必须关闭 session-owned `AudioContext`。每个 Webview 最多两个 generation，不能无限预取或用缓存掩盖 Engine 生命周期。陈旧 prepare/ready/activate 由 identity 和单调 generation fail-closed；只有播放头已到 `playbackEndSeconds` 才正常停止并显式释放 Host session，而不显示缺少 Video 的错误。

### 9. Replacement remains vertical and fail-visible

新路径测试 poison NKV/NKC codec、Webview project snapshot save、active/recent target、旧 ingest/copy 和隐藏 fallback。只有 Host CutDocumentSession、受控外部媒体复制、OTIO command、`.otio`-relative link 和选定媒体 adapter 被断言命中时才算成功。

旧 NKV/NKC 文件不迁移、不覆盖。被移除 UI、store、operation、message、Extension handler、i18n、CSS 和测试必须垂直删除。

实施顺序是硬约束：目标 contract 只先在 OpenSpec/ADR 中冻结；随后第一批从现有 Cut Webview 垂直删除废弃功能切片及其专属测试、fixture、messages 和 styles，同时保留审计通过的应用壳、Host adapter 与基础 primitive；再删除其余旧生产路径及成功测试，并通过 `cleanup-audit.md` 的 source/dependency/manifest/unused/legacy/user-data gate。该 gate 未标记 `passed` 前，不得创建 OTIO codec、document session 或把保留 Webview 接入替代模型。清理阶段不能用保留壳、placeholder、fallback 或 no-op 让旧请求继续成功。

## Migration Plan

1. 只在 OpenSpec/ADR 中冻结目标 subset、ownership、`.otio`-relative path、manual-mute separation 和 media-port contract；完成 deletion inventory。
2. 先从现有 Cut Webview 垂直删除废弃功能和对应测试，保留经审计的基础壳与 primitive；再删除 NKV/NKC、Extension reconstruction、旧 ingest/copy、implicit target 及其他旧路径和成功测试。
3. 运行清理 source/dependency/manifest/legacy/unused/user-data 检查，并将 `cleanup-audit.md` gate 标记为 `passed`。
4. gate 通过后实现 `OtioDocument`、typed commands、revision、undo/redo、serialization、`TimelineView` 和 Host document session。
5. 实现 `prepareMedia -> .otio-relative link` 与 workspace-relative runtime projection、注册 `.otio` Custom Editor，再把保留的基础 Webview 改接新投影。
6. 在新 OTIO path 上重新接入同源 separation、Video Clip 静音和当前 selected media adapter。
7. 迁移 VS Code Canvas 到显式 `.otio` target。
8. 运行 OTIO/路径/多文档和 VS Code Development Host 最终验证。

## Risks / Trade-offs

- 只移动 `.otio` 文件可能破坏 document-relative 引用；受控 Save As 会重写，外部复制需要整体搬移素材树或显式 relink。
- OTIO 未统一相对路径基准；第三方工具若不以文档目录解析，仍需设置工作目录或 relink。
- 分离后若 Video Clip 与 Audio Clip 都未静音会重复混音；这是用户可见且可控的基础语义，不做隐式修正。
- linked audio 仍可能随 Video Clip 发生现行 move/trim/delete 联动；完全独立编辑延期。
- workspace 内普通链接仍不产生自包含项目；跨 workspace 复制可能需要 relink。只有显式导入的外部媒体会被复制到 `.otio` 同目录的 `media/`。
- 当前 VS Code 媒体 adapter 仍依赖 Neko Engine，但新的公共 contract 不依赖它，后续可单独替换。
