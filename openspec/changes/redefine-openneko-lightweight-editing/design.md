## Context

当前 Cut 仍以 NKV、Webview timeline store、Extension-owned timeline conversion 和 Rust Engine timeline 为代码事实。现有 Webview 的“分离音频”会创建一个 `type: audio` 的 element，但 `src` 仍等于原视频 `src`；Engine 的 audio decoder 已支持从视频容器读取音频。因此“分离”是 timeline 逻辑分离，而不是 FFmpeg 生成 WAV。

本设计只处理 VS Code。目标是用 OTIO 和共享执行计划替换重复工程模型，同时复用当前 Engine 直接读取 MP4 音频流的能力。相关稳定决策见 [`ADR: Cut OTIO 工程与 VS Code 媒体运行时边界`](../../../docs/architecture/adr-cut-otio-vscode-media-runtime-boundary.md)。

## Goals / Non-Goals

**Goals:**

- 用一个受限、版本化的 OTIO profile 取代 Cut 自定义项目格式和可变 timeline store。
- 提供创建、导入、split、trim、reorder、ripple delete、Gap、基础音频 gain/mute/fade、预览和 MP4 导出。
- 导入视频只创建 Video Clip；用户显式操作后才创建引用同一 MP4 的 Audio Clip。
- 复用 Neko Engine 当前从视频容器解码音频、输出 PCM 和参与导出的能力，不生成 WAV 派生文件。
- 允许受支持的不同 CFR 源共存，并用 project edit rate 与源 PTS 获得确定性预览/导出。
- 保持 Canvas 与 Cut 独立，只允许显式 `.otio` 目标的快照交接。

**Non-Goals:**

- Desktop composition root、Desktop media adapter、WebCodecs 或 Desktop FFmpeg。
- 视频音轨转 WAV、`AudioExtractionJobPort`、`derived/audio/` 或音频派生产物生命周期。
- 自动播放、混合或导出尚未逻辑分离的 MP4 内嵌音频。
- 多音频流选择 UI；v1 只允许逻辑分离唯一受支持的内嵌音频流。
- 音视频 sync lock、自动联动编辑或跨轨联动 undo。
- 专业 NLE、多视觉层、transition、nested timeline、字幕 authoring、调色、效果、关键帧、变速、插件或开放 DSP graph。
- 自动抽帧转换、光流补帧、高清增强、通用格式转换、proxy/original relink 或 NKC/NKV 在线迁移。

## Five-layer analysis

| Layer | Decision |
| --- | --- |
| Responsibility | Cut Core 拥有 OTIO、编辑命令、媒体角色、时间映射和计划；Extension/Engine adapter 只执行授权媒体请求。 |
| Dependency | Webview 依赖 browser-safe Cut contract；VS Code、Node、Engine 和工作区 IO 留在 Extension/composition root。 |
| Interface | Probe、video preview、PCM 和 export 使用窄 port；不新增 audio extraction/transcode port。 |
| Extension | 后续宿主需要单独 OpenSpec；不能从本次 VS Code 设计推断 Desktop 技术路径。 |
| Testing | OTIO/media fixture、路径断言和真实 Extension Development Host 共同证明新路径及 no-fallback。 |

## Decisions

### 1. OTIO document is the only mutable timeline authority

```text
project.otio
  -> OtioDocument
      -> typed edit command
      -> TimelineView
      -> CutPreviewPlan
      -> CutExportPlan
  -> React presentation state
```

`OtioDocument` 是唯一可变 timeline state。三种投影均从显式 document revision 派生且不序列化。selection、playhead、zoom、hover、panel layout、waveform/thumbnail cache、Engine session 和授权 token 都是可恢复运行时状态。

### 2. Cut v1 freezes an exact OTIO subset

只接受：

- `Timeline.1`、`Stack.1`、`Track.1`；
- `Clip.2`、`Gap.1`、`ExternalReference.1`；
- `RationalTime.1`、`TimeRange.1`。

Timeline 顶层 Stack 包含且只包含一个 `Track(kind=Video)` 与零到多个 `Track(kind=Audio)`。Track 只含 Clip/Gap；Clip 只含一个 active ExternalReference。

nested Stack、Transition、Effect、LinearTimeWarp、Marker、第二条 Video Track、多个 active media reference 或未知 schema version 在 mutation 前返回 object/path-level diagnostic。

### 3. Metadata stays minimal and distinguishes provenance from coupling

允许的 OpenNeko metadata：

```text
timeline.metadata.openneko.cut =
  profile | editRateNumerator | editRateDenominator | width | height

audio track metadata.openneko.audio = gainDb

audio clip metadata.openneko.audio =
  gainDb | fadeInSeconds | fadeOutSeconds | sourceVideoClipId
```

`sourceVideoClipId` 只证明该 Audio Clip 由哪次显式操作产生，用于防止重复分离、展示状态和 undo；它不建立同步关系。后续 move/trim/delete 任一 Clip 都不自动修改另一 Clip。

标准 OTIO `enabled` 表达 clip/track enable 和 mute。第三方 metadata 仅在安全可序列化且不声明 OpenNeko required capability 时保留；未知 `openneko` 字段直接拒绝。

### 4. Project timing and presentation are deterministic

每个项目拥有固定正有理 edit rate；新项目默认 `30/1`。空项目首次导入时可以显式采用受支持源 rate，项目含 clip 后不隐式改变。

不同 CFR 源可以共存。对每个 project/output sample timestamp，选择 mapped source time 上 `PTS <= target` 的最新有效源帧；只有 clip 起点早于首帧时才使用范围内首帧。低 fps 因此重复显示，高 fps 跳过多余帧，不生成中间帧。

项目 width/height 定义画布。v1 不提供 crop/transform；所有视频帧居中等比 `contain`，未覆盖区域为不透明黑色。Preview 与 export 使用同一 presentation rule。

### 5. Cut Core compiles role-explicit execution plans

`CutPreviewPlan` 与 `CutExportPlan` 包含：

- document URI、identity、revision；
- project edit rate、画布和有效 timeline range；
- 每个 segment 的 `role: video | audio`、source identity/revision、timeline range、source range 和 enabled；
- audio gain/fade 的规范化值；
- export output fps、container/codec、audio presence 和验证期望。

Cut Core 是唯一 plan compiler。Video Track Clip 无论其 MP4 是否含音频，都只编译为 `role: video`；Audio Track Clip 即使引用 MP4，也只编译为 `role: audio`。这种角色隔离确保导入视频保持静音，只有显式创建 Audio Clip 后音频才进入 PCM 与导出。

Extension 不再从项目 DTO 自行重建 Engine timeline。Engine adapter 只把冻结 plan 转换成其受限请求，不读取 OTIO 项目文件。

### 6. “Separate audio” creates a logical Audio Clip, not a WAV

导入符合 profile 的 MP4 只创建 Video Clip。Probe 可报告 `hasAudio`，但不自动创建 Audio Track/Clip；当前 `addMediaElementWithAudio` 中的异步自动创建路径必须删除。

用户点击“分离音频”时：

1. 对 source revision 重新 probe；
2. 要求恰好一个符合 profile 的音频流；
3. 以同一 MP4 ExternalReference 创建 Audio Clip；
4. 复制发起时 Video Clip 的 timeline/source range；
5. 写入 provenance-only `sourceVideoClipId`；
6. 通过一个 Cut Core command 原子修改 OTIO，并记录 undo。

该操作没有后台媒体任务，不调用 `audios:transcode`，不创建临时文件或 WAV，也不改写源 MP4。UI 文案仍可使用用户熟悉的“分离音频”，但状态和文档必须说明它是逻辑分离。

重复操作、缺少音频、多个音频流、unsupported codec、source revision stale 或同一 Video Clip 已有来源 Audio Clip 时，命令失败且 OTIO 不变。

### 7. Audio Clips are independently editable but reuse one source

逻辑分离后的 Audio Clip 与 Video Clip 共享 ExternalReference URI，不共享可变编辑状态。Audio Clip 的 trim、move、delete、gain、mute、fade 和 undo 独立执行。

音频 gain 使用 `10^(gainDb/20)`，clip 与 track gain 相乘；fade 只属于 clip并使用线性振幅。Engine 按 plan 解码、应用自动化、float32 求和，并在输出边界限制到 `[-1, 1]`。

用户删除来源 Video Clip 时不自动删除 Audio Clip；项目保存后重新打开时，Audio Clip 仍可仅凭自身 ExternalReference 和 source range 解码。来源 identity 失效只影响 provenance UI，不影响 Audio Clip 播放。

### 8. VS Code reuses the current Engine media path

每个 Cut Editor 创建 editor-scoped `VSCodeMediaAdapter`，实现：

- `MediaProbePort`；
- `VideoPreviewPort`；
- `AudioPcmStreamPort`；
- `ExportJobPort`。

现有 Engine audio decoder 能从 video/audio source 找到音频流，timeline stream 能创建 paired video/audio output，当前 ExportService 也允许 Audio element 与 Media element 共享 `src`。新路径保留这种底层能力，但由 role-explicit plan 决定哪些 segment进入 video 或 audio，不能由容器是否含音频自动决定。

`AudioStreamClient` 和 `neko-pcm-v1` 继续消费 Engine PCM。Engine 初始化、probe、preview、PCM 或 export 失败直接返回 diagnostic，不回退 Node、HTML media、旧 timeline 或 NKV handler。

### 9. One probe-backed VS Code media profile

Host-neutral `MediaDescriptor` 必须提供 container、stream count/index、codec/profile、pixel format、bit depth/chroma、field order、color/HDR、duration、CFR/rate/timestamp mode、audio codec/sample rate/channels 和 encryption。缺失 required evidence 等价 profile unknown。

Cut v1：

- Video Clip：MP4、单 H.264/AVC video stream、8-bit yuv420p SDR progressive CFR、最高 1920×1080；
- Video role 忽略全部内嵌音频；仅当容器恰好有一个 AAC-LC 44.1/48 kHz mono/stereo stream 时提供逻辑分离；
- 独立导入的 Audio Clip：WAV PCM 44.1/48 kHz mono/stereo；
- Engine→Webview PCM：f32le、48 kHz、stereo。

多个音频流不阻止 video-only 导入，但暂不提供“选择音轨”UI，因此逻辑分离失败并返回 diagnostic；不得静默选择第一个。VFR、HDR、10-bit、4:2:2/4:4:4、interlaced、多视频 stream、多声道、DRM、损坏时间戳和未知 duration 拒绝对应的可编辑媒体角色。

### 10. Project root and references stay portable

VS Code 设置提供 workspace-relative `cut.defaultProjectRoot`：

```text
<workspace>/<configured-root>/<project-name>/
  project.otio
  media/
  exports/
```

配置规范化后必须仍在 workspace 内。ExternalReference 保存相对 `.otio` 的 URI，不保存绝对路径、file/Webview/localhost/blob URL、Engine token 或临时输出。逻辑分离复用同一个相对 MP4 URI，因此不增加媒体文件或路径事实。

### 11. Canvas and Cut remain independent

```text
Canvas route
  -> ordered media/gap draft
  -> create new .otio
     OR append to explicit documentUri + expectedRevision
  -> Cut Core command
```

不允许 active/recent Cut fallback。已有目标只支持末尾追加，不支持隐式覆盖、replace selection 或持续同步。profile-external cue/transition/effect 返回 diagnostic。Agent capability 使用相同 target、approval 和 revision contract。

### 12. Export is typed, role-aware and atomic

输出为 MP4/H.264/AAC-LC/SDR/yuv420p，最高 1080p。没有 enabled Audio Track Clip 时输出无音轨 MP4；Video Track Clip 的内嵌音频不会被自动 mux。存在逻辑分离 Audio Clip 时，Engine 从它引用的 MP4 解码音频并参与 mix/export。

Export 冻结 `CutExportPlan`、document revision、source set 和 output profile。Engine 写 staging，Extension 验证 codec、pixel format、fps、frame count、duration、尺寸和预期 audio presence 后原子提交。调用方不能传 shell、任意 FFmpeg argv 或 filter graph。

### 13. Replacement is vertical and fail-visible

新测试先 poison NKV/NKC codec、旧 timeline handler、active-editor target、导入时自动建 Audio Clip 和 profile-external Engine operation。结果只有在 OTIO、role-explicit plan、selected Engine adapter 和新 handler 均被断言命中时才算成功。

旧 NKV/NKC 文件不迁移、不覆盖。被移除 UI、store、operation、undo、message、Extension handler、Agent schema、i18n、CSS 和测试必须垂直删除。

### 14. Webview keeps one contextual Inspector and two minimal control surfaces

右侧面板不删除，因为精确时间、来源信息和音频参数需要稳定入口；但它不再承担专业功能目录。删除“基础/专业”切换、灰色占位项和恢复已移除功能的入口，保留一个根据当前选择切换内容的 Inspector：

| 选择 | Inspector 内容 |
| --- | --- |
| Video Clip | 名称/来源、分辨率、源 fps/帧数、timeline start/duration、trim in/out、内嵌音频状态与“分离音频” |
| Audio Clip | 名称/来源、“来自视频”只读 provenance、timeline start/duration、trim in/out、gain/mute/fade in/out |
| Gap | timeline start 与 duration |
| 无选择 | 项目 width/height、edit rate、duration 的只读摘要；没有项目时显示空状态 |

Inspector 不显示 transform、text、speed、入场/出场效果、color、effect 或 mask；不以 disabled row 暗示功能可解锁。字段是否可编辑由 v1 command contract 决定，probe/source 字段保持只读。

播放控制条只保留：跳到开头、上一帧、播放/暂停、下一帧、跳到结尾、当前/总时间码、静音/音量和全屏。上一帧/下一帧按 project edit-rate frame step，不使用含义不明确的快退/快进语义。

时间线工具条只保留：导入视频/音频、split、删除、undo/redo、缩小/放大、适应全部内容和导出。copy/paste 如果保留为 command/快捷键，不重复显示工具条按钮；文本、字幕、特效、专业工具箱、多视图/布局模式和含义不明的图标必须删除。

Minimap 不进入 v1。删除其组件、viewport projection、拖动/缩放同步、store state、message、i18n、style 和测试。时间线导航由水平滚动、zoom、fit-all 和播放时 playhead 跟随组成；不得保留 hidden setting、灰色图标或 fallback 重新启用 Minimap。

## Risks / Trade-offs

- **Audio Clip 扩展名仍是 `.mp4`** → UI 以音频波形/图标和“来自视频”状态表达角色，不伪装为 WAV；导出/PCM 以 Track kind 与 plan role 判定。
- **多个内嵌音频流无法选择** → v1 fail-visible；后续单独增加 stream selector 与持久 stream identity。
- **共享源文件被移动会同时影响音视频** → 两个 Clip 各自报告同一 missing-media diagnostic，并通过显式 relink 修复。
- **provenance identity 可能失效** → 只影响“已分离”提示，不影响 Audio Clip 自身播放；不得用于同步编辑。
- **Engine 旧 timeline DTO 可能隐式播放 Video Clip 音频** → plan adapter 必须用 role-path assertions 和 video-only export fixture 证明该路径已关闭。
- **当前 probe descriptor 不足** → 先扩展证据字段，unknown evidence 直接拒绝。
- **移除 Minimap 后长时间线定位效率下降** → v1 以 zoom、fit-all、水平滚动和 playhead 跟随覆盖；只有真实可用性证据证明不足时再单独提案。
- **Remote/SSH/WSL 未验证** → 只有真实 Extension Development Host/remote fixture 通过后才能声明支持。

## Migration Plan

1. 冻结 OTIO schema/metadata、role-explicit plan、媒体 profile、path contract 和 fixtures。
2. 实现 `OtioDocument`、commands、`TimelineView`、`CutPreviewPlan`、`CutExportPlan` 与 `.otio` Custom Editor。
3. 将 Webview 收敛为单一上下文 Inspector、最小播放/时间线控制条，并垂直删除 Minimap 与 deferred UI surface。
4. 删除导入时自动探测并创建 Audio Clip 的路径；实现显式逻辑分离命令。
5. 扩展 `MediaDescriptor`，将 VS Code Engine 收敛为 probe/video/PCM/export adapter。
6. 以 role-explicit plan 替换 Extension timeline conversion，验证 Video Track 永不隐式带入音频。
7. 接入 Audio Track 同源 MP4 PCM、gain/fade/mix 与 video-only/audio-present 两类导出。
8. 迁移 Canvas/Agent 到显式 `.otio` target，删除旧 target/fallback。
9. 垂直删除 legacy/deferred surface，运行 Extension Development Host、Engine 集成、Agent evaluation 和仓库质量门禁。

## Open Questions

- 项目创建 UI 默认 `30/1` 还是同时提供 `30000/1001`，需要产品 fixture 冻结。
- VS Code Remote/SSH/WSL 是否支持当前 Engine timeline audio path，需要真实宿主验收。
- 多内嵌音频流选择属于后续 change；本次不得通过默认第一流隐藏该缺口。
