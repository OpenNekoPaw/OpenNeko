# Node/FFmpeg 媒体运行时

状态：Accepted

更新日期：2026-07-26

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
- 其他容器或 codec：显式 remux 或转码为声明的 H.264 SDR preview profile。
- 10-bit、HDR10/PQ、HLG、HEVC、AV1、VP9：probe、截帧和 PCM 可由 FFmpeg
  解码；用于 8-bit H.264 预览时必须显式 tone-map，不能伪装成原生 HDR 监看。
- HDR-to-SDR profile 必须先验证 `zscale` 与 `tonemap`。缺少过滤器时返回
  `MediaRuntimeUnavailableError`，不得回退旧 Engine 或使用错误色彩转换。
- AAC、MP3、FLAC、PCM 以及 FFmpeg 构建可解码的多声道音轨统一解码为
  48 kHz stereo float32 PCM。源 codec 和通道数仍由 probe 报告。

本地 PATH 只用于开发发现；发布闭包必须提供或明确要求经资格验证的 FFmpeg/
ffprobe，并单独审计 codec license。`NEKO_FFMPEG_PATH` 和
`NEKO_FFPROBE_PATH` 是测试/打包注入点，不是运行时 fallback 链。
`NodeMediaRuntime.qualify()` 是可执行资格入口，报告 FFmpeg/ffprobe 版本、直接
依赖的 decoder/encoder/filter；缺少能力返回 `MediaRuntimeUnavailableError`，
不归类为媒体损坏。

## 损坏与部分结果

- probe 成功只证明容器和 stream metadata 可读，不证明每个 packet/frame 完整。
- 单点抽帧按请求区间报告 `interval` 损坏；批量 `captureFrames()` 逐点返回
  `ok`/`corrupt`，一个坏区间不得丢弃此前可解码帧或改写成“整文件不可用”。
- 波形在 FFmpeg 已产生 PCM 后遇到损坏时返回 `partial`、可用时长和明确诊断。
- container duration 与实际 packet 尾部不一致时，UI 可继续播放有效前缀，但不得
  把越界 seek 或空帧报告为成功。

## 安全与生命周期

- Loopback 只监听 `127.0.0.1`，URL 使用不可预测 session token，不暴露路径。
- 文件响应支持标准 byte Range；PCM 每个 token 只允许一个消费者。
- Webview CSP 仅为媒体/文档 entry 开放 loopback，其他 entry 保持关闭。
- stop、seek、替换或 Extension dispose 必须终止子进程、撤销 token、结束 HTTP
  响应并删除 session 临时文件。未知 session 必须 fail-visible。

## 验证

- `pnpm check:engine-retirement-boundary`
- `pnpm --filter @neko/media test -- --run`
- `pnpm validate:media-matrix .tmp/vscode-test-workspaces/media-runtime/media`
- 真实 Extension Development Host + 隔离 fixture workspace，验证 Range、
  `<video>`、PCM、seek、Cut 和 CSP；普通浏览器不能替代。
