# neko-engine 架构

## 系统定位

`neko-engine` 是 OpenNeko 的本地媒体计算核心。VS Code Extension Host 通过 N-API 访问 Rust `EngineApi` 单例；嵌入式 HTTP/WebSocket 服务负责媒体流和授权文件的数据传输。

该边界只拥有媒体能力。Model、Scene、Puppet、Device、Live compositor 与 ML runtime 已从 Rust workspace、路由和依赖闭包中移除。`neko-preview` 对 glTF/GLB 等标准文件的只读展示是独立 Webview 能力，不改变此边界。

## 分层与职责

| 层             | 包                                           | 职责                                                 |
| -------------- | -------------------------------------------- | ---------------------------------------------------- |
| Host adapter   | `extension`、`host-napi`、`host-cli`         | VS Code/Node/CLI 生命周期和调用适配                  |
| Transport      | `host-http`                                  | HTTP action dispatch、WebSocket 媒体流、授权文件服务 |
| Application    | `host-api`                                   | `EngineApi`、`ActionRouter`、Session、资源与流注册表 |
| Domain         | `engine-kernel`、`runtime-media`             | 媒体服务、probe、diff、字幕、图片与导出逻辑          |
| Infrastructure | `engine-codec`、`engine-audio`、`engine-gpu` | FFmpeg、音频、wgpu 与平台资源                        |
| Contract       | `engine-types`                               | 跨 crate Action、资源和媒体 DTO                      |

## 依赖方向

```text
extension (TypeScript) ──→ host-napi

host-napi ──→ host-api + host-http + engine-kernel + engine-types
host-cli  ──→ host-api + host-http + engine-types
host-http ──→ host-api + engine-kernel + engine-types
host-api  ──→ engine-kernel + runtime-media + engine-types

engine-kernel ──→ engine-codec + engine-audio + engine-gpu
              └─→ runtime-media + engine-types
engine-audio  ──→ engine-codec + engine-types
engine-codec  ──→ engine-types
engine-gpu    ──→ engine-types
runtime-media ──→ engine-types
```

依赖必须指向更低层或同一职责内的基础设施，不得重新引入已移除 runtime，也不得让 Transport/Application 反向依赖 Extension。

## 控制面与数据面

控制面：

```text
Extension Host
  └─ NativeMediaEngine
       └─ host-napi
            └─ EngineApi → ActionRouter → media controller/service
```

数据面：

```text
authorized consumer
  └─ host-http
       ├─ POST /v1/dispatch
       ├─ GET  /v1/streams/:stream_id
       ├─ GET  /v1/audio/:stream_id
       └─ preview/file token routes
```

Webview 只能消费 Extension 授权的 URL/token，不直接拥有工作区文件访问权。媒体帧走 WebSocket，避免在 Extension Host 中重复复制。

## 生命周期

- `host-napi` 使用全局 `OnceCell<Arc<EngineApi>>`，所有 bridge 入口必须共享该实例。
- `MediaEngineManager.disposeEngines()` 只释放 TypeScript wrapper。
- `stopFrameServer()` 只停止嵌入式 HTTP/WebSocket 服务。
- 当前没有隐式重建单例的 stop/start 语义；真正的 shutdown/reset 必须由 Rust 契约显式提供并测试。

## 关键路径

```text
媒体探测 → ActionRouter → runtime-media probe → ProbeResult
媒体播放 → stream controller → codec/audio pipeline → WebSocket
视频导出 → export service → GPU compositor → encoder/muxer → output file
```

## 架构门禁

- `cargo test --workspace`
- `pnpm check:media-closure`
- `engine-kernel/src/architecture_tests.rs` 检查 workspace、manifest 和 host router 中的已移除能力。
- 跨层 Action/DTO 变更必须同步生产者、消费者和路径级测试。
