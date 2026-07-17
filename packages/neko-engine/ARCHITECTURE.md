# neko-engine 架构

> Rust 媒体引擎，当前主路径以进程内 N-API 单例形式提供 GPU 渲染、FFmpeg 编解码、H.264/PCM 流式传输等计算密集型能力。

---

## 系统定位

neko-engine 是 OpenNeko 的计算核心。当前主路径是在 VSCode Extension Host 内通过 `host-napi` 访问 Rust `EngineApi` 全局单例，并按需启动嵌入式 HTTP/WebSocket 服务。Rust 引擎是数据模型和计算逻辑的唯一权威来源，TS 层不复制其逻辑。

控制面与数据面边界如下：

- 控制面：N-API。命令分发、任务控制、状态查询等控制命令通过 `NativeEngine` 直接调用 Rust 单例。
- 数据面：HTTP/WebSocket。流媒体、frame server、预览文件服务等数据传输通过嵌入式 HTTP/WebSocket 服务暴露。

---

## 子包结构

```
packages/neko-engine/
├── packages/
│   ├── engine-kernel/    # Rust: GPU 渲染 + FFmpeg 编解码 + 音频处理
│   ├── host-api/     # Rust: Controller 层 + ActionRouter + 资源管理
│   ├── host-http/    # Rust: axum HTTP/WebSocket 服务
│   ├── runtime-scene/   # Rust: 3D 场景 ECS（bevy_ecs + glTF/VRM loader）
│   ├── runtime-puppet/  # Rust: 2D 骨骼 ECS（bevy_ecs + MOC3 + bevy_animation）
│   ├── host-napi/    # Rust: Node.js N-API 绑定（napi-rs）
│   ├── host-cli/     # Rust: 独立 CLI 二进制
│   ├── types/          # Rust: 共享 DTO（跨 crate 契约）
│   └── extension/      # TypeScript: VSCode 扩展（Extension 会话生命周期管理）
├── Cargo.toml          # Rust workspace 配置
└── package.json        # VSCode 扩展元数据
```

---

## 分层架构

```
┌───────────────────────────────────────────────────────┐
│              VSCode Extension Host (Node.js)           │
│                                                       │
│  extension/                                           │
│    ├─ MediaEngineManager  (引擎生命周期管理)            │
│    ├─ NativeMediaEngine   (N-API 调用包装)              │
│    └─ Export Pipeline     (导出流水线编排)              │
│         │                                             │
│         │ N-API (napi-rs)                             │
│         ▼                                             │
└─────────┬─────────────────────────────────────────────┘
          │
┌─────────▼─────────────────────────────────────────────┐
│      Rust Engine Runtime (embedded in Extension Host) │
│                                                       │
│  ┌─ View Layer ──────────────────────────────────┐    │
│  │  host-http (axum)                           │    │
│  │    POST /v1/dispatch          — 通用 ActionRequest    │    │
│  │    POST /v1/:group/:id        — RESTful 资源操作      │    │
│  │    GET  /v1/streams/:id       — WebSocket 媒体流      │    │
│  │    POST /v1/puppets/load      — 加载 MOC3 文件        │    │
│  │    POST /v1/puppets/param     — 设置参数              │    │
│  │    POST /v1/puppets/tick      — 物理步进              │    │
│  │    POST /v1/puppets/anim/play — 播放动画片段          │    │
│  │    POST /v1/puppets/anim/stop — 停止动画              │    │
│  │    POST /v1/puppets/anim/seek — 跳转时间点            │    │
│  │    GET  /v1/puppets/anims     — 动画片段列表          │    │
│  │    WS   /v1/puppets/stream    — 60fps PuppetDelta 推送│    │
│  │    GET  /health               — 健康检查              │    │
│  └──────────────┬────────────────────────────────┘    │
│                 │                                     │
│  ┌─ Controller Layer ────────────────────────────┐    │
│  │  host-api                                   │    │
│  │    EngineApi        — 主 Facade               │    │
│  │    ActionRouter     — 请求路由                 │    │
│  │    ResourceRegistry — 资源管理（确定性 ID）     │    │
│  │    StreamRegistry   — 流 broadcast 通道管理    │    │
│  │    SessionManager   — 会话生命周期             │    │
│  │    Controllers:                               │    │
│  │      video, audio, timeline, stream,          │    │
│  │      effects, canvas, node, image, task,      │    │
│  │      scenes, models, puppets                  │    │
│  └──────────────┬────────────────────────────────┘    │
│                 │                                     │
│  ┌─ Core Layer ──────────────────────────────────┐    │
│  │  engine-kernel                                  │    │
│  │    gpu/       — wgpu 上下文 + 纹理合成 + 格式转换│    │
│  │    decoder/   — 硬件解码（VideoToolbox/VAAPI）  │    │
│  │    encoder/   — 硬件编码（H.264/VP9）          │    │
│  │    audio/     — 音频编解码 + 混音 + 响度分析（ebur128）│    │
│  │    export/    — GPU 导出管线 + 媒体合成         │    │
│  │    animation/ — 关键帧插值 + 缓动函数          │    │
│  │    domain/    — 领域模型（Timeline/Transform/Loudness）│    │
│  │    services/  — 服务 trait（IVideo/IAudio/IExport/IScene）│
│  └───────────────────────────────────────────────┘    │
│                                                       │
│  ┌─ Shared Types ────────────────────────────────┐    │
│  │  types/                                       │    │
│  │    ActionRequest/Response, ResourceId,         │    │
│  │    StreamId, Codec, Media, Export DTOs         │    │
│  └───────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────┘
```

---

## 依赖方向

```
host-cli ──→ host-http ──→ host-api ──→ engine-kernel ──→ runtime-scene
                                    │              │              │
                                    ├──→ runtime-puppet            │
                                    └──→ types ◀───┘──────────────┘
                                                  ▲
                                            runtime-puppet

host-napi ──→ host-api + host-http + engine-kernel + types

extension (TS) ──→ host-napi (N-API 绑定)
```

所有 Rust crate 共享 `types/` 中的 DTO 定义，无循环依赖。

---

## 通信方式

### 1. N-API 调用（Extension Host → Rust）

```
Extension Host
  └─ NativeMediaEngine（TS wrapper）
       └─ host-napi（C FFI + napi-rs）
            └─ EngineApi / embedded host-http
```

适用于低延迟同步/异步操作：probe、extract frame、generate waveform。

### 2. HTTP/WebSocket（任意消费者 → Rust）

```
EngineClient（@neko/neko-client）
  └─ POST /v1/dispatch  →  ActionRouter  →  Controller  →  Service
  └─ GET  /v1/streams/  →  WebSocket  →  H.264 NAL / PCM Float32
```

适用于长连接流式数据和跨扩展调用。所有扩展（neko-cut、neko-preview、neko-tools 等）通过 EngineClient HTTP dispatch 统一访问。

### 生命周期说明

- `host-napi` 当前通过全局 `OnceCell<Arc<EngineApi>>` 持有 Rust 引擎单例。
- `NativeEngine` 与 bridge 函数都必须复用同一个全局单例入口，避免出现两套 `EngineApi` 状态。
- `MediaEngineManager.disposeEngines()` 仅释放 TypeScript 包装层，不会真正销毁 Rust 引擎单例。
- `stopFrameServer()` 只影响嵌入式 HTTP/WebSocket 服务，不代表底层引擎已重建或退出。
- 若后续需要真正的 `stop/start/restart`，必须先在 Rust 侧提供显式 `shutdown/reset` 契约。

### 3. WebSocket 直连（Webview → Rust）

```
Webview H264StreamClient / AudioStreamClient
  └─ WebSocket 连接
       └─ neko-engine axum 端点
            └─ engine-kernel decoder → H.264 NAL / PCM
```

流媒体绕过 Extension Host，避免帧数据在 Node.js 层多次拷贝。

---

## 核心数据流

### 视频播放

```
播放请求 → EngineClient HTTP dispatch
  → ActionRouter → StreamController
    → engine-kernel decoder（硬件加速）
      → H.264 NAL 流 → WebSocket 推送
        → Webview WebCodecs VideoDecoder → Canvas
```

### 视频导出

```
导出请求 → EngineClient / N-API
  → ExportController → ExportService
    → GPU 渲染管线（wgpu compositor）
      → 硬件编码（VideoToolbox/NVENC/VAAPI）
        → 音视频混流 → .mp4 文件
```

### 媒体探测

```
探测请求 → EngineClient.probe(path)
  → ActionRouter → VideoController
    → FFmpeg probe → ProbeResult（分辨率/帧率/编码格式/时长）
```

---

## 关键设计模式

| 模式 | 应用 |
|------|------|
| **分层 MVC** | engine-kernel（Model）→ host-api（Controller）→ host-http（View） |
| **Trait Service** | IVideoService、IAudioService、IExportService、ISceneService — 面向 trait 编程 |
| **Registry** | ResourceRegistry、StreamRegistry — 动态资源管理 |
| **Facade** | EngineApi — 统一入口，隐藏内部复杂性 |
| **Router** | ActionRouter — 请求分发到对应 Controller |
| **DTO** | types/ crate — 纯数据传输对象，无业务逻辑 |
| **spawn_blocking** | Controller 层长时间同步操作（diff/FFmpeg）卸载到 tokio 阻塞线程池，避免饿死 async 工作线程 |

---

## 平台特性

| 平台 | GPU | 硬件编解码 | 构建目标 |
|------|-----|-----------|---------|
| macOS (ARM) | Metal (wgpu) | VideoToolbox | aarch64-apple-darwin |
| macOS (x86) | Metal (wgpu) | VideoToolbox | x86_64-apple-darwin |
| Linux | Vulkan (wgpu) | VAAPI | x86_64-unknown-linux-gnu |
| Windows | DX12 (wgpu) | NVENC/DXVA | x86_64-pc-windows-msvc |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| GPU 渲染 | wgpu（跨平台 Metal/Vulkan/DX12） |
| 编解码 | FFmpeg (ffmpeg-next) + 平台硬件加速 |
| HTTP 服务 | axum + tokio 异步运行时 |
| N-API 绑定 | napi-rs（Node.js ≥18） |
| 2D 骨骼 ECS | bevy_ecs 0.15 + MOC3 clean-room parser + bevy_animation |
| 3D 场景 ECS | bevy_ecs 0.15 + gltf + glam |
| 序列化 | serde + serde_json |
| 错误处理 | thiserror + anyhow |
| 性能分析 | Tracy profiler（可选 feature） |
| Extension | VSCode Extension API + TypeScript + esbuild |
