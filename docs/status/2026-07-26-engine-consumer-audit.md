# Engine 消费者退役审计（2026-07-26）

状态：runtime dependency closure 已归零；真实 VS Code Webview 验收见对应
OpenSpec validation。

## 结论

- `packages/neko-engine` 和 `packages/neko-client` 已删除。
- Preview、Canvas、Cut、Tools、Assets、Agent 的生产代码均使用
  `@neko/media`、领域窄 port 或 Node/FFmpeg adapter。
- VSIX composition、release channel、Turbo、CI、packager 和 workspace lockfile
  不再构建、激活或携带 Engine。
- 原 `neko.engine.*` 命令只保留三个 fail-closed poison handler，任何调用都会返回
  明确退役 diagnostic，不能成功 fallback。
- 应用启动会拒绝另行安装的 `neko.neko-engine` feature，防止测试环境意外混入
  旧实现。

仓库仍有少量名称含 `Engine` 的 host-neutral 结构类型，例如 Proto 生成的
`EngineTimeline`/`EngineDiffResult` 和通用 content projection “engine”。它们不含
Engine transport、route、client、session 或 native runtime，不能执行或发现已删除
产品；本审计不把英文通用名或生成类型前缀误报为运行时消费者。

## 消费者闭包

| Owner | 当前 canonical path |
| --- | --- |
| Cut | OTIO domain ports → `NodeFfmpegCutMediaAdapter` → shared FFmpeg process/loopback primitives → MSE/PCM |
| Preview | `PreviewService` → `NodeMediaRuntime` → `<video>`/PCM；全景使用 tokenized manifest |
| Canvas | Canvas host media bridge → `NodeMediaRuntime` → native video/PCM |
| Tools | `IMediaRuntimeService` → `NodeMediaRuntimeService` → FFmpeg diff/probe/frame/PCM |
| Assets | `NodeMediaMetadataExtractor` / ThumbnailService → shared runtime |
| Agent | `mediaRuntimeProvider` / `MediaPreprocessor` → shared runtime |
| VS Code app | 只组合保留 feature，并 poison 旧 Engine feature/commands |

## 路径证据

- `pnpm check:engine-retirement-boundary` 扫描六个产品包的生产源码、manifest、
  composition、packager 和 Turbo 图。
- composition root 测试断言 Cut 构造 Node adapter。
- Preview/Canvas/Cut Webview 测试断言 HTTP video/PCM descriptor，并且 descriptor
  不含本地文件路径。
- `@neko/media` 测试覆盖 Range、单消费者 PCM、主动 stop 的正常 EOF 和资源撤销。
- `NodeMediaRuntime.qualify()` 明确报告 FFmpeg/ffprobe 版本、H.264/HEVC/AV1/VP8
  decoder、H.264/AAC encoder 及 `zscale`/`tonemap` filter，不把缺失能力归类为
  文件损坏。
- `captureFrames()` 按 timestamp 返回 `ok` 或 `corrupt/interval`，保留同一文件中
  已成功生成的缩略图；PCM browser client 在首个完整 packet 调度前不会激活。

## 真实媒体结果摘要

- H.264 MP4、AAC、MP3、WAV：probe、直接 Range preview、抽帧或 PCM 按适用能力
  通过。
- AV1 Main10 HDR 与 VP9 Profile 2 HDR：probe、五点抽帧按适用能力通过；当前主机
  FFmpeg 缺少 `zscale`，HDR-to-SDR H.264 proxy 明确失败，不回退。
- `1080P.mp4` 只有约 143 秒 packet 前缀，container metadata 宣称约 1795 秒；
  0 秒与 120 秒抽帧成功，150 秒区间出现 `Invalid NAL unit size`。批量抽帧保留
  前两个结果，只把 150 秒标记为 `corrupt/interval`；不是“整个文件不可读”。
  直接预览可消费有效前缀。

## 真实 VS Code Webview

- 宿主：VS Code 1.130.0、Electron 42.6、Chrome 148，隔离生成 workspace。
- Cut OTIO：真实点击播放后 MSE `blob:` 视频进入 `readyState=4`，时间推进，并观察到
  PCM 与文件 Range 请求。
- Cut 720P/AAC 5.1：在全新 user-data、最新 composed stage 的真实宿主中，可信点击
  产生 `cut:preview-ready`/`cut:preview-activated`；时间线 15.01 秒时视频折算源时间
  约 15.06 秒（约 50ms 偏差），`readyState=4`、无错误且未暂停。停止后视频回到
  paused/`readyState=0`，没有后台继续播放。
- Preview H.264：真实点击播放后 loopback 视频进入 `readyState=4`，6 秒媒体推进至
  2.476 秒，无媒体错误，并观察到 PCM 与文件 Range 请求。
- Canvas：隔离 `.nkc` 由当前 Canvas custom editor 打开；媒体 track 选择、PCM
  选择及 CSP loopback 规则由聚焦路径测试覆盖。
- 三个场景均未出现 `Failed to initialize media engine` 或 `neko-engine` fallback。

## 剩余发布风险

Engine 退役本身没有剩余 runtime 消费者。独立的发布风险是：VSIX 尚需提供或声明
经资格验证的 FFmpeg/ffprobe 发行闭包；HDR-to-SDR profile 要求 `zscale` +
`tonemap`，codec license 必须按目标平台审计。该风险不得通过恢复 Engine fallback
解决。

最终 `OpenNeko-darwin-arm64-0.0.1.vsix` 已重建并审计：包内没有
`neko-engine`/`neko-client` 路径或 manifest 依赖；仅有两份 Sharp 图像处理原生
模块，不属于媒体 Engine。
