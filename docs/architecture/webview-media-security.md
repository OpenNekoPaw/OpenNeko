# Webview Media Security 与运行时约束

状态：Superseded / Historical（2026-07-31）

更新日期：2026-07-27
本文记录已退休 VS Code Webview 中媒体展示、资源授权和按需读取的历史约束。
当前 Desktop renderer、Node/FFmpeg、opaque Range/PCM、CSP 和生命周期权威见
[`media-runtime.md`](media-runtime.md)、
[`package-boundaries.md`](package-boundaries.md) 与
[`adr-neko-desktop-media-capability-and-security-boundary.md`](adr-neko-desktop-media-capability-and-security-boundary.md)。
本文只保留迁移证据，不再作为新增 renderer 或媒体实现入口。

## 运行边界

Webview 不是文件系统 owner，也不是 FFmpeg host：

- Webview 不接收绝对文件路径，不直接读取 workspace，也不启动 Node/FFmpeg。
- Extension Host 使用 `@neko/media/node` probe 媒体并创建 panel/session-scoped
  loopback URL。
- H.264 与经资格验证的 VP8 可由 `<video>` 消费。Preview 还可基于当前
  Webview 的 versioned、变化帧验证结果直放窄化 MP4 profile，或将非优先的
  VP9/WebM 无重编码 remux 为 VP9/MP4；其他视频只能通过完整硬件闭包生成
  H.264 SDR preview。硬件能力不足时明确失败，不使用软件 proxy。
  Cut 的非原生预览使用有界时间区间，并在 Host 完成 seekable file 后发布。
- 音频统一由 FFmpeg 解码为 framed float32 PCM，再由
  `PcmAudioClient`/Web Audio 消费；浏览器 codec 支持不是音频真值。
- Cut、Preview 和 Canvas 都使用授权 HTTP Range URL 与原生 `<video src>`。
  音频 clock 是有音频场景的主时钟，视频按阈值校正。
- Chromium 负责视频 Range、缓存、demux 和 decoder backpressure。Webview 不
  fetch 视频、不创建 `MediaSource`/`SourceBuffer`，Host 不提供第二条 MSE 路径。
- token、URL、session、blob 和 Webview URI 都是运行态句柄，不得进入
  `.nkc`、OTIO 或其他持久项目事实。

## CSP

所有生产 Webview 必须从 `default-src 'none'` 开始，并按入口最小开放：

- script 使用 nonce；静态 bundle、样式和字体使用
  `${webview.cspSource}`。
- 需要 Node media 的入口只开放
  `connect-src http://127.0.0.1:*`；需要原生 `<video src>` 的入口同时开放
  `media-src http://127.0.0.1:*`。
- 小型 poster/thumbnail 可按入口开放 `data:` 或 `blob:`；视频不通过 blob。
- PDF/EPUB 等确实需要 worker/frame 的入口单独开放对应 directive。
- 不开放 `file:`、宽泛 `http:`、宽泛 `ws:`、`*` 或生产
  `unsafe-eval`。

端口范围在 CSP 中只能表达 loopback 通配；真正授权由随机 token、
session owner、路径边界和 dispose 决定。每个 panel 关闭、文档切换、seek
或播放 discontinuity 都必须释放旧 session 与浏览器 client。

## 格式与 HDR

VS Code Webview 的静态直接视频基线是 H.264 与 VP8。容器扩展名与
`canPlayType(video/webm)` 都不是完整能力证明：

- 先 probe video/audio codec、bit depth、color transfer、duration 和
  stream index，再选择 direct/remux/transcode。
- Webview readiness 只报告当前实现能消费的窄 MP4 profile。AV1/MP4
  只有在真实变化帧验证成立时才可发布原字节；当前 Preview 不声明 AV1
  合格。2026-07-27 的真实宿主证明 AV1 Main10 可出现时钟推进但画面冻结，
  10-bit VP9 WebM 也可在报告 `probably` 后返回 media error 4。
  VP9/WebM 必须先 remux 为 MP4，并且只在 MP4 VP9 能力成立时使用。
- 10-bit、HEVC、AV1、HDR10/HLG 源可以被 ffprobe/FFmpeg 识别和离线处理；
  未命中已验证 MP4 profile 的 10-bit/HDR 或非基线 codec 进入 Webview 前
  只能使用目标平台已验证的完整硬件闭包：`darwin-arm64` 为 VideoToolbox decode、
  `scale_vt` 与 `h264_videotoolbox`；`win32-x64` 尚无合格硬件闭包，因此此类输入
  返回明确 capability diagnostic。Linux 不属于 Desktop release target；
  不使用 CPU filter/encoder，不回退旧实现，也不把错误色彩转换当成功。
- 局部坏帧不等于全文件损坏。frame/waveform 操作可以返回有效前缀或有效
  区间，但必须携带 partial diagnostic；播放跨入损坏区间时必须可见失败。

## Range 与 PCM

loopback file endpoint 必须：

- 支持 `HEAD`、`GET`、单 byte range、`206`、`Content-Range`、
  `Accept-Ranges` 和非法 range 拒绝；
- 将 response 已关闭后的 `ERR_STREAM_PREMATURE_CLOSE` 识别为浏览器取消，
  不写错误日志或伪造 500；连接仍有效时的 premature close 继续 fail-visible；
- 只服务注册后的规范化文件，token 不映射到可猜测路径；
- 在 session stop/dispose 后拒绝访问；
- 禁止把大媒体整体转成 base64/data URI 或无界内存 blob。

Cut native video endpoint 必须：

- compatible H.264 MP4/qualified VP8 WebM 直接注册原文件，不启动 FFmpeg；
- 允许同一 token 的 HEAD、重复 GET、开放/闭合 Range 和浏览器并发读取；
- remux/硬件转换只有在 seekable session file 完成后才能注册；
- generation 替换、stop 或 dispose 时撤销 token 并删除 session file；
- Webview 只接受 `http://127.0.0.1` descriptor，不接受任意网络 URL；
- same-Clip PCM generation 转移 video file session owner，不重设 `src`。

PCM endpoint 必须先发送协议 header，再发送固定格式 frame。播放器在收到
首个可调度 PCM frame 前不能宣称音频 clock ready；abort/seek/stop 是正常
EOF，真实 FFmpeg stderr 或协议截断则是可见错误。浏览器 consumer 必须有界
调度并向 HTTP reader 施加背压；网络输入 EOF 后仍需等待最后一个已调度
Web Audio source 结束，不能提前 dispose 截断尾音。

## 推荐链路

```text
ContentLocator
  -> Extension Host authorization
  -> NodeMediaRuntime probe
  -> direct H.264/VP8 | changing-frame-qualified native MP4
     | non-priority VP9/WebM->MP4 remux | hardware-only H.264 preview
  -> tokenized Range + optional PCM descriptor
  -> Webview <video src> + PcmAudioClient
  -> stop/dispose on discontinuity
```

## 验证

- producer/consumer 测试断言 descriptor、token、Range、PCM header、abort 与
  dispose；
- consumer 测试断言 canonical Node adapter 被命中，retired command 被
  poison；
- 媒体矩阵覆盖 direct H.264、音频 PCM、非基线 codec、10-bit/HDR
  capability failure 和局部损坏；
- Extension Development Host 验证真实 CSP、network request、`readyState`、
  currentTime 推进、PCM 请求和无 legacy Engine 文案。

参考：[VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)。
