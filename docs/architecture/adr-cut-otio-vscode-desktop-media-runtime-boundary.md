# ADR: Cut OTIO 工程、VS Code 精简与 Desktop 媒体迁移边界

状态：Accepted（目标架构，尚未实施）
日期：2026-07-22
范围：`neko-cut`、`apps/neko-vscode`、拟议中的 `apps/neko-desktop`、`@neko/host`、`@neko/neko-client`、`neko-engine`、OTIO 工程、媒体文件访问、PCM 预览和 FFmpeg 导出。

本文记录 Cut 从 NKV/NKC 和宽功能面收敛为 OTIO 轻量剪辑器的目标架构，并定义 VS Code 与 Desktop 仅在媒体运行时 adapter 上分化的过渡边界。它补充 [`package-boundaries.md`](package-boundaries.md)、[`webview-media-security.md`](webview-media-security.md) 和 [`adr-neko-desktop-composition-and-open-source-reference-boundary.md`](adr-neko-desktop-composition-and-open-source-reference-boundary.md)。

本文取代以下尚未实施或已不再成立的目标：

- [`adr-canvas-cut-playback-route-and-timeline-boundary.md`](adr-canvas-cut-playback-route-and-timeline-boundary.md) 中 Cut 使用 `.nkv`、多层专业时间线和 basic/professional 双模式的部分；Canvas 播放路线、Canvas 权威和 Canvas → Cut 快照边界继续有效。
- `openspec/changes/redefine-openneko-lightweight-editing/` 原先的“NKV 是唯一可写项目事实”“OTIO 仅用于交换”“`neko-engine` 是所有宿主长期媒体权威”“最多三层视觉合成”目标；该活跃变更已按本 ADR 原位重写，后续实施只允许使用重写后的 proposal、design、spec 和 tasks。
- Desktop 组合 ADR 中任何要求 Desktop Cut 必须复用 Rust Engine 的描述；其他 Desktop composition、Agent、项目壳和 host adapter 边界不受影响。

在本 ADR 的替换任务完成前，现有 NKV、Engine 和 Cut Webview 仍是代码实际行为；实现不得把“目标已接受”误报为“迁移已完成”。

## 背景

现有 Cut 同时承担自定义项目格式、复杂多轨编辑、Rust timeline、GPU/FFmpeg runtime、WebSocket 预览和导出。该结构能够覆盖较宽的编辑能力，但也造成以下问题：

1. NKV/NKC、TypeScript store、Proto timeline 与 Rust model 之间存在重复语义和迁移成本。
2. VS Code Webview、Extension Host 与 Engine 的生命周期放大了大文件、codec、音频和运行态调试复杂度。
3. 拟议中的 Desktop 如果继续复刻整套 Engine，会把产品迁移变成第二套宿主和第二套媒体后端的长期耦合。
4. Cut 的实际目标是轻量顺序剪辑和音频混合，不需要专业 NLE 的多层合成、关键帧、调色、插件和通用 effect graph。
5. OTIO 已经能够表达基础 editorial timeline；继续发明新的 Cut 持久格式没有足够收益。

同时，VS Code 现有 Neko Engine 已经提供可工作的媒体 probe、seek、PCM 和导出路径。立即同时替换 VS Code 与 Desktop 会扩大首轮风险。因此目标架构允许两个宿主在明确的 adapter 边界上采用不同实现，但工程事实、编辑命令、UI 和格式限制必须保持唯一。

## 五层分析

| 层 | 决策 |
| --- | --- |
| 职责 | Cut Core 拥有 OTIO 文档、编辑命令和能力验证；宿主 adapter 只拥有文件授权、媒体预览和导出执行。 |
| 依赖 | Webview 依赖 Cut Core/browser contract，不依赖 VS Code API、Node、Engine DTO 或 Electron；宿主实现依赖公共小接口。 |
| 接口 | 文件、probe、预览、PCM 和导出分别使用小接口；不以一个宽泛 MediaService 重新聚合全部职责。 |
| 扩展 | VS Code 与 Desktop 是两个显式 composition root；新增宿主只能实现相同 contract，不能增加第二种项目事实。 |
| 测试 | 同一 OTIO fixture 和媒体 profile 必须在两个宿主验证编辑结果、时长、seek、A/V 同步和导出边界。 |

## 决策

### 1. Cut 只有一个轻量产品面

Cut 第一阶段只支持：

- 一个顺序排列、不可叠层的 Video Track；
- 零到多个 Audio Track，按浮点加法混音；
- `Clip`、`Gap`、外部媒体引用和固定正向倍速；
- import/link、split、trim、reorder、ripple delete、track enable/mute；
- clip/track gain、fade in/out 和基础混音；
- undo/redo、relink、probe、preview 和 MP4 export。

第一阶段不支持：

- 第二条视觉轨、overlay、PIP、标题轨或字幕轨；
- transition、nested timeline、compound clip、多机位；
- mask、blend mode、关键帧、速度曲线、倒放；
- LUT、专业调色、通用 effect、shader 或插件；
- 任意 DSP graph、5.1/7.1、对象音频或声道矩阵编辑；
- basic/professional 模式切换。

删除能力必须垂直删除 UI、store、operation、undo、message、Extension handler、Engine adapter、i18n、CSS 和测试入口。不得只隐藏按钮，也不得让旧命令继续返回成功。

### 2. `.otio` 是唯一 Cut 持久工程格式

Cut 不再创建或写入 `.nkv`，也不把 Cut timeline 嵌入 `.nkc`。`.nkc` 继续属于 Canvas/Board 等既有领域，不因本 ADR 被删除。

运行时采用以下单一事实链：

```text
project.otio
  -> OtioDocument（内存权威）
  -> TimelineView（只读派生投影）
  -> React / Zustand 展示状态
```

所有编辑命令修改 `OtioDocument`，然后重新投影 `TimelineView`。`TimelineView`、selection、playhead、zoom、hover、panel layout 和解码缓存不得序列化为第二套项目格式。

Cut v1 只接受以下 OTIO 对象：

- `Timeline`、顶层 `Stack`；
- 一个 `Track(kind=Video)`；
- 零到多个 `Track(kind=Audio)`；
- `Clip`、`Gap`、`ExternalReference`；
- `RationalTime`、`TimeRange`；
- 可选 `LinearTimeWarp`，且仅允许有界正向常速。

不接受 nested `Stack`、`Transition`、未知 schema、未知 required effect、第二条 Video Track 或其他 profile-external 对象。打开时必须返回 object/path-level diagnostic，源文件字节保持不变。

媒体路径使用相对 `.otio` 文件的 URI；不得持久化 Webview URI、localhost URL、Engine token、blob URL 或绝对用户路径。

### 3. OTIO metadata 只补充最小运行语义

OpenNeko 不新增自定义 OTIO schema。允许的 namespaced metadata 仅限：

```text
timeline.metadata.openneko.cut.profile = "cut-v1"
audio clip/track metadata.openneko.audio =
  sourceStreamIndex | gainDb | fadeInSeconds | fadeOutSeconds
```

这些字段不能复制 clip 顺序、时间范围、媒体路径或轨道结构。缺少 metadata 时使用明确的标准值；未知 `openneko` required capability 必须拒绝，不能忽略后继续保存。

OTIO 的标准 editorial core 可以与其他工具交换；应用专属音频 metadata 可能被其他工具保留但忽略。FCPXML adapter 只映射能够明确表达的字段，并对丢失语义给出 diagnostic。

### 4. 不建设 NKC/NKV 运行时迁移路径

本项目处于预发布阶段，本次采用破坏性收敛：

- 新 Cut Editor 只创建和打开 `.otio`；
- 不做 NKC/NKV 与 OTIO 双读或双写；
- 不在 OTIO 失败后 fallback 到旧 store/codec；
- 旧 NKC/NKV 文件不删除、不覆盖，打开时返回明确的 unsupported diagnostic；
- 如果以后证明存在有价值的真实用户时间线，只能新增独立、一次性的离线转换工具；转换器不得进入正常打开、保存或 autosave 路径。

### 5. Cut Core 与 UI 跨宿主共享

目标组合如下：

```text
Cut Core + React UI
  |-- VSCodeMediaAdapter
  |     `-- Neko Engine（过渡期）
  `-- DesktopMediaAdapter
        |-- Host bounded file access
        |-- WebCodecs + Canvas/WebGPU
        |-- Host FFmpeg PCM
        `-- Host FFmpeg export
```

公共边界按职责拆分为等价的小接口：

- `MediaProbePort`：返回受限、可验证的媒体描述；
- `VideoPreviewPort`：创建、seek、暂停和释放视频预览 session；
- `AudioPcmStreamPort`：创建、seek、暂停和释放 PCM session；
- `ExportJobPort`：提交、观察、取消和获取终态 export job；
- `AuthorizedMediaSourcePort`：注册、撤销和读取宿主授权资源。

这些接口不拥有 OTIO 文档，也不通过 active editor 单例隐式选择实例。所有 operation、event 和 descriptor 必须携带 document/session/job identity。

### 6. VS Code 先保留 Neko Engine，但冻结其职责

VS Code Cut 在过渡期继续使用 Neko Engine 完成现有 probe、视频预览、PCM 和导出，以降低同时替换 Extension/Webview/Engine 的风险。

Engine 在该路径中仅是 `VSCodeMediaAdapter`：

- 不再拥有项目或 timeline 持久格式；
- 不再定义 Cut 编辑命令和可见能力；
- 只消费从受限 OTIO runtime projection 产生的播放/导出请求；
- 不新增 transition、effect、color、layer、DSP 或项目迁移能力；
- 即使 Engine 支持更多 codec 或轨道结构，也必须按 Cut v1 profile 拒绝；
- Engine 失败不得隐式切换到 Desktop/Node 媒体实现。

现有 `AudioStreamClient` 的 `neko-pcm-v1` 帧结构和 WebAudio 调度可以保留。Engine 的最终删除属于后续独立 ADR/OpenSpec；本 ADR 不授权在迁移完成前删除 VS Code 可工作的媒体路径。

### 7. Desktop 不依赖 Neko Engine

拟议中的 Desktop Cut 使用 Electron Host 和浏览器媒体能力：

```text
Video:
authorized file -> bounded source -> MP4 demux -> WebCodecs -> Canvas/WebGPU

Audio:
authorized file -> FFmpeg -> f32le/48 kHz/stereo -> binary WebSocket -> WebAudio

Export:
frozen OTIO snapshot -> typed export plan -> bundled FFmpeg -> validated atomic output
```

Desktop 的“native preview”指 Chromium WebCodecs/WebAudio 和宿主文件/进程能力，不引入新的平台专属 AVFoundation、Media Foundation 或 GStreamer binding。

MP4 demux 可以使用 Mediabunny 或 MP4Box，但最终只能有一个 canonical demux path。选型必须通过同一真实素材 fixture、seek、timestamp、memory 和 cancellation spike 后冻结。

FFmpeg/FFprobe 使用应用打包并校验的固定版本；系统 FFmpeg 只允许作为显式开发覆盖，不能成为发布依赖。

### 8. 媒体数据不走 IPC

Extension/Electron bridge 只传控制面：授权、descriptor、play、pause、seek、job、progress、cancel 和 diagnostic。媒体二进制不得编码为 Base64 或通过普通 `postMessage` 大块传递。

| 数据 | 通道 |
| --- | --- |
| 视频输入字节 | localhost HTTP Range、Electron custom protocol 或等价 bounded source |
| PCM | localhost binary WebSocket 或等价有背压二进制通道 |
| 工程/命令/状态 | 类型化 host bridge / IPC |
| 导出文件 | Host 分配的临时输出和原子提交 |

文件服务复用现有 PDF/CBZ/EPUB Node transport 已验证的 token、loopback、HEAD/CORS/PNA、stream、撤销和 dispose 机制，但公共内核不能属于 Preview 包。EPUB entry、文档 MIME 和 viewer 行为继续留在文档领域。

媒体 Range 必须使用闭区间 `bytes=start-end`，单次默认上限 1–4 MiB。开放区间、多范围、越界、过期 token 和 owner mismatch 必须拒绝。`<video src>` 不属于 Cut 编辑器播放路径。

### 9. 两个宿主使用同一个 Cut v1 Media Profile

格式能力由产品 profile 决定，不由 Engine、WebCodecs 或 FFmpeg 的最大能力决定。

直接编辑白名单：

| 类别 | Cut v1 限制 |
| --- | --- |
| 容器 | MP4 |
| 视频 | H.264/AVC、8-bit、YUV 4:2:0、SDR、逐行 |
| 分辨率 | 最大 1920 x 1080 |
| 帧率 | CFR；24/25/30/50/60 及对应常见 NTSC rate |
| 内嵌音频 | AAC-LC、44.1/48 kHz、mono/stereo |
| 独立音频 | WAV PCM、44.1/48 kHz、mono/stereo |
| 前端 PCM | f32le、48 kHz、stereo |

VFR、HDR、10-bit、4:2:2/4:4:4、interlaced、多视频 stream、多声道、DRM、损坏时间戳和未知 duration 明确拒绝。

Desktop 可以提供“转换导入”，用 FFmpeg 把 MOV/MKV/WebM/MP3/FLAC 等转换为项目 `media/` 下符合 profile 的 MP4/WAV；转换后的文件成为 OTIO 正式引用和导出来源。第一阶段不建设 proxy/original relink 或高质量原片回套。VS Code 在未接入同一转换 job 前只显示 actionable diagnostic，不建立第二套转换器。

### 10. 第一阶段导出只有一个媒体 profile

媒体导出只支持 MP4/H.264/AAC-LC、SDR、yuv420p、最高 1080p；工程保存只支持 OTIO。FCPXML 和 SRT/VTT 属于独立交换 adapter，不能改变 Cut 内部 timeline profile。

Export 必须冻结 OTIO document URI、revision、snapshot、授权输入和输出 profile。写入 Host 分配的临时文件，验证 codec、duration、size 和音频后再原子提交；取消或失败不得覆盖已有目标。

## 唯一实现路径约束

- 每个宿主在 composition root 显式选择一个媒体 adapter；不存在运行时自动 fallback。
- VS Code 与 Desktop 可以有不同媒体实现，但不能有不同 OTIO parser、编辑命令、UI store 或格式 profile。
- OTIO adapter、validator 和 command 是唯一时间线解释；Engine、WebCodecs 和 FFmpeg adapter 不得各自解释完整项目。
- Desktop 建成后不能复制一套 `desktop-cut` 组件树；公共 React UI 留在 Cut owning package，宿主只提供 adapter 和 shell。
- 未知 schema、能力、codec、message、session、revision 或 resource descriptor 必须 fail-visible。

## 迁移计划

1. 按已重写的 `redefine-openneko-lightweight-editing` OpenSpec 冻结 OTIO subset、Cut v1 media profile、小端口、legacy poison 和跨宿主验收 fixture。
2. 在 host-neutral Cut Core 中实现 OTIO codec/validator、`OtioDocument` command、只读 `TimelineView` 和保存/备份 contract。
3. 在现有 VS Code Cut 中保留外围 UI，重写时间线区域，并将 Engine 收敛为 `VSCodeMediaAdapter`。
4. Poison 并删除 NKC/NKV Cut、professional mode、多视觉轨和被移除能力的全链路；旧文件只读拒绝并保持字节不变。
5. 从 Preview 文档 transport 提取最小 Node resource server kernel，保留文档 profile 在 Preview，新增 Desktop bounded media profile。
6. 建立 Desktop composition root 和 `DesktopMediaAdapter`，接入 bounded source、WebCodecs、Host FFmpeg PCM 和 FFmpeg export。
7. 用相同 OTIO/media fixtures 验证两个宿主；Desktop 稳定后另行决策 VS Code 是否替换 Neko Engine。

任何阶段都不得通过双写 NKC/NKV/OTIO、Engine/Node 自动 fallback 或旧 handler 成功响应维持进度。

## 验证要求

### 共同 contract

- OTIO parse/serialize、unknown schema、unsupported object/path diagnostic；
- split/trim/reorder/ripple/gap、undo/redo、save/reopen；
- 单 Video Track、多 Audio Track 和 profile limit；
- project-relative media reference、relink 和 source revision；
- legacy NKC/NKV bytes unchanged、legacy path poison；
- VS Code 与 Desktop 对同一编辑序列生成字节等价或语义等价 OTIO。

### 媒体运行时

- 指定 MP4/H.264/AAC、WAV 和拒绝格式 fixtures；
- metadata、seek、scrub、EOF、pause/resume、取消和资源释放；
- PCM PTS、sample rate、channel、seek generation 和 A/V drift；
- Range 只读目标闭区间，拒绝开放区间和越界；
- 多文档/多 session identity 隔离；
- 导出 codec、duration、音频存在、取消、原子提交和无部分成功。

### 运行态

- VS Code 使用 Extension Development Host 与真实 Webview；
- Desktop 使用打包后的 Electron runtime，不用普通浏览器替代；
- FFmpeg 二进制版本、许可清单和平台产物可追溯；
- 未执行平台、Remote/SSH/WSL 和 codec 场景必须记录为剩余风险。

## 后果与权衡

### 正面

- Cut 不再维护自定义 timeline 项目格式和迁移器；
- VS Code 可以先稳定收缩，Desktop 可以独立移除 Engine；
- UI、编辑命令、OTIO 和格式 profile 不分叉；
- 大文件、PCM 和导出均有明确的 Host 数据边界；
- 严格格式白名单显著降低两个媒体 backend 的行为差异。

### 代价

- 过渡期仍需测试 VS Code Engine 与 Desktop WebCodecs/FFmpeg 两个 adapter；
- OTIO application metadata 的音频参数不能保证其他工具执行；
- Desktop 转换导入会占用时间和磁盘，并在第一阶段放弃原片回套；
- 旧 NKC/NKV Cut 项目不能直接打开；
- Remote VS Code、系统 codec 和平台硬件差异仍需单独验证。

## 被拒绝的替代方案

- **继续以 NKV 为唯一工程、OTIO 只做交换：** 保留自定义 schema、迁移和多层解释成本。
- **VS Code 与 Desktop 各自维护项目模型和 UI：** 形成永久双产品和双事实源。
- **立即在 VS Code 删除 Engine：** 同时替换 UI、文件通道、音频、播放和导出，首轮风险过大。
- **Desktop 继续复用整个 Neko Engine：** 无法实现 Desktop 媒体路径和发行闭包的实质简化。
- **直接把 localhost URL 交给 `<video>`：** Range 机械可用但浏览器会发起不可控的开放区间和跨文件扫描。
- **通过 IPC/postMessage 传媒体和 PCM：** 放大复制、内存、背压和消息生命周期问题。
- **宣称 FFmpeg/WebCodecs 支持的格式都属于产品支持：** 导致宿主能力不一致和无法收敛的测试矩阵。

## 后续决策

以下问题不阻塞本 ADR，但必须在对应实现 OpenSpec 中冻结：

- Desktop MP4 demux 选择 Mediabunny 还是 MP4Box；
- 每次 Range 的最终大小、并发数和缓存预算；
- FFmpeg 平台构建、许可配置和更新策略；
- Desktop PCM 是复用当前 `AudioStreamClient` 调度，还是迁移到 AudioWorklet ring buffer；
- VS Code 最终移除 Neko Engine 的时间点与验收门槛。
