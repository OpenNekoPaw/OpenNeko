# Node/FFmpeg 媒体运行时

状态：Accepted

更新日期：2026-07-27

OpenNeko 的本地媒体 canonical path 是 `@neko/media` 与各领域的窄媒体
port。`packages/neko-engine` 和 `packages/neko-client` 已删除，不是可选
fallback。

## 职责

- `@neko/media`：host-neutral probe、视频 descriptor、PCM、波形和失败范围契约。
- `@neko/media/node`：FFmpeg/ffprobe 子进程、取消、诊断、tokenized loopback
  HTTP、Range、PCM framing 和临时会话生命周期。
- `@neko/media/browser`：MSE 与 Web Audio 消费，不接触 Node、VS Code 或本地路径。
- Preview、Canvas、Cut、Tools、Assets、Agent：各自拥有领域 port、操作编排和
  session identity；不得重建万能媒体 client。
- Webview：消费授权 URL 和 descriptor。媒体字节不通过 `postMessage`，本地路径
  不进入 Webview。

```text
domain controller
  -> domain media port
  -> @neko/media/node
  -> ffprobe / FFmpeg
  -> opaque loopback HTTP Range / PCM
  -> Webview <video> / MSE / Web Audio
```

## 格式与质量策略

- H.264 8-bit SDR MP4：`<video>` + HTTP Range 直接播放。
- 已通过真实 VS Code Webview 资格验证的 VP8：允许声明直接播放；当前产品优先
  H.264 路径，不以通用 Chromium 能力推断 VS Code 支持。
- Preview Webview 以 versioned readiness payload 报告窄化的 MP4 codec 能力。
  AV1/MP4 只有在当前 Webview 对该 profile 完成真实变化帧验证后才可发布原
  文件；`canPlayType()`、`readyState`、`currentTime` 和 Range 请求本身都不
  构成证明。当前 Preview 将 AV1 标记为不合格。VP9/WebM 不是产品优先格式；
  仅在 MP4 VP9 能力成立时允许无重编码 remux 为 MP4。
- 10-bit、HDR10/PQ、HLG、HEVC、AV1、VP9：probe 与音频 PCM 可由 FFmpeg
  处理。未命中合格 native/remux profile 的视频只能进入完整硬件闭包：
  VideoToolbox 硬解、`scale_vt` 和 `h264_videotoolbox`，并以 `-allow_sw 0`
  禁止软件编码回退。`libx264`、CPU `scale`、`zscale`、`tonemap` 以及
  `hwdownload` 不得进入实时预览或预览代理路径。
- 硬件 decoder/filter/encoder 缺失或拒绝源 profile 时返回
  `MediaRuntimeUnavailableError`。HDR 截帧需要 CPU filter/readback 时独立
  失败，不得阻塞另一个已合格播放路径，也不得回退旧 Engine。
- AAC、MP3、FLAC、PCM 以及 FFmpeg 构建可解码的多声道音轨统一解码为
  48 kHz stereo float32 PCM。源 codec 和通道数仍由 probe 报告。

PCM 浏览器调度采用显式 `prepare -> startAt` 两阶段：先取得首包，再由拥有
timeline 的调用方在 Host 确认 generation activation 后选择未来
`AudioContext` 时间。Webview 先预热静音视频 decoder 但不推进 Timeline，再在
该时间同时启动视频与唯一 PCM master，避免冷启动和连接阶段的音频时钟抢跑。
调度超前量以 1 秒高水位、
0.5 秒低水位限制，HTTP reader 通过背压停止继续拉取，因此内存和
`AudioBufferSourceNode` 数量不随素材时长增长。输入 EOF 不等于播放 EOF；
只有最后一个已调度 source 实际结束后才通知播放完成，stop/seek/dispose 则
立即中止 fetch 并停止、断开全部 source。

Cut 将当前十秒有界预览段内的所有可听 Clip 一次提交给 Host。FFmpeg 先应用
每个 Clip 的 trim、速度、gain 与 fade，以 `amix=normalize=0` 合成唯一 master，
再使用 EBU R128 `loudnorm` 动态模式统一到 `I=-14 LUFS`、`TP=-1 dBTP`、
`LRA=11 LU`。Webview 只消费一条 48 kHz stereo PCM，保留用户监听音量和
Timeline 主时钟；不再建立逐 Clip mix bus，也不使用
`DynamicsCompressorNode` 冒充响度标准化。

Cut 的 H.264 片段仅在源时间为 0 时使用 fMP4 stream-copy。非零 seek 若直接
copy，片段可能从 0 开始携带不可独立解码的 P/B 帧、首个关键帧落在数秒后；
因此该路径固定使用 VideoToolbox 解码、`scale_vt` 与
`h264_videotoolbox -allow_sw 0` 生成零起点有界片段，不允许 CPU fallback。

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
fallback。descriptor 冻结 target、FFmpeg/ffprobe 版本、可执行文件与许可证
SHA-256、SPDX 和必要 codec/filter signature。Composition root 在任何产品
feature 激活前校验 descriptor、真实路径、checksum 与运行时资格，再注入精确
可执行路径。`NodeMediaRuntime.qualify()` 报告直接依赖的
decoder/encoder/filter，包括 `loudnorm`、`ebur128`、`alimiter`、AAC、FLAC、
DTS 与当前平台硬件视频闭包；缺少任一必要能力会阻断媒体 feature 激活，不归类
为素材损坏。

## 损坏与部分结果

- probe 成功只证明容器和 stream metadata 可读，不证明每个 packet/frame 完整。
- 单点抽帧按请求区间报告 `interval` 损坏；批量 `captureFrames()` 逐点返回
  `ok`/`corrupt`，一个坏区间不得丢弃此前可解码帧或改写成“整文件不可用”。
- 波形在 FFmpeg 已产生 PCM 后遇到损坏时返回 `partial`、可用时长和明确诊断。
- container duration 与实际 packet 尾部不一致时，UI 可继续播放有效前缀，但不得
  把越界 seek 或空帧报告为成功。

## 安全与生命周期

- Loopback 只监听 `127.0.0.1`，URL 使用不可预测 session token，不暴露路径。
- 文件响应支持标准 byte Range；PCM 每个 token 只允许一个消费者。Chromium
  在 seek/替换资源时关闭旧 Range response 属于正常取消；只有连接仍有效时的
  流关闭或真实文件 IO 失败才记录为 loopback 错误。
- Webview CSP 仅为媒体/文档 entry 开放 loopback，其他 entry 保持关闭。
- stop、seek、替换或 Extension dispose 必须终止子进程、撤销 token、结束 HTTP
  响应并删除 session 临时文件。未知 session 必须 fail-visible。

## 验证

- `pnpm check:engine-retirement-boundary`
- `pnpm --filter @neko/media test -- --run`
- `pnpm validate:media-matrix ~/Git/neko-test/cases`
- 真实 Extension Development Host + 隔离 fixture workspace，验证 Range、
  `<video>`、PCM、seek、Cut 和 CSP；普通浏览器不能替代。

运行态验收 workspace 唯一允许 `${HOME}/Git/neko-test`。生成的媒体 fixture
只写入其 `.neko/.functional/media-runtime` 子目录；不得使用仓库内 `.tmp`
或其他 workspace，也不得删除或重建 `neko-test` 根目录。
