# ADR: Neko Desktop 媒体能力、色彩与安全边界

状态：Proposed

日期：2026-08-01

范围：实施中的 `apps/neko-desktop`、Electron main/preload/renderer、`@neko/media`、
Node/FFmpeg、Preview、Canvas、Cut、10-bit/HDR/SDR、音视频格式、按需读取与 CSP。

## 背景

历史 VS Code 媒体路径曾使用 `@neko/media`、Node/FFmpeg、tokenized
loopback HTTP、Range、原生 `<video src>` 和 Web Audio。VS Code Webview 额外受到
`asWebviewUri()`、iframe、宿主 CSP、URL safety 和 Extension/Webview 通信边界约束。

Electron 让 OpenNeko 自己拥有 main/preload/renderer、窗口、protocol handler 和 CSP
配置，因此可以解除这些 VS Code 特有限制。但 Electron renderer 仍是 Chromium
renderer：HTML media、浏览器 codec、GPU compositor、OS 色彩管理和显示器输出
链路并不会因为离开 VS Code 自动变成专业媒体 surface。

因此必须分别回答三件事：

1. 源文件能否被 probe、解码和处理；
2. Desktop 当前窗口能否正确预览该 bit depth、色域和动态范围；
3. 最终导出是否保留或正确转换源质量。

“`<video>` 可以播放”只回答了第 1 项的一部分，不能证明第 2 或第 3 项。

## 结论

| VS Code 限制           | Desktop 结论                                                                                                   | 产品承诺                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 10-bit                 | **部分解决**：FFmpeg 输入、处理和导出可以支持；Electron/Chromium 最终 10-bit 输出仍需逐目标资格验证            | 默认只承诺 SDR 预览；通过真实显示链验证后才启用 10-bit/HDR 监看                               |
| HDR / SDR              | **部分解决**：可正确识别、保留、tone-map 和导出；native HDR preview 不是 Electron 的静态保证                   | 明确区分 SDR reference preview、HDR-qualified preview、source-fidelity export                 |
| Webview 无法按需读内容 | **可以解决宿主层**：Desktop 使用 scoped `openneko://resource` 与 Range；简单预览可直接使用 `<video>`              | 不使用第二个媒体协议、绝对路径、`file://`、整文件 Blob、媒体字节 IPC 或 loopback server          |
| Webview 音视频格式限制 | **总体覆盖可扩大，但 direct playback 不会自动扩大**：FFmpeg 负责广格式，`<video>` 只播放通过资格验证的 profile | probe 后显式 direct/remux/hardware-prepared/reject，不做失败后的隐藏 fallback                 |
| VS Code CSP            | **可以移除 VS Code 特有摩擦，但不能移除 CSP**                                                                  | Desktop 自己定义最小 CSP；保持 sandbox、context isolation、`webSecurity` 和 sender validation |

Desktop 的价值是获得宿主、transport、版本和打包闭包控制权，不是绕过 Chromium
媒体与安全模型。

## 五层分析

| 层   | 决策                                                                                                                                               |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 职责 | `@neko/media` 与领域窄 port 拥有 probe、playback plan 和质量语义；Desktop Host 只拥有授权 transport、Electron lifecycle 和 capability projection。 |
| 依赖 | renderer 只依赖浏览器安全 contract，不读取本地路径或 Node/Electron API；main 不解释 OTIO、Canvas 或项目事实。                                      |
| 接口 | source、preview、export capability 分离；descriptor 明确 direct/remux/hardware-prepared、色彩模式、transient resource projection、session identity 和 diagnostic。 |
| 扩展 | codec、HDR output 和平台通过真实 fixture 资格矩阵扩展；同一 release/target 只选择一个 canonical plan，不保留自动 fallback。                        |
| 测试 | 同一 fixture 覆盖 probe、按需读取、实际 seek/decode、色彩输出、代理、CSP、取消与资源释放；“可播放”和截图不能作为 HDR 证据。                        |

## 决策

### 1. Desktop 与 VS Code 共享媒体策略，不共享宿主 transport

两个宿主继续复用同一 `@neko/media` probe、PCM、代理、波形和失败契约，但投影
不同授权 transport：

```text
source ContentLocator
  -> domain media port
  -> @neko/media/node + FFprobe
  -> explicit MediaPlaybackPlan
     ├─ direct browser profile
     ├─ lossless remux profile
     ├─ hardware-prepared SDR file
     └─ explicit unsupported diagnostic

Historical VS Code Host (retired)
  -> tokenized loopback HTTP Range / PCM
  -> Webview <video src> / Web Audio

Desktop Host
  -> unified openneko://resource Range / PCM
  -> Electron renderer <video src> / Web Audio
```

`MediaPlaybackPlan` 由 probe 后的 source facts、发布能力矩阵和当前 capability snapshot
共同选择。renderer 不根据播放错误改选路径，Host 也不以另一条 transport 或旧 Engine
兜底成功。

### 2. 10-bit 处理能力不等于 10-bit 显示能力

Desktop 将 10-bit 分为三个独立 capability：

| Capability                   | Owner                                 | 通过条件                                                                  |
| ---------------------------- | ------------------------------------- | ------------------------------------------------------------------------- |
| 10-bit source decode/process | `@neko/media/node` / FFmpeg           | 打包 FFmpeg 对冻结 fixture 的 probe、decode、frame 和 transform 通过      |
| 10-bit preview output        | Electron/Chromium + OS/GPU/display    | 精确目标组合完成真实显示链验证，不只检查 API 或播放状态                   |
| 10-bit export                | owning domain + FFmpeg export adapter | 输出 bit depth、pixel format、color metadata、duration 和解码回读验证通过 |

Electron `Display` 暴露 `colorDepth`、`depthPerComponent` 和 `colorSpace`，Chromium/
Web 平台还可提供 Media Capabilities、`color-gamut`、`dynamic-range`、
`video-color-gamut` 和 `video-dynamic-range` 探测。这些字段只用于形成候选
`MediaCapabilitySnapshot`；它们不能单独证明 `<video>` surface、compositor 和物理
输出始终保持 10-bit。

Canvas 2D、WebGL 或 WebGPU 内部使用高精度 texture 也不能证明最终 swap chain 与
显示器为 10-bit。第一阶段不把 Canvas 后处理链声明为专业 10-bit 监看路径。

### 3. HDR / SDR 使用显式预览模式

Host 必须从 FFprobe 读取并保留至少以下源事实：

- pixel format、bit depth 和 chroma；
- color primaries、transfer、matrix 和 range；
- mastering display、content light metadata；
- PQ、HLG、BT.2020、P3、BT.709/SDR 判定及缺失/冲突 diagnostic。

预览和导出使用不同 profile：

| 模式                     | 适用条件                                                         | 行为                                                                                      |
| ------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `sdr-reference-preview`  | 所有受支持平台的基线                                             | SDR 直接播放；HDR 仅通过目标平台已验证的完整硬件闭包转换为 8-bit BT.709 SDR seekable 文件 |
| `hdr-qualified-preview`  | 当前 Electron/Chromium、OS、GPU、显示器和 codec fixture 全部通过 | 保留 HDR 输入并使用已验证 `<video>`/compositor 输出；UI 显示“已验证 HDR 监看”             |
| `source-fidelity-export` | owning domain 的输出 profile 通过                                | 独立于当前预览，保留或显式转换 10-bit/HDR metadata，并回读验证                            |

未满足 native HDR 条件时，UI 必须显示“**HDR 源 / SDR 预览**”，不得只显示
“HDR”。窗口移动到另一显示器、显示器热插拔、系统恢复、OS HDR/色彩设置变化或
runtime 更新后，旧 snapshot 失效；在无法可靠观察变化的平台上，离开已验证条件就
降为 SDR 模式并给出 diagnostic。

浏览器返回 `supported/smooth/powerEfficient`、媒体元素进入 `readyState=4`、10-bit
文件正常播放或截到看似正确的 screenshot，都不能证明 HDR 输出正确。截图通常经过
桌面合成或 tone-map，只能验证 UI，不作为 luminance、色域或 bit depth 证据。

### 4. Desktop 视频统一使用 `<video src>` 与 OpenNeko Range

Desktop 不把 `/absolute/path` 或 `file://` 交给 renderer。Electron 在 `app.ready` 前注册
唯一 privileged `openneko:` scheme，同一个 handler 分发 `desktop` 与 `resource` host：

- URL path 只包含 32 字符 CSPRNG opaque ID，不含路径或稳定内容身份；
- opaque ID 只映射到 exact seekable resource、one-shot PCM 或 frozen resource set；
- 响应实现 GET/HEAD、200/206/416、单段 Range、精确 MIME/长度、取消、背压；
- registration 绑定 Window/View/session/renderer-epoch/generation 与允许的 `webContentsId`，
  不信任请求 header；
- CSP 只开放 exact `openneko://resource` origin；CORS 只接受 exact Renderer origin；
- owner replace、View/Window detach、renderer reload 和 app quit 确定性撤销 registration 与在途资源。

scheme 是字节 transport，不扩大 codec、纹理、10-bit 或 HDR 能力。`neko-app:`、
`neko-media:`、`opennekomedia:`、`file:`、私有 `media:`/`video:`/`audio:` URL 和
production loopback HTTP 都不是生产成功路径。

用途分层：

| Surface                       | Desktop video path                                                                                              | Audio path                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Preview / Agent 展示          | 合格 direct/prepared source 经 OpenNeko resource 进入原生 `<video>`                                              | 原生 `<audio>` / `<video>`，不创建 PCM                                                   |
| Canvas 普通节点               | 合格 direct/prepared source 经 OpenNeko resource 进入单个 `<video>`                                              | 原生 `<audio>` 或视频内嵌音频；仅显式处理 operation 可使用 PCM                           |
| Cut                           | 原文件或完整 prepared file 经 OpenNeko Range 进入 active/standby `<video>`                                      | 当前有界段由 Host 混合为唯一 48 kHz stereo float32 PCM master，并由 Cut-owned clock 调度 |
| Frame / thumbnail / waveform  | FFmpeg 派生 operation                                                                                           | FFmpeg PCM/peak 聚合                                                                     |
| Export                        | FFmpeg typed export plan                                                                                        | FFmpeg typed export plan                                                                 |

原生 `<video src>` 是唯一视频消费路径；合格 profile 直接注册源文件，其他输入必须
先完成 seekable prepared file，不能恢复 MSE、整文件 fetch 或隐藏 CPU fallback。

### 5. Desktop 格式覆盖由 FFmpeg 扩大，不由 Electron 承诺

Electron 绑定确定版本的 Chromium，HTML media 会根据该 Chromium build、平台硬件和
软件 decoder 选择实际路径。Desktop 能固定并测试这一组合，但不能从 Chromium 源码中
存在 H.264/H.265/AV1/VP9 decoder 推断发行包在所有 OS/GPU 都可用。

每个 release target 维护冻结的 direct capability manifest：

```text
Electron + Chromium version
+ OS + architecture
+ packaged FFmpeg build and license closure
+ codec/container/profile/bit depth/color mode
+ real fixture result
= accepted direct/remux/hardware-prepared/reject plan
```

运行时 `canPlayType()` 和 `navigator.mediaCapabilities.decodingInfo()` 用于确认
manifest 未失效；任一结果冲突时 fail-visible 或选择 manifest 已定义的平台硬件
preparation，不做播放失败后的临时重试链。

第一阶段继续以 H.264 8-bit SDR MP4 和已通过资格验证的 VP8 作为 direct profile。
HEVC、AV1、VP9 Profile 2、ProRes、10-bit 和 HDR 即使在某台设备上偶然可播放，也只有
在新的 release-target fixture 进入 manifest 后才能 direct。总体产品仍可通过 FFmpeg
remux、目标平台完整硬件 decode/filter/encode 闭包、PCM 或明确拒绝支持更多输入；
实时预览和预览代理不得使用 `libx264`、CPU scale/tone-map 或 `hwdownload`
fallback。打包 FFmpeg 的 decoder/encoder/filter 和 codec license 必须单独审计。

### 6. Desktop 解决 VS Code CSP 问题的方式是自己拥有策略，不是关闭策略

Desktop 不再受 VS Code Webview 注入的 CSP source、`asWebviewUri()` 和 iframe
资源边界控制，可以针对 Neko renderer 和 exact resource origin 定义稳定策略。但 Electron
官方仍要求 CSP、context isolation、renderer sandbox 和 `webSecurity`。

安全基线：

- renderer 使用 `nodeIntegration: false`、`contextIsolation: true`、
  `sandbox: true`、`webSecurity: true`；
- 应用页面使用 `openneko://desktop` 加载可信 bundle，本地内容只经
  `openneko://resource`，不使用 `file://`；
- CSP 默认 `default-src 'none'`，按构建需要开放 `script-src 'self'`、样式和字体；
- `media-src`、`img-src`、`connect-src` 只按 consumer 开放 exact resource origin；
- 不启用 `bypassCSP`、`unsafe-eval`、任意 `http:`、`localhost`、任意 `data:` 或宽泛 `*`；
- preload 只暴露版本化窄 API，所有 IPC 校验 sender、schema、instance identity、
  trust 和取消；
- CSP violation、未知 scheme/path/opaque ID 和 capability mismatch 必须产生可观察
  diagnostic。

因此 Desktop 可以消除 VS Code 特有 CSP 摩擦，但 CSP 仍是产品安全边界。关闭
`webSecurity`、启用 `bypassCSP` 或让 renderer 直接读磁盘不是解决方案。

## Desktop 媒体验证矩阵

在创建 `apps/neko-desktop` 的实施 OpenSpec 中，必须提供隔离、可再生成或已授权 fixture：

| 维度        | 最低 fixture / 场景                                                  | 必须证明                                                                |
| ----------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| SDR direct  | H.264 8-bit BT.709 MP4、VP8 WebM                                     | 首帧、连续播放、随机 seek、Range 命中、A/V 行为、取消                   |
| 10-bit/HDR  | HEVC Main10 PQ、AV1 Main10 PQ、VP9 Profile 2 HLG                     | source probe 正确；默认 SDR tone-map；只有目标显示链通过才启用 HDR      |
| 广格式      | ProRes MOV、MKV、MPEG-4 Part 2、可接受的图像序列                     | direct/remux/hardware-prepared/reject 与 manifest 一致                  |
| Audio       | AAC、MP3、Opus/Vorbis、FLAC、PCM、5.1                                | direct 提示不影响 Cut PCM；downmix、PTS、seek、资源释放正确             |
| Transport   | 大文件、长 GOP、损坏尾部、并发 session                               | GET/HEAD/206、闭区间、非全量读取、背压、registration/owner/过期、取消   |
| CSP / trust | scoped OpenNeko registration、任意 `file:`/旧媒体协议、任意 localhost、注入脚本、未知 IPC | 只允许 exact origin/sender 与最小资源；禁止项 fail-visible；无 `bypassCSP`/`webSecurity=false` |
| Lifecycle   | 窗口移动、显示器热插拔、sleep/resume、session replace、退出          | capability snapshot 失效，进程/stream/registration/临时文件被释放       |

HDR/10-bit 输出验收还必须满足：

1. 固定 Electron/Chromium、OS build、GPU/driver、显示器型号与连接方式；
2. 记录 OS HDR 开关、显示器 `depthPerComponent`/`colorSpace` 与浏览器动态范围探测；
3. 使用带已知 PQ/HLG、BT.2020、峰值和渐变的测试图；
4. 验证 banding、色域映射、SDR white、peak luminance 和 HDR/SDR 并置行为；
5. 通过显示器/测量或平台级输出证据验证；screenshot 不计为 HDR 输出证据；
6. 窗口移入不合格显示器时立即撤销 `hdr-qualified-preview`。

每个声明支持的平台必须独立运行；macOS 的结果不能推断 Windows，x64 不能推断
arm64。当前原生构建平台闭集是 `darwin-arm64` 与 `win32-x64`，Linux 只用于
host-neutral CI。Windows package 不等于媒体资格；只有真实 Windows 启动、OpenNeko/CSP、
媒体和色彩证据通过后才能声明对应 capability。Electron 或 Chromium 升级、
FFmpeg 构建变化、direct manifest 变化均触发重新验证。

## 当前状态与进入实现的门槛

截至 2026-08-01，Desktop 已删除私有媒体协议和 production loopback HTTP，并接入统一
`openneko:` handler、exact-resource registry、领域 descriptor 与 owner-scoped release。该实现只证明 transport
可用；图形化 Windows、10-bit/HDR 输出和广格式 direct playback 仍需各自资格验证。

进入 Desktop 媒体实施前至少完成：

1. 打包 Electron 场景：OpenNeko resource handler + direct/prepared `<video src>` + Cut PCM；
2. `darwin-arm64` 与 `win32-x64` 的 SDR transport/codec matrix；Windows package
   不能替代该真实运行态准入；
3. 至少一个明确硬件/显示器组合的 HDR/10-bit spike，或明确第一阶段只发布 SDR 预览；
4. 打包 FFmpeg capability/license 闭包；
5. CSP、sandbox、sender binding、Range/registration 和资源生命周期安全测试；
6. 以新 OpenSpec 定义 contract、实现、数据/缓存策略和发布门禁。

如果产品要求不受 Chromium/OS 组合影响的专业 10-bit/HDR 监看，而上述链路无法稳定
通过，应独立评估 native viewport。该评估不能恢复已删除 Engine/client，也不能让
Electron renderer 同时保留两条自动 fallback 路径。

## 参考

仓库内：

- [`media-runtime.md`](media-runtime.md)
- [`webview-media-security.md`](webview-media-security.md)
- [`adr-cut-html-video-node-ffmpeg-media-runtime-boundary.md`](adr-cut-html-video-node-ffmpeg-media-runtime-boundary.md)
- [`adr-neko-desktop-composition-and-open-source-reference-boundary.md`](adr-neko-desktop-composition-and-open-source-reference-boundary.md)
- [`../../openspec/changes/define-desktop-media-capability-boundary/`](../../openspec/changes/define-desktop-media-capability-boundary/)

外部一手资料（核验日期：2026-07-27）：

- [Electron protocol](https://www.electronjs.org/docs/latest/api/protocol)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window)
- [Electron Display](https://www.electronjs.org/docs/latest/api/structures/display)
- [Electron ColorSpace](https://www.electronjs.org/docs/latest/api/structures/color-space)
- [Chromium media pipeline](https://chromium.googlesource.com/chromium/src/media/+/master)
- [W3C Media Capabilities](https://www.w3.org/TR/media-capabilities/)
- [W3C Media Queries Level 5](https://www.w3.org/TR/mediaqueries-5/)
