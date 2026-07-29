## Context

当前 VS Code 使用 `@neko/media`、Node/FFmpeg、tokenized loopback HTTP、Range、
原生 `<video src>` 和 Web Audio。拟议 Desktop 使用 Electron，但 Electron renderer
仍是 Chromium renderer；它只让 OpenNeko 拥有 main/preload/renderer、custom
protocol 和 CSP 配置权，不自动扩大浏览器 codec 或最终显示能力。

## Goals / Non-Goals

**Goals:**

- 逐项回答 10-bit、HDR/SDR、按需读取、音视频格式和 CSP 是否能由 Desktop
  避免或解决。
- 定义 Desktop 与 VS Code 共享的 `@neko/media` 策略，以及 Desktop 专属 transport
  adapter。
- 定义能证明 direct playback、HDR/10-bit output 和格式 fallback 的验证证据。

**Non-Goals:**

- 实现 Electron main/preload/renderer 或 media protocol handler。
- 恢复旧 Engine/client 或引入 native professional viewport。
- 扩大当前 H.264/VP8 direct 白名单。
- 承诺尚未在目标打包 runtime、OS 和显示器上验证的 HDR/codec 能力。

## Five-Layer Analysis

| 层 | 结论 |
| --- | --- |
| 职责 | `@neko/media`/领域 port 拥有 probe 与 playback plan；Desktop Host 拥有授权 transport；Chromium 只消费已选择的 direct/remux/hardware-prepared file/PCM 投影。 |
| 依赖 | renderer 不读取本地路径或 Node API；main 不解释 Cut/Canvas 项目事实；FFmpeg 不成为 UI 或 timeline owner。 |
| 接口 | source、preview、export capability 分离；media descriptor 携带 profile、color mode、transport URL、session identity 和 diagnostic。 |
| 扩展 | 新 codec、HDR output 或平台只通过冻结 fixture 和资格矩阵加入；不使用播放失败后的自动 fallback。 |
| 测试 | 同一 fixture 覆盖 probe、Range、实际 seek/decode、色彩输出、平台硬件 preparation、CSP、取消和资源释放；截图不能证明 HDR。 |

## Decisions

### 1. Desktop 只解除 VS Code 宿主层，不解除 Chromium 层

Desktop renderer 不再受 VS Code `asWebviewUri()`、Webview iframe、Extension
message 和宿主注入 CSP 的控制，但仍经过 Electron 所绑定的 Chromium media、
GPU compositor、OS color management 和显示器链路。

### 2. 10-bit/HDR 分为输入、预览和导出三种能力

- FFprobe/FFmpeg 负责识别和处理 10-bit、PQ、HLG、BT.2020 与 metadata。
- SDR 预览是所有目标平台的基线；非 direct/remux 输入必须先完成平台硬件 prepared file。
- native HDR preview 只有在精确 Electron/Chromium、OS、GPU、显示器和 fixture
  组合通过输出资格验证后才能启用。
- 10-bit/HDR export 由 FFmpeg 输出验证决定，不依赖 renderer 当前是否为 SDR。

### 3. Desktop 使用安全 custom protocol 按需读取

目标 transport 使用 Electron `protocol.handle()` 和启用 `stream` 的 secure
custom scheme，把短生命周期 opaque URL 投影给原生 `<video src>`、`<audio src>` 或
PCM consumer。handler
实现 GET/HEAD、closed Range、206、Content-Range、MIME、token/owner/session、
取消和背压。不得暴露绝对路径或使用 `file://`。

Preview/Canvas 的简单线性预览可直接把合格 profile 交给 `<video>`；Cut 继续使用
原文件或完整 seekable prepared file 的 Range URL 与独立 PCM 路径。renderer 不得
fetch 视频、创建 `MediaSource`/`SourceBuffer` 或维护应用级缓冲窗口。

### 4. 格式支持由 playback plan 决定

`canPlayType()` 和 Media Capabilities 只是探测输入。发布能力必须由
打包 runtime 的真实 fixture 冻结：

```text
direct accepted profile
  -> custom protocol Range -> <video src>

accepted codec + incompatible container
  -> explicit remux -> custom protocol Range -> <video src>

unsupported codec/profile/color mode
  -> platform hardware preparation -> seekable file
  -> custom protocol Range -> <video src>

unavailable required transform
  -> diagnostic
```

### 5. CSP 从宿主约束改为产品安全边界

Desktop 自己定义 CSP，但不能删除 CSP。renderer 继续启用 sandbox、
`contextIsolation` 和 `webSecurity`；custom scheme 不启用 `bypassCSP`。CSP 只向
应用资源、typed IPC 所需边界和 `neko-media:` 开放最小范围；视频不开放 MSE `blob:`
或任意网络来源。

## Risks / Trade-offs

- custom protocol 减少 loopback/CORS/PNA 摩擦，但必须对每个 Electron session/
  partition 注册并验证 Range、stream 和 CSP 行为。
- Chromium 支持 HDR color space 不等于当前窗口输出 HDR；Display 和浏览器 API
  只能组成候选 capability snapshot。
- Desktop 总体格式覆盖可因 FFmpeg 提升，但 direct `<video>` 覆盖不会自动超过
  VS Code；Electron/Chromium 更新还会改变结果。
- 如果专业 10-bit/HDR 监看成为发布要求，而 Chromium 链路不能稳定通过资格验证，
  应以独立 OpenSpec 评估 native viewport；不能在当前 renderer 中伪造成功。
