# Neko Engine

> OpenNeko 的本地 Rust 媒体引擎，提供 GPU 渲染、FFmpeg 编解码、音频处理、媒体探测、导出与流式传输。

## 边界

- Rust 是媒体计算与运行状态的权威来源；TypeScript Extension 只负责 VS Code 生命周期、命令和 N-API 编排。
- 控制面通过 N-API 或 HTTP action dispatch 访问同一个 `EngineApi` 实例。
- 数据面通过嵌入式 HTTP/WebSocket 服务传输媒体流和已授权的预览文件。
- Engine workspace 只包含媒体能力，不包含 Model、Scene、Puppet、Device 或 ML runtime。标准 3D 文件的只读展示属于 `neko-preview` Webview，不属于 Engine 项目/runtime 能力。

## 当前包结构

```text
packages/
├── engine-types/   # 跨 crate 的 Action、资源与媒体 DTO
├── engine-codec/   # FFmpeg codec 基础设施
├── engine-audio/   # 音频解码、播放与流处理
├── engine-gpu/     # wgpu 上下文、纹理与渲染基础设施
├── runtime-media/  # probe、diff、字幕与图片编码
├── engine-kernel/  # 媒体领域服务与 facade
├── host-api/       # EngineApi、ActionRouter、Session 与资源注册表
├── host-http/      # axum HTTP/WebSocket 数据面
├── host-napi/      # napi-rs Node.js 绑定
├── host-cli/       # 独立 CLI
└── extension/      # VS Code Extension Host 集成
```

Rust workspace 的真实成员以根目录 `Cargo.toml` 为准；`scripts/check-media-closure.mjs` 和 `engine-kernel` 架构测试负责阻止已移除 runtime 或依赖回流。

## 运行路径

```text
VS Code Extension
  └─ NativeMediaEngine
       └─ host-napi
            └─ EngineApi / ActionRouter
                 ├─ engine-kernel
                 └─ embedded host-http
                      ├─ POST /v1/dispatch
                      ├─ GET  /v1/streams/:stream_id
                      ├─ GET  /v1/audio/:stream_id
                      └─ authorized preview/file routes
```

`host-napi` 通过全局 `OnceCell<Arc<EngineApi>>` 持有引擎实例。`neko.engine.stop` 会释放 Extension 侧包装层并停止 frame server，但不会销毁底层 Rust 单例；如需真正的 shutdown/reset，必须先增加显式 Rust 契约。

## 构建与验证

```bash
pnpm build
pnpm test
pnpm check:media-closure
cargo test --workspace
```

平台包通过以下命令构建：

```bash
pnpm package:platform -- --target darwin-arm64
pnpm package:platform -- --target linux-x64 --skip-native-build
```

非当前主机平台需要预先准备目标平台的 `.node` 文件；当前主机缺少绑定时，打包脚本会调用 `host-napi` 的 native build。
