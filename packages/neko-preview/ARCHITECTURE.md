# neko-preview 架构

neko-preview 是只读媒体、文档和临时 3D 参考预览器。媒体能力由
`@neko/media` 提供；Extension Host 拥有文件权限、FFmpeg 进程、tokenized
loopback HTTP、session 与释放，Webview 只消费授权描述符。

## 媒体 canonical path

```text
文件
  → PreviewService
    → NodeMediaRuntime.probe()
    → H.264/8-bit MP4: 直接 Range
    → H.264/其他容器: remux 为 MP4
    → VP8/WebM: 经能力确认后直接 Range
    → 其他视频/HDR: FFmpeg 转为 H.264 SDR 代理
    → 所有音频: FFmpeg 解码为 48 kHz stereo Float32 PCM
  → Webview
    → 原生 <video> 消费 HtmlVideoDescriptor
    → PcmAudioClient 消费 PcmStreamDescriptor
    → PCM AudioContext 作为主时钟，视频按阈值纠偏
```

Webview 不读取工作区文件，不启动 FFmpeg，也不持久化 loopback URL。每个播放或
预览资产都具有明确 session identity；停止、面板关闭和扩展停用会撤销 token 并
清理代理文件。未知 session、缺少 codec/filter 和损坏源直接返回 diagnostic，不
存在旧 Engine 或 WebCodecs fallback。

## 其他边界

- PDF/EPUB/CBZ/DOCX 由 `NodeDocumentPreviewServer` 提供有界、按需读取。
- 3D Reference 由独立 Three.js Webview 渲染；Extension Host 只负责资源授权、
  session/revision 校验和输出物化。
- Panorama 复用同一 Preview manifest 和 Node media descriptors，不拥有第二套
  解码路径。
- 源文件始终只读；Preview 不拥有项目事实。

## 支持策略

原生预览优先使用 VS Code Electron 已验证的 H.264 MP4（以及明确验证的 VP8
WebM）。HEVC、AV1、10-bit、HDR10/HLG、非常见容器和不受 Electron 原生播放支持
的音频均通过 FFmpeg remux、转码或 PCM 解码。此策略保证编辑预览可用，不承诺把
10-bit/HDR 原样显示在 8-bit SDR 预览路径；源素材与最终导出仍保持独立。

架构决策见
`docs/architecture/adr-cut-mse-node-ffmpeg-media-runtime-boundary.md`。
