# Node/FFmpeg 媒体运行时

状态：Accepted

更新日期：2026-08-01

OpenNeko 的本地媒体 canonical path 是 `@neko/media` 与各领域的窄媒体 port。

## 职责

- `@neko/media`：host-neutral probe、视频 descriptor、PCM、波形和失败范围契约。
- `@neko/media/node`：FFmpeg/ffprobe 子进程、取消、诊断、媒体文件准备、PCM framing
  和最小 file/PCM publication port；不拥有 Electron transport。
- `@neko/media/browser`：原生 HTML video 生命周期与 Web Audio 消费，不接触
  Node、Electron 或本地路径。
- Preview、Canvas、Cut、Tools、Assets、Agent：各自拥有领域 port、操作编排和
  session identity；不得重建万能媒体 client。
- Webview：消费授权 URL 和 descriptor。媒体字节不通过 `postMessage`，本地路径
  不进入 Webview。

```text
domain controller
  -> domain media port
  -> @neko/media/node
  -> ffprobe / FFmpeg
  -> Desktop exact-resource registration
  -> openneko://resource Range / PCM
  -> Webview <video src> / Web Audio
```

Desktop 在 `app.ready` 前注册唯一 privileged `openneko:` scheme。同一个 protocol handler
服务 `openneko://desktop` bundle 与 `openneko://resource` Range/PCM，不注册第二个媒体
scheme，也不启动 loopback server。Desktop registry 只接受 owning service 已解析的 exact
byte source、one-shot stream 或 frozen resource set，不解析 `ContentLocator`、项目事实或任意路径。
它支持 GET/HEAD、200/206/416、单段 Range、精确 MIME/长度、取消、背压和资源释放，
不得暴露绝对路径或使用 `file://`。

## 格式与质量策略

- H.264 8-bit SDR MP4：`<video>` + OpenNeko Range 直接播放。
- 已通过打包 Electron renderer 资格验证的 VP8：允许声明直接播放；当前产品优先
  H.264 路径，不以通用 Chromium 能力推断 Desktop 支持。
- Preview renderer 以 versioned readiness payload 报告窄化的 MP4 codec 能力。
  AV1/MP4 只有在当前 renderer 对该 profile 完成真实变化帧验证后才可发布原
  文件；`canPlayType()`、`readyState`、`currentTime` 和 Range 请求本身都不
  构成证明。当前 Preview 将 AV1 标记为不合格。VP9/WebM 不是产品优先格式；
  仅在 MP4 VP9 能力成立时允许无重编码 remux 为 MP4。
- 10-bit、HDR10/PQ、HLG、HEVC、AV1、VP9：probe 与音频 PCM 可由 FFmpeg
  处理。未命中合格 native/remux profile 的视频只能进入目标平台的完整硬件闭包：
  `darwin-arm64` 使用 VideoToolbox 硬解、`scale_vt` 和
  `h264_videotoolbox -allow_sw 0`。Windows/Linux 不是 release target，不拥有 packaged
  media descriptor 或可进入产品的 decode/filter/encode 闭包；不兼容视频明确
  unavailable，不用 CPU 转码冒充预览成功。
  `libx264`、CPU `scale`、`zscale`、`tonemap` 以及编码前 `hwdownload`
  不得进入实时预览或预览代理路径。
- 硬件 decoder/filter/encoder 缺失或拒绝源 profile 时返回
  `MediaRuntimeUnavailableError`。HDR 截帧需要 CPU filter/readback 时独立
  失败，不得阻塞另一个已合格播放路径，也不得切换到平行媒体实现。
- Desktop 也不因 Electron 而自动扩大 direct profile。只有精确 release target
  的真实变化帧 fixture 和输出链资格验证通过后，才能增加 direct codec 或
  `hdr-qualified-preview`；否则使用同一平台硬件 preparation path 或明确失败。
- AAC、MP3、FLAC、PCM 以及 FFmpeg 构建可解码的多声道音轨可按显式处理操作解码为
  48 kHz stereo float32 PCM。源 codec 和通道数仍由 probe 报告；普通单资源播放不因此
  自动转为 PCM。

| Consumer / operation | Canonical audio path |
| --- | --- |
| Cut 有声 timeline preview | Host 混合 framed PCM；muted `<video>` 跟随 Cut master clock |
| Cut video-only interval | 原生 `<video>` clock，不创建 PCM |
| Canvas 普通 audio/video node | 原生 `<audio>` 或带内嵌音频的单个 `<video>` |
| Canvas 显式同步/混音/分析 | 独立版本化 processed/PCM contract |
| Preview、Agent 展示 | 原生 `<audio>` / `<video>` |
| camera/microphone/call/live capture | `MediaStream` / WebRTC 或专用 live runtime |

PCM 浏览器调度采用显式 `prepare -> startAt` 两阶段：先取得首包，再由拥有
timeline 的调用方在 Host 确认 generation activation 后选择未来
`AudioContext` 时间。Webview 先预热静音视频 decoder 但不推进 Timeline，再在
该时间同时启动视频与唯一 PCM master，避免冷启动和连接阶段的音频时钟抢跑。
调度超前量以 1 秒高水位、
0.5 秒低水位限制，resource stream reader 通过背压停止继续拉取，因此内存和
`AudioBufferSourceNode` 数量不随素材时长增长。输入 EOF 不等于播放 EOF；
只有最后一个已调度 source 实际结束后才通知播放完成，stop/seek/dispose 则
立即中止 fetch 并停止、断开全部 source。

Cut 将当前十秒有界预览段内的所有可听 Clip 一次提交给 Host。FFmpeg 先应用
每个 Clip 的 trim、速度、gain 与 fade，以 `amix=normalize=0` 合成唯一 master，
再使用 EBU R128 `loudnorm` 动态模式统一到 `I=-14 LUFS`、`TP=-1 dBTP`、
`LRA=11 LU`。Webview 只消费一条 48 kHz stereo PCM，保留用户监听音量和
Timeline 主时钟；不再建立逐 Clip mix bus，也不使用
`DynamicsCompressorNode` 冒充响度标准化。

Cut 的 compatible H.264 MP4 和已验证 VP8 WebM 直接注册原文件 Range URL。
descriptor 携带 Clip source-time origin；Chromium 根据容器索引和 byte Range
完成关键帧 pre-roll。非零 seek 不启动 FFmpeg，不生成 GOP fragment，也不把
源文件读入应用内存。

Cut Webview 将授权 URL 直接赋给 active/standby `<video>`。Chromium 负责 Range
调度、缓存、demux、decoder backpressure 和 seek；Cut 不调用视频 `fetch()`，
不创建 `MediaSource`/`SourceBuffer`，也不维护缓冲窗口。同一 Clip 的 PCM
generation 滚动时，Host 转移 video session ownership，只退休旧 PCM session。

H.264 容器不兼容时完成 `-c:v copy` 的有界 MP4 后再发布普通 Range URL。
不兼容 codec 使用已验证的目标平台硬件 backend，完成 seekable session file
后走同一个 `<video src>` contract；不允许 CPU fallback。平台命令、能力名和
错误分类统一由 `@neko/media/node` backend strategy 拥有，Cut 不复制平台分支。

当前原生 package/release target 只有 `darwin-arm64`。Windows/Linux 仅运行 host-neutral
媒体与 orchestration 测试，不拥有 packaged FFmpeg descriptor、native runtime 或产品媒体
backend；测试通过不构成媒体 release 资格。

Cut 导出复用相同的 Clip 音频事实，但对完整节目执行两遍响度处理：第一遍
测量 integrated loudness、true peak、loudness range、threshold 与 target
offset；第二遍把全部测量字段传给线性 `loudnorm`。`alimiter` 只位于标准化
之后，作为最终峰值安全层。导出暂存文件会再次测量，只有 integrated loudness
位于目标 ±0.5 LU 且 true peak 不超过目标容差时才原子发布。测量缺失、非有限
或验收不合格都会终止导出，不回退到 limiter-only 路径。实时动态模式只能在
当前有界段内逼近目标；完整导出的两遍结果才是最终节目响度事实。

波形生成使用同一个 FFmpeg 解码事实，但不缓存完整 PCM：Node 直接消费
`f32le` stdout，以一个 peak window 聚合并丢弃已处理样本，只保留不足一个
Float32 样本的字节后缀、当前窗口和返回的 peaks。工作内存不随素材时长线性
增长；返回的 peak 数组仍按 `duration * peaksPerSecond` 增长。FFmpeg 在产生
有效 PCM 后失败时返回 `partial/stream` 与可用时长；取消或首个样本前失败则
继续 fail-visible。

开发 stage 必须由显式 `NEKO_FFMPEG_PATH` / `NEKO_FFPROBE_PATH` 生成，发布
payload 必须包含目标平台专属的已验证 runtime bundle；两者都不是 PATH
fallback。v2 descriptor 冻结 target、FFmpeg/ffprobe 版本、可执行文件与许可证
SHA-256、SPDX 和必要 hardware accelerator/codec/filter signature。Composition root 在任何产品
feature 激活前校验 descriptor、真实路径、checksum 与运行时资格，再注入精确
可执行路径。`NodeMediaRuntime.qualify()` 报告直接依赖的
decoder/encoder/filter，包括 `loudnorm`、`ebur128`、`alimiter`、AAC、FLAC、
DTS，以及 macOS 硬件视频闭包；缺少任一必要能力会阻断媒体 feature 激活，不归类
为素材损坏。

## 损坏与部分结果

- probe 成功只证明容器和 stream metadata 可读，不证明每个 packet/frame 完整。
- 单点抽帧按请求区间报告 `interval` 损坏；批量 `captureFrames()` 逐点返回
  `ok`/`corrupt`，一个坏区间不得丢弃此前可解码帧或改写成“整文件不可用”。
- 波形在 FFmpeg 已产生 PCM 后遇到损坏时返回 `partial`、可用时长和明确诊断。
- container duration 与实际 packet 尾部不一致时，UI 可继续播放有效前缀，但不得
  把越界 seek 或空帧报告为成功。

## 安全与生命周期

- `openneko://resource/<opaque-id>` 不暴露路径或稳定内容身份；registration 绑定允许的
  `webContentsId`、Window/View/session/renderer-epoch/generation。
- 文件响应支持标准 byte Range，并允许 Chromium 重复或并发请求同一 registration；
  PCM 每个 registration 只允许一个消费者。Chromium 在 seek/替换资源时关闭旧 Range
  response 属于正常取消；只有连接仍有效时的流关闭、FFmpeg 失败或真实文件 IO
  失败才记录为资源错误。
- Renderer CSP 只在 `media-src`、`img-src`、`connect-src` 和经审计需要的 `frame-src`
  开放 exact `openneko://resource` origin，不能开放任意 `http:`、`localhost` 或 `*`。
- Desktop renderer 保持 sandbox、context isolation、`webSecurity` 与严格 CSP；
  带 `Origin` 的 resource 请求只返回精确 Renderer origin；`session.webRequest` 根据实际
  `webContentsId` 拒绝 sender 缺失或不匹配的请求，不信任 Renderer header。
- opaque ID 仅映射一个 exact resource、one-shot stream 或 frozen resource set；server-side
  owner/generation 用于注册和撤销。
  URL 不持久化、不进入 Agent/provider/Tool、clipboard、telemetry 或未脱敏日志。
- stop、seek、替换或 Desktop session dispose 必须终止子进程、撤销 registration、结束
  响应并删除不再由其他 operation 拥有的 session 临时文件。未知 session 必须
  fail-visible。

## 验证

- `pnpm --filter @neko/media test -- --run`
- `pnpm validate:media-matrix ~/Git/neko-test/cases`
- Desktop 必须在打包 Electron runtime 与隔离 fixture workspace 中验证 OpenNeko
  handler、Range、direct/prepared-file/PCM、CSP/CORS、sender isolation 和生命周期；HDR/10-bit 需要真实显示链
  证据，不能由播放状态或 screenshot 推断。

运行态验收 workspace 唯一允许 `${HOME}/Git/neko-test`。生成的媒体 fixture
只写入其 `.neko/.functional/media-runtime` 子目录；不得使用仓库内 `.tmp`
或其他 workspace，也不得删除或重建 `neko-test` 根目录。
