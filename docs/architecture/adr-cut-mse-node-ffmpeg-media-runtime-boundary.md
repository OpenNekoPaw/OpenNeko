# ADR: Cut MSE、Node/FFmpeg 与 PCM 媒体运行时边界

状态：Accepted（Cut 已实施）
日期：2026-07-26
范围：`neko-cut`、`apps/neko-vscode`、拟议中的 `apps/neko-desktop`、Extension/Electron Host、`@neko/media`、OTIO、媒体预览、代理、PCM、截帧、波形、字幕与导出。

本文定义单 Video Track、多 Audio Track、单 Subtitle Track 的轻量 Cut 媒体运行时。它补充 [`adr-cut-otio-vscode-media-runtime-boundary.md`](adr-cut-otio-vscode-media-runtime-boundary.md) 已实现的 OTIO 工程与可替换 media ports，并取代 [`adr-cut-otio-vscode-desktop-media-runtime-boundary.md`](adr-cut-otio-vscode-desktop-media-runtime-boundary.md) 中以下尚未实施的目标：

- Desktop 以 WebCodecs + Canvas/WebGPU 作为普通视频预览主路径；
- VS Code 长期保留 Neko Engine 作为 Cut probe、preview、PCM 和 export adapter；
- Cut v1 只接受 MP4/H.264/8-bit/SDR 和 mono/stereo 输入；
- Desktop 和 VS Code 采用不同媒体 runtime；
- 不建设 original/proxy 关系。

旧 ADR 的 OTIO 工程、轻量编辑边界、host-neutral ports、数据不走普通 IPC、显式 identity、fail-visible 和无双实现 fallback 约束继续有效。`replace-cut-engine-with-node-ffmpeg-runtime` 完成 Cut 迁移；随后 `retire-neko-engine-before-node-media-rebuild` 将 Preview、Canvas、Tools、Agent 与 Assets 一并切换到共享 `@neko/media`，并删除 Engine/client。

## 背景

Cut 已收敛到 OTIO、单视频轨、多音频轨和单字幕轨，不需要专业 NLE 的多层 GPU compositor。媒体运行时仍需同时满足：

1. 实时预览和随机 seek；
2. 10-bit、HDR10/HLG、HEVC、AV1 和 H.264；
3. 以 H.264 和 VP8 作为 VS Code 直接播放 codec，并把其他输入 remux 或转码为已接受的播放 profile；
4. AAC、MP3、Opus/Vorbis、FLAC、DTS/DTS-HD 等输入音频；
5. 按需读取、代理、截帧、缩略图、波形、字幕提取和导出；
6. VS Code Webview 的 CSP、URL safety、Range、取消和资源生命周期边界；
7. VS Code 与未来 Desktop 共享同一 OTIO、媒体策略和验收矩阵。

直接使用 `<video src="http://127.0.0.1:...">` 在当前 VS Code Webview 中会被 CSP 和媒体 URL safety check 拒绝；把整个大文件读成 Blob 虽可播放部分 MP4，但失去按需读取。WebCodecs 的硬件能力探测也不等价于 `<video>` 的实际解码能力：浏览器可以为 `<video>` 选择系统、软件或硬件路径，而应用不应维护平台硬件解码 binding。

## 五层分析

| 层   | 决策                                                                                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 职责 | Cut Core 解释 OTIO 并生成 typed playback/export plan；Host 授权文件、运行 FFprobe/FFmpeg、索引片段和管理缓存；Webview 只呈现 MSE segment、PCM 和字幕投影。 |
| 依赖 | Webview 不依赖 Node、VS Code API、FFmpeg DTO 或绝对路径；Node/FFmpeg 不解释完整 OTIO，也不成为第二个 timeline owner。                                      |
| 接口 | probe、授权媒体、视频片段、PCM、帧捕获、代理、波形、字幕和导出保持小接口，以 document/session/job identity 关联。                                          |
| 扩展 | 容器和 codec 通过 probe 后的策略矩阵扩展；硬件 encoder 只替换同一 FFmpeg operation 的执行策略，不增加第二条产品路径。                                      |
| 测试 | 同一真实 fixture 必须覆盖 probe、实际解码、Range 命中、随机 seek、PCM PTS、A/V drift、代理、取消、缓存失效和输出验证。                                     |

## 决策

### 1. OTIO 与 Cut Core 继续是唯一时间线权威

`.otio`、`OtioDocument`、typed command 和 `TimelineView` 的现有权威不变。媒体 runtime 只消费 Cut Core 产生的 typed plan：

```text
OTIO document + revision
  -> Cut Core source-time mapping
  -> VideoSegmentPlan / AudioMixPlan / SubtitleProjection / ExportPlan
  -> selected Host media adapter
```

FFmpeg、`<video>`、AudioContext 和 Neko Engine 都不得独立解释完整 OTIO、补写工程事实或根据 active editor 猜测目标。所有 request、event、segment、PCM generation、cache entry 和 job 必须携带显式 document/session identity。

### 2. `<video>` + MediaSource 是普通视频预览主路径

VS Code 和 Desktop 共享以下 canonical video path：

```text
authorized source
  -> FFprobe
  -> direct fragment / remux / proxy decision
  -> init segment + keyframe-aligned MSE media segment
  -> bounded Host segment endpoint
  -> Webview fetch
  -> MediaSource blob URL
  -> muted <video>
```

`<video>` 负责浏览器支持范围内的视频解码、色彩呈现和播放；Cut 不直接集成 VideoToolbox、Media Foundation、DXVA、VAAPI 或其他平台硬件 decoder。WebCodecs 不属于普通播放 canonical path，只允许在后续明确需要逐帧分析、帧级特效或非媒体元素渲染时通过独立 ADR/OpenSpec 引入。

`<video>` 必须静音。源视频中的音频和独立音轨统一进入 PCM path，避免浏览器音频 codec 差异和双音频时钟。

### 3. Host 使用 probe 驱动唯一媒体策略

`MediaProbe` 至少返回：

- container、stream index、duration、time base、start time 和 seekability；
- video codec、profile、level、pixel format、bit depth、chroma、resolution、frame rate、field order；
- color primaries、transfer、matrix、range、mastering display 和 content light metadata；
- audio codec、sample rate、sample format、channel count 和 channel layout；
- subtitle codec、language 和 disposition；
- timestamp、packet、NAL/OBU 和 duration 完整性 diagnostic；
- 当前 Host runtime 对 direct/remux/proxy 的判定理由。

策略顺序固定为：

```text
direct fragmented input
  -> lossless remux to accepted H.264/VP8 MSE container
  -> proxy transcode
  -> explicit unsupported diagnostic
```

不得为了“尽量播放”静默改变 bit depth、HDR/SDR、声道布局、分辨率或原片/代理关系。策略结果必须进入 session descriptor 和 diagnostic。

### 4. H.264 与 VP8 是直接播放 codec

Cut 只把 VS Code 声明支持且通过目标 runtime 真实 fixture 的 H.264、VP8 加入直接播放白名单：

| 优先级 | 播放 profile                                | 用途                                                               |
| ------ | ------------------------------------------- | ------------------------------------------------------------------ |
| 1      | MP4/fMP4 + H.264/AVC、8-bit、YUV 4:2:0、SDR | 默认直接播放、代理和媒体导出 profile。                             |
| 2      | WebM/MSE WebM + VP8、8-bit、YUV 4:2:0、SDR  | VP8 输入的直接播放 profile；必须先通过当前 Electron Webview 验收。 |

`canPlayType()`、`MediaSource.isTypeSupported()` 和 VS Code 文档只属于能力提示，不能代替真实 fixture 解码验收。当前 VS Code/Electron 验证中 H.264 fMP4 和 VP8 MSE WebM 均已通过；此前失败的是不属于 canonical path 的 VP8 progressive Blob。当前最低 VS Code 基线因此把 VP8 标记为 direct-capable。每个发行组合仍必须用已冻结 capability/fixture 结果选择以下唯一策略：

```text
H.264 + accepted MP4 profile
  -> direct MSE

VP8 + accepted WebM profile + runtime fixture passed
  -> direct MSE

H.264/VP8 + incompatible container
  -> lossless remux to the accepted container

other video codec, or VP8 runtime fixture failed
  -> explicit FFmpeg transcode plan
  -> H.264 MP4 proxy by default
```

该选择是 probe 后的显式 plan，不是播放失败后的隐藏 fallback。HEVC、AV1、ProRes、MPEG-4 Part 2、10-bit、HDR 和其他非白名单视频不得直接进入 `<video>`；即使某一台机器偶然能够解码，也必须先 remux 或转码为已接受的 H.264/VP8 播放 profile。

### 5. 按需读取以片段为单位，不暴露任意本地文件

Host media service 复用或提取现有 Node bounded resource server kernel，负责：

- loopback/custom protocol 绑定；
- owner/session token、授权文件和生命周期；
- CORS、PNA、CORP、HEAD、206、Content-Range 和明确 MIME；
- closed byte range、并发、片段大小、取消和背压；
- segment index、LRU/磁盘缓存、revision/fingerprint 失效；
- Remote/SSH/WSL 下由 Host 提供等价授权 transport。

Webview 只请求 manifest 已声明的 init/segment 资源或闭区间，不构造任意路径、开放区间或任意 localhost URL。媒体字节不得走 Base64、普通 `postMessage` 或无界整文件 Blob。

seek 固定从目标时间之前最近的可解码关键帧开始：

```text
timeline seek
  -> Cut Core source-time
  -> nearest indexed keyframe
  -> existing segment or on-demand remux/proxy job
  -> append to MediaSource
  -> seek muted <video>
```

原始 GOP 决定无损 remux 的最小读取粒度。长 GOP、高码率或损坏索引素材应生成约 1–2 秒 GOP 的编辑代理；不能通过只切容器宣称缩短了 GOP。

### 6. FFmpeg 是媒体适配和派生能力后端

Host 使用应用打包并校验的固定 FFmpeg/FFprobe 版本。系统 FFmpeg 只允许作为显式开发覆盖。FFmpeg 承担：

- probe 和完整性检查；
- demux、无损 remux、fMP4/WebM MSE segment 和 segment index；
- 不兼容 codec、长 GOP、高码率和可选分辨率代理；
- 精确截帧、缩略图和音频提取；
- PCM 解码、重采样、声道转换、多轨混音、gain 和 fade；
- 波形多层 min/max 或等价摘要；
- 字幕提取和格式规范化；
- 已接受 MP4 export profile 的媒体输出；
- 由独立 adapter 消费的工程交换媒体输出。

硬件 encoder 可作为通过启动 probe 和小样本自测后的性能策略；软件 encoder 是同一 operation 的可预测实现。硬件失败不得静默改用不同 codec、bit depth 或色彩 profile，切换必须产生可观察 diagnostic。

### 7. 音频统一为 PCM，OpenNeko 负责同步

活动视频内嵌音频和所有启用 Audio Track 由 Host FFmpeg filter graph 混合为：

```text
generation identity
+ pts
+ duration
+ sample rate
+ channel count/layout
+ interleaved f32le PCM
```

首个 profile 使用 48 kHz stereo `f32le`。多声道输入包括 AAC 5.1、DTS/DTS-HD 等先按显式 downmix policy 转换；未来多声道输出需要独立 profile，不得把 stereo PCM descriptor 冒充为环绕声。

OpenNeko Webview 复用或演进现有 `AudioStreamClient`，并由 document-scoped `PreviewClockController` 或等价单一 owner 负责 A/V 同步：

- AudioContext/getOutputTimestamp 提供音频时钟，OpenNeko 将它映射到 OTIO timeline time；
- OpenNeko 读取 `video.currentTime`、当前 source-time mapping 和 clip boundary，计算并校正 A/V drift；
- PCM generation 在 seek、pause、document revision 和 session replacement 时显式更新；
- 旧 generation 包必须丢弃；
- 播放前同时满足视频目标片段可解码和 PCM 预缓冲；
- 所有活动 PCM 轨道在首包 ready 后使用同一个未来 AudioContext 时间启动，
  浏览器调度采用固定高/低水位背压，不能随素材时长无界排队；
- 输入流 EOF 只有在最后一个已调度 source 实际结束后才成为播放 EOF；
- PCM 欠载时暂停视频，不能让两个时钟独立继续；
- 小漂移允许短期有界 `playbackRate` 修正，大漂移必须 rebase/seek；
- Webview hidden、失焦或销毁时暂停并释放 session。

`requestVideoFrameCallback()` 可以作为通过真实运行态验收后的观测增强，不能是唯一同步机制。当前 VS Code 实测中该回调和内层 `requestAnimationFrame()` 在动态验证上下文中可能停止，而 `video.currentTime`、媒体播放和 AudioContext 继续运行；实现必须有基于 AudioContext 与定时 drift calibration 的路径。

### 8. 非 H.264/VP8、10-bit 与 HDR 使用代理预览

Cut 区分 source capability、preview capability 和 export capability，不以“文件能打开”宣称完整 HDR 支持。

| 情况                                        | 决策                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| H.264 8-bit SDR                             | profile 兼容时 direct/remux；不兼容时生成 H.264 MP4 代理。              |
| VP8 8-bit SDR                               | runtime fixture 通过时 direct/remux；否则生成 H.264 MP4 代理。          |
| HEVC、AV1、ProRes 和其他 codec              | 转码为 H.264 MP4；只有后续 ADR 扩大白名单后才能直接播放。               |
| 10-bit HDR10/HLG                            | 保留原片和 HDR metadata，生成显式 SDR tone-map H.264/VP8 代理用于预览。 |
| 4:2:2/4:4:4、interlaced 或未知 HDR metadata | 生成命名代理或拒绝，不伪装为等价 direct preview。                       |

HDR proxy 必须明确转换 primaries、transfer、matrix、range、mastering display 和 content light metadata。PQ、HLG 到 SDR 的转换必须是命名 tone-map profile；不得只修改 container metadata。第一阶段支持 10-bit/HDR 输入和导出，但预览是 SDR 代理，不宣称原生 HDR 或色彩等价预览。

### 9. 导出与工程交换保持独立 adapter

媒体导出由 frozen OTIO revision 产生 typed `ExportPlan`：

- 默认 MP4：H.264 8-bit SDR + AAC；
- 可选 MP4：通过运行态和输出验收的 HEVC Main10 或 AV1 Main/Main10 profile；
- 输出先写临时文件，再验证 codec、duration、stream、size、色彩和音频，最后原子提交；
- 取消或失败不得覆盖现有目标。

剪映、DaVinci Resolve、FCPXML、AAF 或其他工程格式属于独立交换 adapter。adapter 只映射 OTIO 能明确表达的语义，并对不支持的字段和媒体转换给出 diagnostic；它们不能改变 Cut 内部项目事实或让 FFmpeg 解释完整 OTIO。

拟议 Desktop 的 “Open in DaVinci/剪映” 必须先冻结明确 OTIO revision，经目标版本
验证过的交换 adapter 生成 durable bundle，再由 Professional Tool service 启动应用。
Agent 的 timeline/project/import/render 操作通过现有 MCP Manager 和同一 application
service 执行，必须绑定明确 external session/document；外部保存结果只可经显式
round-trip 创建新的 Cut candidate/revision。完整边界见
[`adr-neko-desktop-professional-tool-handoff-and-mcp-boundary.md`](adr-neko-desktop-professional-tool-handoff-and-mcp-boundary.md)。

### 10. Neko Engine 按职责迁移，不立即整体删除

实施本 ADR 时，VS Code composition root 将现有 Cut Engine preview adapter 替换为唯一的 Host Node/FFmpeg adapter。替换必须按 OpenSpec：

1. 定义并验证新的 probe、segment、PCM、capture、proxy 和 export contract；
2. 在隔离 fixture 中接入新 adapter，并 poison 旧 Cut Engine path；
3. 证明真实 Extension Development Host 使用 MSE/Node/PCM canonical path；
4. 垂直删除被替代的 Engine route、client、handler、DTO、测试和兼容分支；
5. 对仍需 GPU/effect/color 或其他产品能力的 Engine 职责重新审计。

每个 composition root 只能选择一个 Cut media adapter；不得运行时自动 fallback、双 probe、双 stream 或双 export。后续消费者审计已归零，`neko-engine` 与旧 client 已按独立 OpenSpec 删除。

## 已验证证据

2026-07-26 在真实 VS Code Extension Development Host 中验证：

- VS Code `1.130.0`、Electron `42.6.0`、Chromium `148.0.7778.280`；
- H.264 Main 720p59.94 + AAC 5.1、126.61 秒、约 44 MiB fixture；
- Node/FFmpeg 无损 remux 为 fMP4，Webview 仅加载 init、首段和 55.57 秒附近片段；
- 加载约 2.14 MiB（原文件 4.87%）形成两个不连续 MSE buffered range，并成功 seek/解码目标 1280×720 帧；
- H.264 High 1080p30、约 160 MiB fixture 在 34 秒 seek 时仅加载 33.33–41.67 秒 GOP，约占原文件 20.99%，证明长 GOP 决定按需读取成本；
- AAC 5.1、AAC 和 MP3 均成功转为 48 kHz stereo `f32le`；
- 4 秒 AAC 5.1 PCM 生成约 1.5 MiB；一次本机 HTTP 提取约 45 ms；
- 2.5 秒同步采样中 A/V 平均绝对漂移约 9.2 ms，最大约 11.3 ms；
- Canvas 的音频和视频节点均在显式用户 Play 手势后才创建 PCM client；
  独立 PCM 预览从 0:00 推进到 0:01，视频 + PCM 预览推进到 0:02；
- MP4/H.264、HEVC Main、HEVC Main10、AV1 8-bit 和 AV1 10-bit 实际 `<video>` 解码成功，但本 ADR 只选择 H.264/VP8 作为直接播放白名单；
- 由 `Cut Basic Functional Fixture.mp4` 转出的 VP8 1080p fixture 通过 MSE WebM 实际 append/play：`readyState=4`、`currentTime` 推进、1920×1080、无媒体错误，因此当前 VS Code 基线启用 VP8 direct profile；
- `4K HDR 5.1 IMAX … 2160p HDR.mp4` 的 AV1 Main 10-bit PQ/BT.2020 片段也通过 MSE 实际 append/play：`readyState=4`、3840×2160、无媒体错误；这只证明当前 runtime 可解码，不改变 H.264/VP8 白名单，也不证明 HDR 显示链正确；
- MKV、ProRes MOV 和 MPEG-4 Part 2 MP4 在当前 Webview 实测失败，必须 remux、代理或拒绝；
- 当前测试显示器未报告 high dynamic range、P3 或 Rec.2020，故只证明 10-bit/HDR 文件可解码，不证明最终 HDR 显示正确。

这些数据是本机 runtime evidence，不是所有平台的静态承诺。fixture 目录当前缺少真实 HEVC/AV1/10-bit/HDR、FLAC 和 DTS-HD 产品素材；发布能力矩阵必须补充授权 fixture 并在目标平台重新验收。

## 验证要求

实现本 ADR 至少覆盖：

- probe schema、损坏 bitstream、错误 duration、未知 profile 和 actionable diagnostic；
- MP4/H.264 direct、WebM/VP8 direct、HEVC/AV1/ProRes 转码和长 GOP fixture；
- HDR10、HLG 到 SDR proxy 的 tone map、源 metadata 保留和输出验证；
- init/segment closed Range、token、owner mismatch、过期、越界、取消和缓存失效；
- 首播、连续播放、随机 seek、scrub、clip boundary、EOF、pause/resume 和 memory budget；
- AAC/MP3/Opus/Vorbis/FLAC/DTS-HD 到 PCM、5.1 downmix、多轨 gain/fade 和波形；
- AudioContext PTS、generation、欠载、失焦、设备变化和 30–60 分钟 A/V drift；
- 截帧、缩略图、字幕提取、代理命中、代理取消和 original/proxy relink；
- MP4 各接受 profile 的导出验证、原子提交和工程 adapter 的语义损失 diagnostic；
- VS Code Extension Development Host 与目标 Desktop Electron runtime；普通浏览器不能替代 Webview/Electron 验收；
- macOS、Windows、Linux 及适用的 Remote/SSH/WSL 场景。

新路径测试必须断言 Node/FFmpeg adapter、MSE segment、PCM generation 和 typed Cut plan 被命中，并通过 poison 或可断言 diagnostic 证明旧 Engine Cut path 未参与。

## 后果与权衡

### 正面

- 普通播放交给 Chromium `<video>`，应用不维护平台硬件 decoder；
- VS Code 与 Desktop 共享同一媒体 runtime、OTIO 和能力策略；
- FFmpeg 统一容器、codec、音频、代理、分析和导出边界；
- MSE segment 和短 GOP 代理使大文件按需 seek 可测量、可缓存；
- 直接播放 codec 收敛为 H.264/VP8，其他格式统一进入可观测 remux/transcode plan；
- Engine 可以按真实剩余职责缩减，不再因 Cut 项目模型长期存在。

### 代价

- FFmpeg 打包、许可、平台构建、更新和硬件 encoder 验收成为发行职责；
- remux/proxy 需要缓存、磁盘预算、取消和清理机制；
- 10-bit/HDR 预览需要 tone-map 代理，不能提供原生 HDR 预览的色彩等价性；
- 原始长 GOP 可能导致单次 seek 读取较大片段，快速 scrub 依赖代理；
- AudioContext 与媒体元素是两个时钟，需要持续 drift calibration；
- 迁移期需要同时维护当前实现和目标实现的测试证据，但单个运行 composition root 不允许双路径。

## 被拒绝的替代方案

- **以 WebCodecs 取代 `<video>` 作为普通播放主路径：** 需要应用拥有 demux、帧调度、色彩、surface、seek 和硬件能力差异，复杂度高于轻量 Cut 所需。
- **直接 `<video src={localhost/source}>`：** 当前 VS Code Webview URL safety 和 CSP 实测拒绝，且浏览器 Range 行为不受 Cut segment plan 控制。
- **整文件 fetch 后 Blob 播放：** 小文件可以工作，但不满足大文件按需读取和缓存预算。
- **所有输入一律预转码：** 会让已兼容的 H.264/VP8 失去低延迟直接播放优势，也增加不必要缓存。
- **所有输入一律直放：** 容器、codec、profile、音频和平台差异无法形成可验收产品能力。
- **长期保留 Engine 与 Node 两套 Cut runtime 并自动 fallback：** 形成双事实、双缓存、双时钟和不可证明的执行路径。
- **通过普通 IPC/postMessage 传媒体或大块 PCM：** 增加复制、内存峰值、背压和 Webview 生命周期问题。

## 实施前置

本 ADR 已由对应 OpenSpec 实施。后续跨 Extension、Webview、Node/FFmpeg、`@neko/media` 和 owning contract 的非平凡替换仍必须先创建或更新 OpenSpec proposal、design、spec 和 tasks，再按 canonical path 实施和验收。
