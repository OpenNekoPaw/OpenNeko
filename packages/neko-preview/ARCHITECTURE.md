# neko-preview 架构

> 轻量预览器：视频/音频使用 Rust Engine，PDF/EPUB/CBZ/DOCX 由 Node Extension Host 读取，3D 参考由浏览器 Three.js 临时布置。

---

## 系统定位

neko-preview 是 OpenNeko 的预览扩展。以 CustomReadonlyEditorProvider 方式接管视频、音频、文档和标准 3D 文件。媒体采用硬件加速的 H.264 + PCM 流式播放；文档通过 Extension Host 内的 loopback Node 服务读取；3D Reference 在独立 Webview 中布置用户模型、内置 guide preset 或授权全景。设计为轻量级——不写回源文件，也不拥有持久 3D 项目事实。

---

## 子包结构

```
packages/neko-preview/
├── packages/
│   ├── extension/    # Extension Host（Node.js）— 媒体编排 + 文档读取
│   └── webview/      # Webview（React 18）— 播放器 UI
├── l10n/             # 国际化翻译
└── package.json      # VSCode 扩展清单
```

---

## 整体架构

```
┌────────────────────────────────────────────────────────┐
│                 VSCode Extension Host                   │
│                                                        │
│  extension.ts                                          │
│    ├─ PreviewService (单例)                             │
│    │    └─ EngineClient (HTTP dispatch)                │
│    │         ├─ probe()      — 媒体探测               │
│    │         ├─ startStream() — 启动 H.264/PCM 流      │
│    │         ├─ seekTo()     — 跳转                   │
│    │         └─ stopStream() — 停止流                  │
│    │                                                  │
│    ├─ VideoPreviewProvider (CustomReadonlyEditorProvider)│
│    │    └─ 处理 .mp4/.mov/.avi/.mkv/.webm 等          │
│    │                                                  │
│    ├─ AudioPreviewProvider (CustomReadonlyEditorProvider)│
│    │    └─ 处理 .mp3/.wav/.ogg/.flac/.aac 等          │
│    │                                                  │
│    ├─ DocumentPreviewProvider                         │
│    │    └─ NodeDocumentPreviewServer                  │
│    │         ├─ PDF/CBZ 原始字节 + Range              │
│    │         ├─ EPUB ZIP entry 目录读取               │
│    │         └─ DOCX 有界整文件读取                   │
│    │                                                  │
│    ├─ ModelPreviewProvider                           │
│    │    ├─ panel-scoped session / revision           │
│    │    ├─ source / builtin / environment subject    │
│    │    └─ purpose output materialization            │
│    │                                                  │
│    └─ StatusBarManager                                │
│         └─ 文件信息 / 编码格式 / 播放状态 / 当前时间    │
│                                                        │
│         │ postMessage                                  │
│         ▼                                              │
│  ┌──────────────────────────────────────────────┐      │
│  │            Webview (React 18 + Vite)          │      │
│  │                                              │      │
│  │  Video Player                                │      │
│  │    ├─ VideoPlayer.tsx                        │      │
│  │    │    ├─ H264StreamClient → WebCodecs      │      │
│  │    │    ├─ AudioStreamClient → Web Audio API  │      │
│  │    │    └─ FrameScheduler (A/V 同步)         │      │
│  │    └─ VideoControls.tsx                      │      │
│  │         └─ 播放/暂停/跳转/变速/音量/PiP       │      │
│  │                                              │      │
│  │  Audio Player                                │      │
│  │    ├─ AudioPlayer.tsx                        │      │
│  │    │    └─ AudioStreamClient → Web Audio API  │      │
│  │    ├─ AudioControls.tsx                      │      │
│  │    └─ WaveformCanvas.tsx                     │      │
│  │         └─ Canvas 波形可视化 + 点击跳转       │      │
│  │                                              │      │
│  │  Shared                                      │      │
│  │    ├─ useVscodeMessage.ts (postMessage hook)  │      │
│  │    ├─ ProgressBar.tsx                        │      │
│  │    └─ ErrorBoundary.tsx                      │      │
│  └──────────────────────────────────────────────┘      │
└────────────────────────────────────────────────────────┘
          │ WebSocket 直连
          ▼
    neko-engine (Rust Sidecar)
      └─ H.264 NAL + PCM Float32 流
```

文档路径不会激活 neko-engine。视频、音频与全景媒体在首次需要时由 `PreviewService` 显式激活 Engine 扩展，因此 Preview 清单不声明硬 `extensionDependencies`。

3D Reference 路径同样不激活 neko-engine。Extension Host 只负责资源授权、生命周期、session/revision 校验和有界输出物化；Webview 独立拥有 renderer、scene、orbit、姿势和 GPU 资源。内置 preset 是 Preview 代码声明的不可变程序化 guide，不进入 Assets，也不能作为形象参考。

### 3D Reference

```
source-model | builtin-preset | environment-only
  → ModelPreviewProvider（授权 + panel identity）
  → model Webview（Three.js 临时 staging）
  → appearance | pose | camera | panorama capture
  → PreviewAsset ResourceRef
  → 单一 3d-reference Agent context
```

- 每个面板独立持有状态和可释放资源；active editor 不是状态 owner。
- 内置中性素体声明稳定关节、层级和约束，仅开放动作/机位用途。
- capture 不包含工具栏、网格、XYZ、camera helper 或其它编辑器 chrome。
- 未知 schema、陈旧 identity、越界资源和不支持的用途直接 diagnostic，不回退旧 `model-preview` 或 generic image。
- Agent/Canvas/media 必须按角色协商能力；Preview 不选择 provider，也不提交生成任务。

---

## 核心数据流

### 视频播放

```
用户双击 .mp4
  → VideoPreviewProvider.resolveCustomEditor()
    → PreviewService.probe(path) → EngineClient HTTP → ProbeResult
      → postMessage('mediaInfo', {resolution, fps, codec, duration})
        → Webview 渲染 VideoPlayer

用户点击播放
  → postMessage('play') → PreviewService.startVideoStream() + startAudioStream()
    → EngineClient HTTP dispatch → 返回 streamUrl
      → postMessage('streamUrl', url) → Webview
        → H264StreamClient(WebSocket) → WebCodecs VideoDecoder → Canvas
        → AudioStreamClient(WebSocket) → Web Audio API
        → FrameScheduler 以音频时钟为主，视频跟随同步
```

### 音频播放

```
用户双击 .mp3
  → AudioPreviewProvider.resolveCustomEditor()
    → PreviewService.probe(path) + generateWaveform()
      → postMessage('mediaInfo' + 'waveformData')
        → WaveformCanvas 渲染交互式波形

用户点击播放
  → postMessage('play') → PreviewService.startAudioStream()
    → AudioStreamClient(WebSocket) → Web Audio API
    → 波形进度指示器实时更新
```

---

## 通信协议

### Webview → Extension

```
play, pause, resume, stop    — 播放控制
seek(time)                   — 跳转到指定时间
setSpeed(rate)               — 变速
setVolume(level)             — 音量
requestMediaInfo             — 请求媒体信息
```

### Extension → Webview

```
mediaInfo(probe result)      — 媒体元信息
streamUrl(url)               — WebSocket 流地址
audioStreamUrl(url)          — 音频流地址
waveformData(peaks)          — 波形数据
error(message)               — 错误通知
```

---

## 关键设计决策

| 决策                          | 理由                                                                 |
| ----------------------------- | -------------------------------------------------------------------- |
| **共享 PreviewService 单例**  | 多个预览面板共享一个引擎连接，避免重复创建                           |
| **流媒体绕过 Extension Host** | WebSocket 从 Webview 直连 neko-engine，避免帧数据在 Node.js 层拷贝   |
| **音频时钟为主**              | FrameScheduler 以音频 PTS 为基准同步视频帧，人耳对音频延迟更敏感     |
| **CustomReadonlyEditor**      | 预览器不修改文件，使用 Readonly 变体更安全                           |
| **文档与媒体分离**            | 文档读取归 Node Extension Host；Rust Engine 只承担媒体计算与流式传输 |
| **按需激活 Engine**           | 文档打开不产生 Rust sidecar 生命周期；媒体路径显式激活 Engine        |
| **Dev/Prod 双模式 HTML**      | 开发模式 Vite HMR，生产模式直接加载 dist                             |

---

## 关键设计模式

| 模式                             | 应用                                               |
| -------------------------------- | -------------------------------------------------- |
| **Singleton**                    | PreviewService — 共享引擎连接                      |
| **Adapter**                      | PreviewService 包装 EngineClient，适配预览专用接口 |
| **CustomReadonlyEditorProvider** | 视频/音频文件的 VSCode 编辑器集成                  |
| **Disposable**                   | 所有资源（流/面板/状态栏）严格 dispose 清理        |
| **Message-Driven**               | postMessage 驱动所有跨进程通信                     |

---

## 支持格式

| 类型 | 格式                                        |
| ---- | ------------------------------------------- |
| 视频 | mp4, mov, avi, mkv, webm, m4v, ts, flv, wmv |
| 音频 | mp3, wav, ogg, flac, aac, m4a, wma, opus    |
| 文档 | pdf, epub, cbz, docx                        |

---

## 公开 API

neko-preview 通过 `NekoPreviewAPI` 接口向其他扩展暴露能力：

```typescript
interface NekoPreviewAPI {
  probeMedia(path: string): Promise<ProbeResult>;
  startPlayback(path: string, options?: PlaybackOptions): Promise<StreamHandle>;
  // ...
}
```

其他扩展（如 neko-canvas）通过 `vscode.extensions.getExtension('neko.neko-preview')` 延迟获取此 API。

---

## 技术栈

| 层级           | 技术                                        |
| -------------- | ------------------------------------------- |
| Extension Host | VSCode Extension API + TypeScript + esbuild |
| Webview        | React 18 + Vite                             |
| 视频解码       | WebCodecs API（浏览器内置）                 |
| 音频播放       | Web Audio API（AudioContext）               |
| 流传输         | WebSocket（H.264 NAL + PCM Float32）        |
| A/V 同步       | 自研 FrameScheduler（自适应同步阈值）       |
| 波形渲染       | Canvas 2D + DPR 缩放                        |
| 测试           | Vitest                                      |
