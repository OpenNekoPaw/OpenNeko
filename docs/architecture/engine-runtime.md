# Engine Runtime 横切架构

更新日期：2026-06-15

Engine Runtime 是 OpenNeko 的媒体、音频、设备、ML、Scene、Puppet、Preview 和 GPU 权威层。TypeScript 层负责编排、展示、授权和消费，不复制 Engine 已拥有的权威计算。

## 设计目标

- 以 Rust sidecar/N-API/CLI 暴露统一运行时能力。
- 让视频、音频、模型、2D、互动创作共享媒体、GPU、设备和 ML 基础设施。
- 使用 `@neko/neko-client` 和 proto/wire contract 约束 TypeScript 调用面。
- 保持高频媒体和控制数据路径低延迟，避免 Extension Host 中继。

## 核心原则

- Engine authority：媒体、音频、设备、ML、Scene、Puppet、Preview、GPU 渲染和导出计算以 Rust Engine 为权威。
- Client-first：TypeScript 调 Engine 必须走 `@neko/neko-client`、EngineClient、proto/wire descriptor 或授权 stream client，不散落裸 endpoint。
- Contract-first：新能力先定义 proto/API/descriptor，再接 Host API、EngineClient、Extension/Webview。
- GPU-first：渲染、合成、色彩转换、编码前处理、Scene/Puppet/Preview 优先使用 GPU 管线。
- Zero-copy-first：视频/渲染路径优先避免 GPU->CPU readback；CPU fallback 必须标注性能和质量边界。
- Control/data split：控制面走 N-API/HTTP action；高频数据面走 WebSocket/stream/descriptor，避免 Extension Host relay。
- Shared shell, separate cores：2D、3D、Puppet、Scene 共享控制壳、协议、调度和 renderer boundary，数据模型按领域分核。
- Runtime-owned state：ECS world、stream registry、device session、ML session 等运行态属于 Engine，不写入项目事实。
- Host-authorized access：Extension Host 负责启动、端口、token、source 授权和生命周期；Webview 不自发现 Engine。

## 分层

| 层                | 典型包/crate                                                                       | 职责                                                               |
| ----------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Contract          | `neko-proto`, generated engine types                                               | 跨语言 IDL、descriptor、wire contract                              |
| Client            | `@neko/neko-client`                                                                | HTTP/WS dispatch、stream client、device client、wire normalization |
| Host API          | `host-api`, `host-http`, `host-napi`, `host-cli`                                   | Engine 能力暴露、HTTP/WebSocket/N-API/CLI                          |
| Kernel            | `engine-kernel`                                                                    | 服务编排、pipeline、preview、runtime service facade                |
| Runtime           | `runtime-scene`, `runtime-puppet`, `runtime-device`, `runtime-ml`, `runtime-media` | 领域运行时状态和服务                                               |
| Core              | `engine-gpu`, `engine-codec`, `engine-audio`, renderer crates                      | GPU、编解码、音频、Scene/Puppet/Panorama renderer                  |
| Shared Rust types | `engine-types`                                                                     | Rust 内部共享 DTO                                                  |

## 宿主模型

Engine 的默认部署模型是“一个 Host 应用 + 多个 runtime 包”。当前主路径可以由 Extension Host 通过 N-API 单例启动 Rust Engine，并按需暴露嵌入式 HTTP/WebSocket 数据面；CLI 或独立 sidecar 复用同一 Host API 语义。

```text
VS Code Extension Host / CLI
  -> host-napi or host-cli
  -> EngineApi singleton / host-api
  -> host-http data plane when streaming is needed
  -> engine-kernel + runtime-* + renderer/core crates
```

| 决策                     | 规则                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| Runtime 单独成包         | 领域状态、依赖、测试和 capability descriptor 能独立演进时，应有独立 crate/package 边界                 |
| Runtime 默认不单独成应用 | 共享 GPU、codec、device、auth、stream registry 和生命周期时，先共用 Host                               |
| 独立应用只按证据升级     | 只有实时性、许可证、崩溃隔离、安全权限、进程调度或部署需求明确成立时，runtime 才升格为独立 sidecar/app |
| Host 拥有生命周期        | 端口、token、source 授权、stream registry、session dispose、健康检查由 Host 管                         |
| Runtime 拥有运行态       | ECS world、device session、ML session、audio graph、stream producer 属于 runtime，不写项目格式         |

N-API、HTTP、WebSocket 和 CLI 是暴露方式，不是四套业务实现。新增能力先进入 Host API/contract，再按需要选择一种或多种传输形态。

## 控制面与数据面

```text
Control plane
  Extension Host
    -> N-API / HTTP dispatch
    -> host-api ActionRouter / controller
    -> runtime service

Data plane
  Webview / EngineClient
    -> authorized stream descriptor
    -> HTTP/WebSocket stream endpoint
    -> H.264 / PCM / fMP4 / scene delta / puppet delta
```

控制面负责创建资源、发送命令、查询状态、管理生命周期。数据面负责高频帧、音频包、scene delta、device event 和 preview stream。两者可以共享 session/resource ID，但不能把高频数据绕回 Extension Host。

Webview 数据面还必须遵守 VS Code 宿主限制：CSP 默认拒绝、HTML media codec 支持有限、`asWebviewUri(...)` 不应被当作大型媒体 Range 文件服务器。需要 duration、metadata、seek、container entry 或不兼容 codec fallback 的媒体，应由 Engine probe/register/stream 后返回授权 descriptor 或 diagnostic。

## 运行时域

| Runtime                          | 权威状态                                              | 主要输出                                             | 典型消费者                       |
| -------------------------------- | ----------------------------------------------------- | ---------------------------------------------------- | -------------------------------- |
| `runtime-media`                  | media source、stream session、timeline/playback state | H.264/fMP4/PCM stream、probe、frame extract          | Video、Preview、Agent perception |
| `runtime-audio` / `engine-audio` | audio graph、effect chain、recording、analysis        | PCM、waveform、loudness/silence、recording result    | Audio、Video、Live               |
| `runtime-device`                 | camera、mic、MIDI、gamepad stream/session             | device event stream、capture stream                  | Interactive、Live、Agent tools   |
| `runtime-ml`                     | ONNX/Whisper/CLIP/upscale/denoise sessions            | inference result、embedding、transcript              | Agent、Assets、Video、Audio      |
| `runtime-scene`                  | `.nkm profile: 2d \| 3d \| live` Scene world/profile state、scene graph、camera/light/actor control | scene render、viewport stream、profile diagnostics   | Model、Interactive、Live         |
| `runtime-puppet`                 | `.nkp profile: live2d \| neko-puppet` character runtime、adapter selection、parameter/motion/expression/tracking state | puppet delta、render stream、adapter diagnostics     | Puppet、Interactive、Live        |
| Preview runtime                  | preview route、variant、fov crop、proxy state         | preview artifact、stream descriptor                  | Preview、Canvas、Agent           |

运行时状态可以被投影为 descriptor、snapshot、delta 或 diagnostic，但不能直接成为 `.nk*` 项目事实。项目事实保存 source、command、asset ref 或 domain format；Engine runtime 可根据这些事实重建运行态。

### Runtime 边界判断

| 问题                       | 判断规则                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| 是否要拆独立 crate         | 有独立状态机、外部依赖、测试夹具、capability descriptor 或多个调用者复用时拆             |
| 是否要留在 `engine-kernel` | 与 GPU compositor、codec、timeline/export pipeline 强耦合且拆出会制造循环依赖时保留      |
| 是否要升格 sidecar/app     | 与 Host 共享生命周期成本过高，或存在许可证、崩溃隔离、权限、调度、部署证据时升级         |
| 是否要提供 adapter         | 第三方格式/SDK、平台授权或专有运行时不应污染 core runtime 时，用 adapter                 |
| 是否要暴露给 Agent/UI      | 暴露 descriptor、capability、diagnostic 和 typed command，不暴露内部 world 或裸 endpoint |

### 命名与能力分类

`runtime-puppet` 表示 `.nkp` Live2D/native Puppet 角色 runtime，不等于所有 2D 能力；`runtime-scene` 表示 `.nkm profile: 2d | 3d | live` Scene runtime，generic 2D Scene（sprite/tilemap/camera/light/parallax/particle/scene graph）也属于这里。对外能力可以按创作领域叫 2D、模型、互动或 Live，但内部 crate 名应反映运行时核心模型，避免把 Live2D、Spine、sketch layer、stage orchestration 和 3D scene 全塞进一个泛化 runtime。

## 权威范围

Engine 拥有：

- 媒体探测、解码、编码、导出、diff 和二进制文件访问。
- H.264、PCM、fMP4、preview variant 和 stream descriptor。
- 大型媒体、container entry、sibling resource 和需要 byte range/seek 的源文件访问。
- GPU 渲染、Scene/Viewport/Puppet runtime 和 renderer。
- Audio runtime、effect、recording、loudness/silence 分析。
- Device runtime、camera/mic/MIDI/gamepad 等设备事件流。
- ML runtime、ONNX/Whisper/CLIP/denoise/upscale 等本地推理入口。

TypeScript 可以请求、展示、校验和编排这些能力，但不能在功能包内建立平行权威实现。

## GPU 与 Zero-copy 约束

GPU-first 不表示完全没有 CPU，而是要求每个 CPU fallback 有明确边界。

| 路径                  | 优先策略                                            | 不推荐                            |
| --------------------- | --------------------------------------------------- | --------------------------------- |
| 视频解码到预览        | 硬件解码 + GPU texture + stream/WebCodecs           | 每帧 CPU readback 后再传 Webview  |
| Timeline/Preview 合成 | wgpu compositor + GPU color conversion              | TS/Canvas 复制 Engine 合成逻辑    |
| Scene/Model 渲染      | Engine renderer 输出 stream/texture/descriptor      | Webview 自建权威渲染状态          |
| Puppet/Live2D 渲染    | Engine puppet runtime/renderer 输出 delta 或 stream | Extension Host 代理 60fps 帧      |
| Export                | GPU render + hardware encoder + mux                 | 预览缓存冒充最终导出 source       |
| ML preprocess         | GPU 可用时走 GPU bridge，保持 bounded CPU copy      | 无界 base64/CPU buffer 在层间传递 |

Zero-copy 优先级：

1. GPU texture / platform surface / hardware decoder surface。
2. Engine 内部 GPU pipeline 直接消费。
3. 编码或 stream descriptor 输出。
4. 必要时 bounded CPU readback，并记录 fallback reason。

CPU fallback 适合 probe、metadata、轻量文档处理、小图缩略图、测试 fake；不适合作为高频视频、Scene、Puppet 或导出主路径的默认实现。

### 0-copy 设计细则

| 场景                | 允许的边界                                                         | 必须记录                                                     |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| 交互 viewport       | GPU texture -> renderer -> stream/WebCodecs                        | stream codec、latency target、fallback reason                |
| Timeline preview    | GPU compositor -> stream/fMP4/H.264                                | source revision、effect graph hash、proxy/preview quality    |
| Scene/Puppet render | runtime snapshot/delta -> renderer -> stream 或 GPU frame          | world revision、renderer profile、dropped frame/backpressure |
| Export              | domain refs -> GPU render -> hardware encode -> mux -> file source | export profile、codec、quality、source lineage               |
| Agent perception    | source/ref -> bounded frame/audio/sample extraction -> ML/evidence | locator、sample policy、byte/duration limit                  |
| Test/headless       | synthetic source 或 CPU fake                                       | fake boundary，不能冒充生产性能路径                          |

CPU readback 只在跨进程/跨 API 缺少 surface sharing、需要缩略图/诊断样本、或 provider/ML 输入只能接收 CPU bytes 时使用。读回必须有大小、频率和生命周期限制；不能把 base64、Webview blob、临时文件或 unbounded ArrayBuffer 当作跨层数据通道。

## GPU 预算与性能

Engine 可以同时承担交互预览、导出、后台转码、模型渲染和 ML 推理。资源竞争必须显式建模。

| 优先级          | 场景                                             | 策略                           |
| --------------- | ------------------------------------------------ | ------------------------------ |
| Interactive     | 当前用户正在看的 preview、viewport、live control | 最高优先级，尽量不阻塞         |
| Export          | 用户触发的最终导出                               | 可排队，不能静默降质           |
| Background      | proxy、thumbnail、semantic sidecar、批量转码     | 可暂停、降分辨率、降帧率或延后 |
| Diagnostic/Test | probe、fixture、mock stream                      | 不抢占交互资源                 |

性能信号优先使用 frame time EMA、queue completion latency、active pipeline count、encoder/decoder pool pressure、stream backpressure。不要把 CPU readback 当作“降低 GPU 压力”的默认方案；许多场景中 readback 会同时增加 GPU stall 和 CPU 内存压力。

预算响应应区分“降低后台吞吐”和“降低最终质量”。后台 proxy、thumbnail、semantic sidecar 可以暂停、降分辨率或延后；用户触发的最终导出不能静默降质，只能排队、提示或返回 diagnostics。交互预览可以 drop frame 或降低 preview profile，但不能改写项目事实或导出参数。

## 2D、3D、Live2D 与 Scene/Puppet

Engine 对 2D/3D 采用“共壳分核”：

```text
Shared shell
  contract / client / host-api / session / stream / command / diagnostics
        |
        v
Separate cores
  runtime-scene  -> .nkm 2D/3D/Live Scene graph, camera, light, actor staging
  runtime-puppet -> .nkp Live2D/native Puppet character, parameter, mesh, expression
  sketch/domain  -> 2D layer/project facts, when needed projected to Engine
        |
        v
Renderer boundary
  engine-scene-renderer / engine-puppet-renderer / engine-gpu
```

### 共享什么

| 共享对象                                    | 原因                              |
| ------------------------------------------- | --------------------------------- |
| action/command envelope                     | TS 和 Agent 不关心内部 world 类型 |
| stream descriptor                           | Webview 统一消费授权 stream       |
| session/resource registry                   | 生命周期、授权、dispose 统一      |
| diagnostics/probe/capability descriptor     | UI、Agent、测试可以用同一投影     |
| transform/blend/snapshot 等算法形状         | 可用 trait/generic 抽象复用       |
| GPU budget、device queue、renderer boundary | 避免各 runtime 独立抢资源         |

### 不强行统一什么

| 不共享对象                                  | 原因                 |
| ------------------------------------------- | -------------------- |
| 3D/2D Scene graph 与 Puppet parameter binding | authoring 真值不同   |
| glTF/VRM/Scene loaders 与 MOC3/Live2D loaders | 文件结构和语义不同   |
| 3D skinning 与 2D mesh/deformer             | GPU/CPU 数据布局不同 |
| Scene material/PBR 与 Puppet drawable state | 渲染语义不同         |
| `.nkm`、`.nkp`、`.nks` 项目格式             | 领域事实不同         |

LLM/Agent 意图层不应硬编码“如果是 3D 则调用 X”。Agent 选择 tool/capability 后，由 domain metadata、Engine descriptor 或领域 adapter 路由到 Scene/Puppet/Media runtime。

### Live2D、Spine 与第三方 adapter

| 能力                | 放置                                           | 规则                                                                           |
| ------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| Neko 原生 Puppet    | `runtime-puppet` / `neko-puppet-native`        | 拥有 Bone2D、BlendShape、参数、动画和可测试导出路径                            |
| MOC3 导入/兼容      | `runtime-puppet/moc3` / `live2d-moc3-compat`   | 当前实现是基于公开格式理解的 clean-room compatibility，不是官方 Cubism SDK     |
| Live2D 官方 SDK 播放 | optional `live2d-cubism` adapter               | SDK 许可证、平台打包和渲染生命周期不进入 public DTO；未启用时返回稳定 diagnostic |
| Spine/其他 2D SDK   | 独立 adapter                                   | 通过 adapter contract 接入 stage/compositor，不改变原生 puppet 数据模型        |
| 互动舞台            | `runtime-stage` 或领域 runtime                 | 编排 scene、puppet、device、audio、trigger 和 script，不替代 scene/puppet core |

第三方 adapter 可以暴露统一 command、descriptor、stream 和 diagnostic，但不能把第三方 SDK 类型穿透到 `engine-types`、`neko-client`、Proto、Webview message 或领域项目格式。需要持久保存时，应保存 source、import settings、adapter id/version 和可复建的领域 refs。当前底层 `live2d-moc3-compat` 路径不是官方 Live2D Cubism SDK；官方 SDK 只能通过 optional、feature-gated `live2d-cubism` adapter 接入，且 unavailable 时必须报告 `cubism-adapter-unavailable`，不能冒充已启用 Cubism。

### 渲染输出模型

| 输出                       | 用途                                                       | 约束                                        |
| -------------------------- | ---------------------------------------------------------- | ------------------------------------------- |
| render stream              | Webview viewport、live preview、Agent perception sampling  | session-scoped，必须授权                    |
| delta stream               | Puppet parameter、scene control、device event 等低带宽状态 | 有 revision 或 timestamp，消费者可丢旧帧    |
| GPU frame / texture handle | Engine 内部 compositor、export、live mixing                | 不穿透 TS DTO                               |
| snapshot/diagnostic        | UI inspector、Agent evidence、测试断言                     | compact、可序列化，不代表完整 runtime world |
| exported source            | 最终输出或可入库素材                                       | source-first，进入 Asset/Resource ingest    |

Scene/Puppet renderer 应从 runtime 取得 snapshot、delta 或 RenderWorld/DeformedMeshes 这类渲染输入，而不是在渲染期间长期锁住 live ECS world。实时流慢于 tick 时优先丢旧快照，保证交互响应。

## ECS 与 OOP 边界

Engine 内部可以同时使用 ECS 和 OOP/trait service，但两者职责不同。

| 模式          | 适用                                                          | 边界                                    |
| ------------- | ------------------------------------------------------------- | --------------------------------------- |
| ECS world     | Scene/Puppet 中大量实体、组件、动画、变更检测、查询           | runtime crate 内部拥有，不暴露到 TS DTO |
| Trait service | `ISceneService`、`IPuppetService`、media/audio/export service | host-api/controller 调用稳定接口        |
| Registry      | Resource/Stream/Session/Effect/Device registry                | 管理生命周期和 ID                       |
| Facade        | `EngineApi`、EngineClient                                     | 对外隐藏内部 runtime 复杂性             |
| DTO/Proto     | action、descriptor、snapshot、delta                           | 跨语言契约，不承载业务逻辑              |

### Creative API 与 Data API

Scene/Puppet 内部允许双 API，但调用权限必须清晰。

| API            | 面向                   | 典型操作                                                                            | 调用者                                        |
| -------------- | ---------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------- |
| Creative API   | 用户意图和可撤销编辑   | load、select、transform、play animation、set parameter、apply command               | host-api controller、Agent tool、领域 adapter |
| Data API       | ECS 批量数据和渲染提取 | query components、extract render world、bulk deform、procedural edit、snapshot diff | runtime 内部、renderer extract、建模子系统    |
| Service facade | 跨 crate 稳定入口      | create session、dispatch command、stream、snapshot、diagnostics                     | host-api、EngineApi                           |
| DTO/proto      | 跨语言投影             | action body、stream descriptor、delta、diagnostic                                   | TypeScript、Webview、Agent                    |

Creative API 写操作应带 revision、undo 或 command trace 语义。Data API 可以为性能暴露 typed ECS 操作，但必须留在 runtime crate 内部或受限模块；不要把 `World`、component 类型、renderer 内部 buffer 或 glam/bevy 类型透出到 TypeScript DTO。

### 计算与渲染分离

```text
runtime world
  -> tick / command / simulation
  -> extract render snapshot
  -> renderer consumes snapshot
  -> stream / GPU frame / export
```

计算层拥有 live world；渲染层消费快照或渲染输入。这样用户编辑、Agent 命令、device 驱动和 renderer 不需要争用同一把 world 锁。实时路径可以 latest-wins；导出路径必须按确定性 frame/order 消费。

Bevy 复用边界：

- 可以复用窄基础 crate，例如 `bevy_ecs` 的 World/Component/Query/change detection。
- Neko 拥有 lifecycle、schedule、renderer、viewport、window、asset loading、host integration。
- 不把 Bevy App、Bevy renderer、AssetServer、window/plugin runtime 引入 Neko Engine 主架构。
- Bevy 代码可作为算法参考；落地到 Neko-owned crate，并有 Neko contract 和测试边界。

## 数据流

```text
Extension Host
  -> ensure engine / authorize source
  -> EngineClient action or stream descriptor
  -> host-api / runtime / kernel
  -> renderer / codec / audio / device / ML
  -> descriptor or result projection
  -> Webview stream client or Extension projection
```

### 典型链路

| 链路          | 数据流                                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| 交互预览      | Extension 授权 source -> EngineClient 获取 stream descriptor -> Webview stream client -> WebCodecs/Canvas |
| Scene Route A | Webview 消费 Engine stream/control -> authoring panels 输出 Engine commands -> runtime-scene 更新 world   |
| Puppet/Live2D | load puppet source -> runtime-puppet world -> renderer/delta stream -> Webview 或 Live control            |
| 导出          | project/domain refs -> Engine source -> GPU render -> hardware encode -> mux -> output source             |
| Device live   | Host 授权 device -> runtime-device session -> event/capture stream -> Live/Interactive                    |
| ML perception | source/ref -> runtime-ml preprocess/inference -> bounded evidence -> Agent/Search/Assets                  |

## Client 与 API 演进

`@neko/neko-client` 是 TypeScript 调用 Engine 的主入口。功能包、Agent 工具和 Webview 流客户端不应直接拼 HTTP path、WebSocket URL 或 wire parser。

| 新能力类型           | API 顺序                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| 单次查询/控制        | proto/API/descriptor -> host-api action/controller -> EngineClient method -> Extension/Webview/Agent adapter |
| 高频流               | stream descriptor -> stream registry -> host-http/WebSocket endpoint -> typed stream client                  |
| 设备输入             | host authorization -> runtime-device session -> event/capture descriptor -> consumer client                  |
| Scene/Puppet control | command envelope -> runtime service -> revision/delta/diagnostic -> stream or snapshot projection            |
| 导出/长任务          | action request -> task/progress contract -> output source -> Asset/Resource ingest                           |

EngineClient 可以做 wire normalization、retry、descriptor validation 和 convenience URL 生成，但不能拥有 Engine 业务逻辑。若某个功能包需要新 Engine 能力，先补 contract 和 client surface，再接 UI。

## 不变量

- 新 Engine 能力先定义 proto/API/descriptor，再补 `EngineClient`，最后接 Extension/Webview。
- 功能包不散落 Engine HTTP endpoint、裸 WebSocket URL 或 ad hoc wire parser。
- Extension Host 负责启动、授权、端口、token、资源访问和生命周期；不代理高频视频帧、PCM 包或 scene delta。
- Webview 只消费授权后的 stream/device/client，不能自己发现或授权 Engine。
- GPU-first 和 zero-copy 是媒体与渲染路径优先方向；CPU fallback 要显式标注边界。
- 低延迟交互 Scene stream 优先短 GOP，必要时 GOP=1；Timeline、Puppet、Preview 等路径可以有不同 GOP 目标。
- Route A 场景中，Webview 消费 Engine canvas/stream/control，authoring panels 输出 Engine commands。
- GOP=1 只适合低延迟交互 Scene/Viewport，不是所有编码输出的全局规则。
- Engine stream/token/port 是运行时句柄，不能写入项目格式、Agent durable payload 或 package manifest。
- Runtime world 不能越过 DTO/descriptor 直接暴露给 TypeScript。
- Extension Host 不能 relay 高频视频帧、PCM 包、Puppet delta 或 Scene delta。
- Engine fallback、降级和预算响应必须返回 diagnostics，不能静默降低最终导出质量。

## 输出与持久化

| 输出                     | 是否持久                     | 规则                                      |
| ------------------------ | ---------------------------- | ----------------------------------------- |
| stream descriptor        | 否                           | 当前 session 使用，包含授权和 endpoint    |
| Engine token / stream id | 否                           | 运行时句柄，不能写项目事实                |
| preview variant / proxy  | 否，除非显式提升             | 属于 cache 或 draft quality               |
| exported file            | 是，作为新 source            | 需要通过 ingest/import 进入项目或素材库   |
| probe metadata           | 可作为摘要                   | source/fingerprint 变化后 stale           |
| scene/puppet snapshot    | 可作为诊断或领域格式输入     | 持久格式由领域包定义                      |
| ML evidence              | 可作为 Search/Agent evidence | 必须保留 source/locator/provider metadata |

最终导出、打包和校验默认 source-first，不使用 preview cache、proxy、Webview URI 或 runtime token 充当原始素材。

## 反模式

| 反模式                                | 风险                               | 正确边界                           |
| ------------------------------------- | ---------------------------------- | ---------------------------------- |
| Webview 自己发现 Engine endpoint      | 绕过授权和生命周期                 | Extension Host 授权 stream/client  |
| 功能包手写 Engine HTTP endpoint       | wire contract 分裂                 | 走 `@neko/neko-client`             |
| Extension relay 60fps 帧或 PCM        | Node 层复制和卡顿                  | Webview 直连授权数据面             |
| TypeScript 复制媒体/Scene/Puppet 计算 | 双权威和行为漂移                   | Rust Engine 为计算权威             |
| 把 GPU readback 当优化                | 增加 stall 和 CPU 压力             | 优先 GPU pipeline/zero-copy        |
| 强行统一 2D/3D 数据模型               | 上帝组件和无效抽象                 | 共壳分核，trait 共享算法           |
| 引入 Bevy App/renderer ownership      | Neko lifecycle 被外部 runtime 接管 | 只复用窄 crate 和算法              |
| GOP=1 用于所有流                      | 文件体积和编码效率失控             | 只用于低延迟交互流                 |
| preview/proxy 当最终导出 source       | 质量和可追溯性错误                 | source-first export/package/verify |

## 与创作领域的关系

- 视频使用 Engine probe、diff、stream、export 和 quality analysis。
- 音频使用 Engine audio stream、effect、recording 和 device runtime。
- 模型使用 Scene/Viewport renderer、scene control、model preprocess 和 diagnostics。
- 2D 使用 Puppet runtime、renderer、stream 和导出。
- 互动使用 Scene/device/audio/media runtime 与 live control。

## 吸收的稳定主题

本设计吸收以下历史主题的稳定部分：

- Neko Engine architecture
- Runtime layering and host model
- four-layer contract / audit
- engine kernel decoupling
- pipeline sink and GPU-only rules
- preview subsystem
- file access
- effect registry
- GPU budget
- dual API / scene split
