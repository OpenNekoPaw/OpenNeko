# ADR: OpenNeko Desktop 媒体能力、色彩与安全边界

状态：Proposed

日期：2026-08-01

范围：Electron Main/preload/renderer、`@neko/media`、Node/FFmpeg、Preview、Canvas、Cut、10-bit/HDR/SDR、按需读取与 CSP。

## 结论

Desktop 控制 Electron、Chromium、Node/FFmpeg、资源 transport 和发行版本，但不因此自动获得
所有 codec、10-bit 或 HDR 显示能力。源处理、预览输出和导出质量是三个独立 capability，
必须分别资格化。

| Capability | Owner | 通过条件 |
| --- | --- | --- |
| source probe/decode/process | `@neko/media/node` | 打包 FFmpeg 对冻结 fixture 的 probe、decode、frame/PCM/transform 通过 |
| browser direct playback | Electron renderer + release manifest | 精确 target/profile 的连续变化帧、seek、Range 与资源释放通过 |
| 10-bit/HDR preview | Electron/Chromium + OS/GPU/display | 真实显示链资格验证，不以 API、播放状态或截图代替 |
| source-fidelity export | owning domain + FFmpeg adapter | 输出 metadata、bit depth、时长和解码回读验证通过 |

## 媒体计划

`MediaPlaybackPlan` 由 source facts、发布能力矩阵和当前 capability snapshot 选择：

```text
ContentLocator
  -> owning-domain media port
  -> @neko/media/node probe
  -> direct | remux | hardware-prepared | unsupported
  -> Desktop exact-resource registration
  -> renderer <video>/<audio> or Web Audio
```

Renderer 不根据播放失败临时切换路径。未命中合格 profile 时只允许 manifest 已定义的
preparation plan 或明确失败；不得用 CPU 转码、另一 transport 或空结果掩盖缺失能力。

## 色彩与格式

Host 从 FFprobe 保留 pixel format、bit depth、chroma、primaries、transfer、matrix、range、
mastering display 和 content-light metadata。第一阶段默认 `sdr-reference-preview`；只有当前
Electron/Chromium、OS、GPU、显示器和 codec fixture 全部通过时才声明
`hdr-qualified-preview`。HDR 源在 SDR 预览时必须明确标注，导出能力独立判断。

H.264 8-bit SDR MP4 是基线 direct profile。其他 container/codec/profile 必须进入精确 release
target manifest 后才能 direct；其余输入通过合格 remux、目标平台完整硬件闭包或明确拒绝处理。

## Resource transport

Desktop Main 只注册 owning service 已解析、已授权的 exact byte source、one-shot PCM 或 frozen
resource set。opaque ID 不含路径或稳定内容身份，registration 绑定允许的 `webContentsId`、
Window/View、session、renderer epoch 和 generation。

Resource response 支持 GET/HEAD、200/206/416、单段 Range、精确 MIME/长度、取消和背压。
Renderer 只接收短生命周期 descriptor/URL，不接收绝对路径、文件 handle、SQLite path 或
process handle。URL 不进入项目事实、Agent/provider/Tool、剪贴板或未脱敏日志。

## Renderer 安全

- `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`、`webSecurity: true`；
- CSP 默认拒绝，仅按 consumer 开放可信 bundle 与 exact resource origin；
- preload 只暴露版本化窄 API；IPC 校验 sender、schema、instance identity、trust 和取消；
- 不开放任意网络 origin、通用磁盘读取、CSP bypass 或宽泛 wildcard；
- 未知 resource、过期 generation、sender mismatch 和 capability mismatch 产生可观察 diagnostic。

owner replace、renderer reload、Window/View detach、seek、cancel 和 app quit 必须撤销 registration、
结束 response、终止 FFmpeg 并删除不再由其他 operation 拥有的临时文件。

## 验证

冻结 fixture 至少覆盖 SDR direct、10-bit/HDR source、广格式、常见音频、多声道、大文件、长 GOP、
损坏尾部、并发 session、Range、sender isolation、reload、cancel 和 quit。验证必须在打包 Electron
runtime 与隔离 workspace 中完成；播放状态和 screenshot 不能作为 HDR 或 bit depth 证据。

相关边界见 [`media-runtime.md`](media-runtime.md)、
[`adr-cut-html-video-node-ffmpeg-media-runtime-boundary.md`](adr-cut-html-video-node-ffmpeg-media-runtime-boundary.md)、
[`application-composition.md`](application-composition.md) 和
[`package-boundaries.md`](package-boundaries.md)。
