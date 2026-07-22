# ADR: Cut OTIO 工程与 VS Code 媒体运行时边界

状态：Accepted（目标架构，尚未实施）
日期：2026-07-22
范围：`neko-cut`、`neko-canvas`、`neko-agent`、`apps/neko-vscode`、`@neko/neko-client`、`neko-engine`、OTIO 工程、逻辑音频分离、预览与导出。

本文定义 Cut 在 VS Code 中收敛为 OTIO-only 轻量剪辑器的目标。Desktop Cut、Desktop media adapter、WebCodecs 和 Desktop FFmpeg 不在本文范围，后续不得从本 ADR 推断其实现路径。

本文补充 [`package-boundaries.md`](package-boundaries.md) 和 [`webview-media-security.md`](webview-media-security.md)，并取代 [`adr-canvas-cut-playback-route-and-timeline-boundary.md`](adr-canvas-cut-playback-route-and-timeline-boundary.md) 中 Cut `.nkv`、专业多轨、隐式活动目标和持续同步设计。Canvas 路线权威与“单次快照交接”原则继续有效。

在替换任务完成前，NKV、现有 Cut Webview、Extension timeline conversion 和 Rust Engine timeline 仍是代码事实；目标架构不得被描述为已迁移行为。

## 背景

当前 Cut 在 NKV/NKC、Webview store、Extension DTO 与 Rust timeline 之间重复维护工程语义，并包含超出基础剪辑目标的多轨、效果和专业模式。

当前“分离音频”已经采用较简单的实现：创建一个 `type: audio` 的 timeline element，但其 `src` 仍等于原视频 `src`；Engine audio decoder 在预览和导出时直接读取视频容器音频，并没有生成 WAV 文件。真正需要调整的是导入行为和工程契约：导入视频不能自动创建 Audio Clip，只有用户显式操作后才逻辑分离。

因此本 ADR 选择：

1. OTIO 是唯一 Cut 工程事实。
2. Cut Core 统一编辑命令、媒体角色、时间映射和执行计划。
3. VS Code 复用当前 Neko Engine 媒体路径，不新增视频音轨转 WAV 能力。
4. 不支持的工程、媒体和命令直接返回 diagnostic，不回退旧实现。

## 五层分析

| 层 | 决策 |
| --- | --- |
| 职责 | Cut Core 拥有 OTIO、命令、媒体角色和计划；Extension/Engine adapter 负责授权与媒体执行。 |
| 依赖 | Webview 只依赖 browser-safe contract；VS Code、Node、Engine 和工作区 IO 留在 Extension。 |
| 接口 | Probe、视频预览、PCM、导出使用窄 port；不新增 audio extraction/transcode port。 |
| 扩展 | 本 ADR 不定义 Desktop；后续宿主需要独立 OpenSpec/ADR。 |
| 测试 | OTIO/media fixture、path assertion 与真实 Extension Development Host 共同证明 canonical path。 |

## 决策

### 1. Cut v1 只保留基础操作

支持：

- 一个顺序、不可叠层的 Video Track；
- 零到多个 Audio Track；
- `Clip`、`Gap` 与 ExternalReference；
- create/import/link、split、trim、reorder、ripple delete、relink；
- clip/track enable、gain、mute、线性 fade；
- undo/redo、probe、preview、逻辑音频分离和 MP4 export。

不支持第二视觉轨、overlay/PIP、transition、nested/compound、字幕/标题、效果、调色、mask、keyframe、变速、倒放、插件、开放 DSP、多声道编辑、补帧或 basic/professional 切换。

删除能力必须垂直覆盖 UI、store、operation、undo、message、Extension handler、adapter、Agent schema、i18n、CSS 和测试。

### 2. `.otio` 是唯一持久工程与 timeline 权威

```text
project.otio
  -> OtioDocument（唯一可变事实）
      -> typed command
      -> TimelineView
      -> CutPreviewPlan
      -> CutExportPlan
```

三种投影均从显式 document revision 派生且不序列化。selection、playhead、zoom、缓存、Engine session 和 token 是运行时状态。

新 Cut 只创建和打开 `.otio`。不双读/双写 NKC/NKV，不在 OTIO 失败后 fallback。旧文件保持字节不变并返回 unsupported diagnostic。

### 3. Cut v1 冻结精确 OTIO 子集

只接受：

- `Timeline.1`、`Stack.1`、`Track.1`；
- `Clip.2`、`Gap.1`、`ExternalReference.1`；
- `RationalTime.1`、`TimeRange.1`。

顶层 Stack 包含且只包含一个 `Track(kind=Video)` 与零到多个 `Track(kind=Audio)`。Track 只含 Clip/Gap，Clip 只含一个 active ExternalReference。

nested Stack、Transition、Effect、LinearTimeWarp、Marker、第二 Video Track、多个 active reference 或未知 schema version 必须在 mutation 前返回 object/path diagnostic。

允许的 metadata：

```text
timeline.metadata.openneko.cut =
  profile | editRateNumerator | editRateDenominator | width | height

audio track metadata.openneko.audio = gainDb

audio clip metadata.openneko.audio =
  gainDb | fadeInSeconds | fadeOutSeconds | sourceVideoClipId
```

`sourceVideoClipId` 只表示来源/provenance，用于防重复、UI 状态和 undo，不触发自动同步。标准 `enabled` 表达 enable/mute。未知 OpenNeko 字段直接拒绝。

### 4. 时间与画布规则在 Core 中统一

项目拥有固定正有理 edit rate，默认 `30/1`。不同受支持 CFR 源可以共存，导入不能隐式改变非空项目 rate。

每个 project/output sample timestamp 选择 mapped source time 上 `PTS <= target` 的最新有效源帧；clip 起点早于首帧时才使用范围内首帧。由此低 fps 重复帧、高 fps 丢帧，不生成中间帧。

项目 width/height 定义预览与导出画布。v1 不提供 crop/transform；视频居中等比 `contain`，未覆盖区域为不透明黑色。

### 5. Preview/Export plan 显式区分媒体角色

`CutPreviewPlan` 与 `CutExportPlan` 至少包含：

- document URI、identity、revision；
- project edit rate、画布、有效 timeline range；
- segment 的 `role: video | audio`、source identity/revision、timeline/source range、enabled；
- audio gain/fade；
- export fps、codec/container、audio presence 与验证期望。

Video Track Clip 永远只产生 video segment，即使 MP4 含音频。Audio Track Clip 永远只产生 audio segment，即使其 ExternalReference 指向 MP4。Engine 不得根据容器内容自行把 Video Clip 音频加入预览或导出。

Extension 不再从项目 DTO 自行重建 Engine timeline；Cut Core 是唯一 plan compiler。

### 6. “分离音频”是显式 timeline 操作，不是媒体派生任务

导入 MP4 只创建 Video Clip。Webview 当前 `addMediaElementWithAudio` 中导入后异步探测并自动创建 Audio element 的路径必须删除。

用户点击“分离音频”时：

1. 重新 probe 当前 source revision；
2. 要求恰好一个受支持 AAC 音频流；
3. 创建与 Video Clip 引用同一 MP4 ExternalReference 的 Audio Clip；
4. 复制发起时的 timeline/source range；
5. 写入 provenance-only `sourceVideoClipId`；
6. 用一个 Cut Core command 原子更新 OTIO，并记录 undo。

底层不调用 `audios:transcode`，不创建 WAV、staging 或 `derived/audio/`，也不修改源 MP4。因而该能力在产品文案中可称“分离音频”，但架构、日志和诊断必须称为逻辑分离，不得报告不存在的 WAV 产物。

零音频流、多个音频流、不支持 codec、source/document revision stale 或已经逻辑分离时，操作失败且 OTIO/媒体文件不变。

### 7. Audio Clip 与 Video Clip 后续独立编辑

两个 Clip 共享文件引用但不共享编辑状态。Audio Clip 的 trim、move、delete、gain、mute、fade 和 undo 独立执行；移动、裁剪或删除 Video Clip 不自动修改 Audio Clip。

删除来源 Video Clip 后，Audio Clip 仍凭自身 ExternalReference/source range 播放。provenance identity 失效只影响来源展示，不影响媒体执行。

gain 采用 `10^(gainDb/20)`，clip 与 track gain 相乘；fade 只属于 clip并使用线性振幅。Engine 按 plan 应用自动化、float32 求和，输出边界限制到 `[-1, 1]`。

### 8. VS Code 直接复用当前 Neko Engine 媒体能力

每个 Cut Editor 创建 editor-scoped `VSCodeMediaAdapter`：

- `MediaProbePort`；
- `VideoPreviewPort`；
- `AudioPcmStreamPort`；
- `ExportJobPort`。

Engine audio decoder 已支持从视频容器寻找音频流；`neko-pcm-v1`/`AudioStreamClient` 继续承担 PCM。实现重点是把 role-explicit plan 转为现有 Engine timeline/stream/export 请求，而不是增加 FFmpeg 转码接口。

Engine 不拥有 OTIO、编辑命令或可见产品能力。初始化、probe、preview、PCM、export 失败直接返回 diagnostic，不回退 Node、HTML media、NKV 或旧 timeline。

### 9. VS Code 使用一个 probe-backed Media Profile

`MediaDescriptor` 必须包含 container、stream counts/indexes、codec/profile、pixel format、bit depth/chroma、field order、color/HDR、duration、CFR/rate/timestamps、audio sample rate/channels 和 encryption。required evidence 缺失等价于 unknown。

| 角色 | Cut v1 限制 |
| --- | --- |
| Video Clip | MP4；单 H.264/AVC video；8-bit yuv420p SDR progressive CFR；最高 1920×1080；内嵌音频对 video role 无效 |
| 可逻辑分离音频 | 恰好一个 AAC-LC 44.1/48 kHz mono/stereo stream |
| 独立导入 Audio Clip | WAV PCM 44.1/48 kHz mono/stereo |
| Engine→Webview PCM | f32le 48 kHz stereo |

多个音频流不影响 Video Clip 的 video-only 导入，但“分离音频”返回 ambiguous-stream diagnostic，不静默选择第一流。

VFR、HDR、10-bit、4:2:2/4:4:4、interlaced、多视频 stream、多声道/对象音频、DRM、损坏时间戳和未知 duration 拒绝。v1 不提供通用格式转换。

### 10. 项目根可配置且不存在派生音频目录

允许 workspace-relative `cut.defaultProjectRoot`：

```text
<workspace>/<configured-root>/<project-name>/
  project.otio
  media/
  exports/
```

配置必须在规范化和 symlink/realpath 解析后仍位于 workspace。ExternalReference 只保存相对 `.otio` 的 URI，不保存绝对路径、file/Webview/localhost/blob URL 或 token。

逻辑分离复用同一个 MP4 URI；不创建 `derived/audio/`，不引入第二个媒体路径事实。

### 11. Canvas 与 Cut 独立，只接受显式目标

```text
Canvas route
  -> ordered media/gap draft
  -> create new .otio
     OR append to explicit documentUri + expectedRevision
  -> Cut Core command
```

不允许 active/recent Cut fallback。已有目标只支持末尾追加，不支持隐式覆盖、replace selection 或持续同步。profile-external cue/transition/effect 返回 diagnostic。Agent 使用相同 target/approval/revision contract。

### 12. 导出按角色决定是否存在音轨

输出为 MP4/H.264/AAC-LC/SDR/yuv420p，最高 1080p。没有 enabled Audio Clip 时输出无音轨 MP4；Video Clip 的内嵌 AAC 永远不自动 mux。

存在 MP4-backed Audio Clip 时，Engine 按 audio role 从同一容器解码音频并参与 mix/export。Export 冻结 plan、revision、source set 与 output profile，写 staging 后由 Extension 验证 codec、pixel format、fps、frame count、duration、尺寸和预期 audio presence，再原子提交。

### 13. 新路径必须 fail-visible

测试先 poison NKV/NKC、旧 timeline handler、active editor、导入自动建 Audio Clip、`audios:transcode` 和 profile-external operation。只有 OTIO、role-explicit plan、Engine adapter 和新 handler 被断言命中时才算成功。

旧 NKV/NKC 文件不迁移、不覆盖。被移除能力必须从 UI 到 Engine adapter/Agent contract 垂直删除。

### 14. Inspector 与控制条简化保留，Minimap 删除

右侧面板保留为单一上下文 Inspector，不再显示“基础/专业”切换或灰色占位目录：

| 选择 | 显示内容 |
| --- | --- |
| Video Clip | 来源/分辨率/源 fps、时间与 trim、内嵌音频状态和逻辑分离操作 |
| Audio Clip | 来源/provenance、时间与 trim、gain/mute/fade |
| Gap | start 与 duration |
| 无选择 | 项目 width/height、edit rate、duration 摘要或空状态 |

transform、text、speed、入场/出场、color、effect 和 mask 整组删除，不保留 disabled row。

播放控制条只保留开头、上一 project frame、播放/暂停、下一 project frame、结尾、时间码、静音/音量和全屏。时间线工具条只保留导入、split、删除、undo/redo、zoom、fit-all 和导出；copy/paste 优先使用 command/快捷键，不重复占用按钮。文本、字幕、特效、专业工具箱、多视图/布局和含义不明的按钮删除。

Minimap 不属于 v1。其组件、viewport projection、交互、store、message、i18n、style 和测试垂直删除。水平滚动、zoom、fit-all 与播放时 playhead 跟随构成唯一时间线导航路径，不保留隐藏开关、灰色入口或 fallback。

## 迁移顺序

1. 冻结 OTIO、metadata、role-explicit plan、MediaDescriptor、path 与 fixtures。
2. 实现 `OtioDocument`、commands、三种投影和 `.otio` Custom Editor。
3. 收敛 Inspector/控制条并删除 Minimap 与 deferred UI surface。
4. 删除导入自动创建 Audio Clip，接入显式逻辑分离命令。
5. 将 VS Code Engine 收敛为 probe/video/PCM/export adapter。
6. 用 role-explicit plan 替换 Extension timeline conversion。
7. 验证 MP4-backed Audio Clip PCM、mix 和 video-only/audio-present 两类导出。
8. 迁移 Canvas/Agent 到显式 `.otio` target。
9. 删除 legacy/deferred 路径并运行完整质量门禁。

## 验证要求

- OTIO：精确 schema/metadata、parse/serialize、commands、undo/redo、save/reopen、relative reference 和 legacy bytes unchanged。
- 逻辑音频：导入无 Audio Clip、显式命令、同源 MP4 reference、无 WAV/transcode、多个流拒绝、后续独立编辑。
- 媒体角色：Video Track 永不带音频；Audio Track 的 MP4/WAV source 可输出 PCM；video-only/audio-present export 均验证。
- 时间/画布：source PTS、mixed CFR、hold/drop/repeat、contain/black canvas 和无 interpolation。
- 运行态：真实 Extension Development Host 中验证 seek、EOF、取消、释放、多 editor/session 隔离和 no-fallback。
- Webview：验证四种 Inspector 上下文、最小控制条、project-frame step、zoom/fit/scroll/playhead 跟随，并证明 Minimap 组件、状态和入口不存在。
- Agent：显式 `.otio` target/revision、Canvas route 与 logical separation；key-free harness 不替代真实行为证据。

## 后果与权衡

正面结果是无需新增音频转码/派生任务即可满足基础交互；不产生额外磁盘占用；当前 Engine 解码能力得到复用；OTIO 与媒体角色保持清晰。

代价是 Audio Clip 可能显示 `.mp4` 来源；源文件移动会同时影响音视频；多个内嵌音频流暂不能分离；必须证明 Engine 旧 timeline 路径不会根据 Video Clip 容器自动带入音频。

## 被拒绝的替代方案

- **点击分离时生成 WAV：** 当前功能不需要，增加 job、staging、磁盘、取消、清理和路径生命周期。
- **导入视频时自动创建 Audio Clip：** 不符合显式用户操作，也让 timeline 在异步 probe 后发生意外变化。
- **让 Video Clip 直接播放内嵌音频：** 音轨不可见，无法独立 gain/mute/fade，导出语义不清。
- **多个音频流默认选第一流：** 选择不可见且重开后可能不稳定；v1 应明确拒绝。
- **继续以 NKV 为工程、OTIO 只交换：** 保留重复 schema 与迁移成本。
- **在本 change 同时设计 Desktop：** 扩大范围并把尚未验证的宿主实现固化为目标。

## 后续决策

- 多内嵌音频流选择 UI 与稳定 stream identity 属于后续 change。
- VS Code Remote/SSH/WSL 支持只能由真实宿主验收后声明。
- Desktop Cut 媒体路径由未来独立 ADR/OpenSpec 决定。
