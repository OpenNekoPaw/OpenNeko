# ADR: Agent 驱动模型与 Avatar 只读预览运行时边界

- 状态：Accepted
- 日期：2026-07-19
- 范围：`neko-preview`、`neko-agent`、共享类型契约、VS Code Webview、Live2D、VRM、GLB/glTF、MMD、TTS/STT 与 Three.js/PixiJS 运行时。
- 实施状态：仅确立架构决策；具体功能必须通过独立 OpenSpec 变更实施和验收。

本文记录 OpenNeko 对 Live2D、VRM、GLB/glTF 和 MMD 模型预览、Agent 动作/语音驱动及渲染运行时的稳定边界。它补充 [`package-boundaries.md`](package-boundaries.md)、[`webview-media-security.md`](webview-media-security.md)、[`agent.md`](agent.md) 和 [`adr-agent-directed-creative-orchestration-and-domain-capability-boundary.md`](adr-agent-directed-creative-orchestration-and-domain-capability-boundary.md)。现有标准 3D 模型预览基线已归档于 [`../../openspec/changes/archive/2026-07-18-add-standard-3d-model-preview/`](../../openspec/changes/archive/2026-07-18-add-standard-3d-model-preview/)；本文不静默扩大该基线的格式范围或把尚未实现的动画播放描述成现有能力。

## 背景

OpenNeko 已在 `neko-preview` 中提供 GLB、glTF、OBJ、STL 和 PLY 的标准 3D 模型只读预览，并通过独立 Three.js Webview 管理临时 camera、light、transform 和 Agent 视觉上下文。新的产品需求是：

1. 预览 Live2D 角色，但不修改或写回模型源文件；
2. 允许 Agent 根据模型真实能力驱动动作、表情、视线和口型；
3. 判断是否同时支持 VRM、MMD，以及 Three.js 在这些格式中的职责；
4. 让 Agent 通过一个统一上层协议驱动 Live2D、VRM 和具备动画的 GLB/glTF，但不假设所有格式拥有相同能力；
5. 复用现有 TTS 并明确 STT、语音播放和 lip sync 的职责边界；
6. 可以参考 Project N.E.K.O 的用户体验和运行行为，但不复制其全局脚本、定制压缩 bundle 或桌面宿主结构。

“只读预览”与“完全静态展示”不是同一概念。源模型、贴图、动作清单和 manifest 可以保持只读，同时预览实例仍可拥有临时、可丢弃的动作播放状态。若不区分这两个边界，就会在 Preview 内引入隐式项目格式、把 Agent 状态当成模型事实，或让 Webview/Agent 直接依赖具体渲染器对象。

## 决策摘要

OpenNeko 采用以下格式和运行时优先级：

| 格式        | 渲染运行时                                                            | Three.js 边界                           | 决策                                                        |
| ----------- | --------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------- |
| Live2D      | PixiJS/WebGL + Live2D Cubism Core + typed adapter                     | Three.js 不参与 Live2D 渲染             | P0，首先实现                                                |
| VRM         | Three.js `GLTFLoader` + `@pixiv/three-vrm`                            | 作为 glTF 插件扩展现有 3D 路径          | P1，独立后续变更                                            |
| MMD         | 独立 MMD loader、animation 与 physics 运行时                          | 当前 Three.js 版本不再提供官方 MMD 模块 | P2，默认不支持，按真实需求重新评估                          |
| GLB/glTF    | Three.js `GLTFLoader`，动画播放需要 `AnimationMixer` 等实例级 runtime | 继续作为标准 3D 预览 canonical path     | 静态预览已支持；动作驱动必须独立增加 capability 与 playback |
| OBJ/STL/PLY | Three.js addons                                                       | 继续作为固定 allowlist                  | 已支持，不被本文替换                                        |

OpenNeko 不为该能力引入 Unity。渲染继续运行在 VS Code Webview 的浏览器图形环境中；Extension Host 负责资源授权、实例生命周期和协议路由，Agent 通过 typed capability 操作预览实例。

## 源只读与运行时可变状态

Avatar Preview 必须区分两类状态：

| 状态类别     | 示例                                                                                                                                                    | 生命周期与权威                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 源事实       | Live2D model JSON、textures、motions、expressions；VRM humanoid、expressions、spring bones；GLB/glTF clips、skeleton、morph targets；source fingerprint | 来源文件只读，由授权资源和源 fingerprint 证明 |
| 临时运行状态 | 当前动作、表情权重、视线目标、语音/口型播放、播放队列、临时 camera/background                                                                           | 单个预览实例拥有，面板关闭或模型重载后可丢弃  |

预览动作不得：

- 修改、覆盖或 dirty 原始模型文件；
- 创建 sidecar、scene、puppet 或其他持久项目格式；
- 把动作播放后的参数值宣称为模型源事实；
- 在关闭预览面板后继续隐式运行；
- 回退到当前 active panel 或共享全局 renderer 模拟多个实例。

如果未来需要脱离编辑器面板持续存在的桌面角色、跨会话动作编排、可编辑动画时间线或可保存的角色动画项目，该能力不再属于只读 Preview，应由新的明确 Avatar runtime owner 通过独立 ADR/OpenSpec 承担；不得恢复已删除的 Puppet 产品作为默认 owner。

## Canonical 调用链

```text
用户目标
  -> Agent 读取目标预览实例的 ModelPerformanceDescriptor
  -> Agent 选择 descriptor 中真实存在的语义动作
  -> Agent runtime 校验 Tool/capability schema 与当前策略
  -> Preview Extension 校验 instanceId、sourceFingerprint、revision
  -> Extension 通过 identity-bearing message 路由到准确 Webview
  -> Webview 的格式 adapter 执行临时动作
  -> Webview 返回 correlated result / diagnostic 与新 runtime revision
  -> Agent 观察真实结果并决定下一步
```

禁止以下平行路径：

- Agent 直接访问 PixiJS、Three.js、Cubism 或 Webview 全局对象；
- Agent 直接发送 descriptor 未声明的 Live2D parameter、VRM bone、glTF morph/clip 或 renderer object；
- Webview 直接导入 Agent runtime、VS Code API 或工作区文件系统；
- Preview 为动作请求选择 AI provider、模型或外部上传目的地；
- Extension/Agent 在缺失 identity 时回退到当前活动预览；
- Rust Media Engine 承担 Avatar 模型、动作或 scene 权威。

## 责任与依赖边界

### Preview Extension

Preview Extension 是只读预览实例的 host owner，负责：

- 注册只读 editor/provider 与每面板独立 session；
- 授权入口模型及其精确依赖资源，并使用 `webview.asWebviewUri()` 投影；
- 持有 `previewInstanceId`、source fingerprint、runtime revision、取消域和 disposables；
- 从 Webview 获取经过验证的 capability descriptor；
- 将 Agent operation 路由到准确实例并返回 correlated result/diagnostic；
- 面板关闭、模型重载或请求取消时停止动作并释放资源。

Extension 不解析或模拟 Live2D/VRM/glTF/MMD 的渲染状态，不保存 renderer object，也不把 Webview URI 或绝对用户路径暴露给 Agent。

### Preview Webview

Webview 负责浏览器图形运行时、模型加载、临时动作状态和 GPU 资源释放：

- Live2D 使用独立 `live2d.html` 入口及 Pixi/Cubism adapter；
- 现有标准 3D 与未来 VRM 使用 `model.html`/Three.js 路径；
- video、audio、document、standard model 和 Live2D entry 不得无条件执行彼此的渲染依赖；
- 所有网络式资源请求必须解析到 Extension 精确授权的 URI；未知依赖、外部 URL 和目录探测必须失败可见；
- Webview 只能通过版本化 `postMessage` 协议接收操作并回传结果。

Live2D adapter 隔离 Pixi/Cubism 版本和模型差异；VRM adapter 隔离 `@pixiv/three-vrm` 对 Three scene graph 的扩展；glTF adapter 隔离 `AnimationMixer`、clip、skeleton 和 morph target。共享协议不得泄漏任一渲染器的运行时类型。

### Agent

Agent 负责理解用户意图、读取实例能力和选择语义操作，不拥有 renderer、模型参数或播放状态。Model Performance capability 必须来自 owning Preview contribution，而不是 Agent core 的格式枚举或硬编码 Avatar workflow。

Agent 必须先读取目标实例的能力描述，再选择当前模型真实存在的动作或表情。若 capability 缺失、实例过期或模型不支持请求，Agent 应观察明确 diagnostic，并调整策略或向用户说明，不能臆造名称或把 no-op 当成成功。

### 共享契约与 Engine

共享层只定义最小、序列化、identity-bearing 的 capability descriptor、operation request/result 和 diagnostic contract。它不依赖 PixiJS、Three.js、Cubism、VRM 或 MMD 类型。

Rust Engine 继续只承担保留的媒体计算职责。Avatar Preview 不恢复已裁剪的 Engine Model/Scene/Puppet API，也不增加 Webview -> Engine 的 Avatar 渲染旁路。

## 统一 Agent Performance 契约

Agent 使用同一份 identity-bearing Performance 协议驱动不同模型格式，但 capability descriptor 是按实例生成的可选能力集合，不是所有模型都必须实现的统一大接口。最小 descriptor 包含实例/源 identity、format、revision，以及当前模型真实暴露的 capability groups：

| Capability group | 内容                                                                                |
| ---------------- | ----------------------------------------------------------------------------------- |
| `clips`          | 可播放 motion/animation clip 的稳定 action identity、label、duration 和可选语义 tag |
| `expressions`    | 可用 expression/表情 identity、混合与互斥约束                                       |
| `lookAt`         | 是否支持视线目标及坐标空间                                                          |
| `speech`         | 是否支持语音播放、`amplitude`、`phoneme-timed` 或 `viseme-timed` lip sync           |
| `poses`          | 格式明确支持时暴露的 pose/humanoid 能力                                             |
| `parameters`     | 仅显式 allowlist 的高级参数、范围和默认值                                           |

统一协议只暴露稳定、可组合的语义操作：

| 操作语义               | 行为                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `describeCapabilities` | 返回当前实例支持的动作、表情、视线、口型和可选高级参数能力                                |
| `playAction`           | 按 descriptor 中的稳定 action identity 播放已有 Live2D motion、VRM animation 或 glTF clip |
| `setExpression`        | 按 descriptor 中的稳定 expression identity 设置或混合表情                                 |
| `lookAt`               | 设置预览局部坐标或归一化屏幕坐标中的视线目标                                              |
| `playSpeech`           | 播放已授权的 audio `ResourceRef`，并按 descriptor 声明的 lip-sync 等级驱动本地 runtime    |
| `stop` / `reset`       | 停止当前动作或恢复模型默认临时状态                                                        |

低层参数控制不作为默认 Agent 能力。只有模型 capability descriptor 明确暴露 allowlist、范围、默认值和互斥约束时，Agent 才能发送受约束的参数操作；未知 parameter、bone、motion、expression 或 hit area 必须拒绝。

每个实例级 request 至少携带：

- `previewInstanceId`；
- `sourceFingerprint`；
- `expectedRuntimeRevision`；
- operation correlation identity；
- 明确的 replace、enqueue 或 cancel 语义。

每个 result 返回 correlated identity、执行状态、新 runtime revision 和可观察 diagnostic。缺失、陈旧或不匹配的实例身份必须 fail-visible，不能改用 active instance。

同一预览实例串行拥有动作队列和临时状态；不同实例不得共享可变 renderer、motion queue、expression state 或全局 active model。并发设计优先使用实例隔离、消息传递和不可变 descriptor，不使用锁维持共享单例。

### 跨格式能力差异

| 模型类型      | 可可靠统一驱动的能力                                            | 必须暴露的限制                        |
| ------------- | --------------------------------------------------------------- | ------------------------------------- |
| Live2D        | manifest 中的 motions、expressions、lookAt、lip sync            | 只使用模型实际声明的 action/parameter |
| VRM           | expressions、lookAt、humanoid pose、lip sync 和已注册 animation | 未提供 animation/pose 时不得臆造动作  |
| 动画 GLB/glTF | 内嵌 animation clips、skeleton animation、显式 morph targets    | clip/morph 名称通常没有标准语义       |
| 静态 GLB/glTF | model transform、camera framing 等预览操作                      | 不暴露角色动作、表情或 lip sync       |
| OBJ/STL/PLY   | model transform、camera framing                                 | 不具备骨骼、clip 或表情能力           |
| MMD           | 仅未来 adapter 审计通过后按 descriptor 暴露                     | 当前不注册为可执行格式                |

用户要求“挥手”“高兴”或“说话”时，Agent 必须从 descriptor 中选择明确匹配的 action/expression/speech 能力。若 descriptor 不提供匹配项，返回 unsupported diagnostic；不得用模型 transform、随机 clip、猜测 bone/morph 或成功 no-op 冒充完成。

格式标准提供的语义优先于猜测：VRM 使用其标准 humanoid/expression 语义，Live2D 使用 manifest 中的 motion/expression identity，glTF 使用内嵌 clip/morph 的准确 identity。普通 GLB/glTF 若只有 `Animation_0`、`Take 001` 等不透明名称，系统只能把它们作为可精确选择但语义未知的 action；需要自然语言动作映射时，应由显式模型 metadata 或用户确认的映射提供，不把启发式名称匹配写成持久模型事实。

## 格式与渲染器决策

### Live2D

Live2D 不通过 Three.js 实现。首期采用 PixiJS/WebGL 与 Live2D Cubism Core，并在 Webview 内提供 typed adapter。可参考 [Project N.E.K.O](https://github.com/Project-N-E-K-O/N.E.K.O) 的模型加载、动作选择、表情和交互体验，但不得直接复制其定制 `pixi-live2d-display` 压缩 bundle、全局脚本加载顺序或 Electron/Python 宿主耦合。

实施 OpenSpec 必须审计并固定实际使用的 `pixi-live2d-display` 上游或维护 fork、PixiJS 版本、Cubism Core 分发方式、CSP、license notice、source map 和供应链来源。第三方 bundle 不得作为未审计二进制直接进入仓库。

### VRM

VRM 是 P1 推荐能力，但不是 Live2D 的依赖。VRM 建立在 glTF 上，使用 Three.js `GLTFLoader` 注册 `@pixiv/three-vrm` 的 `VRMLoaderPlugin`，并将 humanoid、expressions、lookAt 和 spring bones 映射到同一个 Agent 语义动作契约。

VRM 必须通过独立 OpenSpec 接入，复用现有 `model.html`、Three runtime port、GLTF source inspection、URI projection、panel isolation 和 recursive disposal。不得把 VRM 偷渡进现有固定格式 allowlist，或为它增加第二套 3D scene/runtime owner。

### GLB/glTF

GLB/glTF 继续使用现有 `model.html` 和 Three.js canonical path。当前标准模型预览只归一化 animation count，并未因此承诺 clip playback；Agent 动作驱动需要在独立变更中为每个面板建立 `AnimationMixer`、clip catalog、播放队列、取消和 recursive disposal，并通过统一 Performance descriptor 暴露真实能力。

普通 GLB/glTF 是通用 3D 容器，不天然等于 Avatar。具备 skeleton、morph target 或 animation clip 只证明模型可被相应机制驱动，不证明它具有“挥手”“微笑”“说话”等标准语义。Preview 不根据 mesh/bone/morph 名称静默构造 Avatar 能力，也不为静态模型生成虚假 motion/expression catalog。

VRM 是 glTF 的语义化 Avatar 扩展，因此复用底层加载、URI 授权和 Three runtime，但由 VRM adapter 提供标准 humanoid、expression、lookAt 和 spring-bone 语义；通用 glTF adapter 不反向依赖 VRM。

### MMD

MMD 默认不进入首期或 VRM 变更。Three.js 官方从 r170 开始弃用 MMD modules，并要求在 r172 前迁移；OpenNeko 当前 Three.js 0.180 路径不能宣称原生支持 `MMDLoader` 或 `MMDAnimationHelper`。

未来只有在存在真实 PMX/PMD + VMD/VPD 用户资产需求，并完成以下审计后，才可单独提出 MMD OpenSpec：

- loader 与 parser 的维护状态、版本兼容和许可证；
- Shift-JIS、纹理、toon/sphere map 和多文件依赖解析；
- IK、grant、morph、camera/audio motion 与动作合成；
- Ammo/Bullet 或其他 physics/WASM 的 CSP、供应链、性能和释放；
- 模型、动作、音乐和派生内容的独立授权；
- 与 Live2D/VRM 共享语义 contract、但不共享 renderer state 的 adapter 边界。

MMD 的存在不能迫使标准 3D、VRM 或 Live2D entry 加载 physics/WASM 依赖。

## TTS、STT、语音播放与 Lip Sync

TTS 和 STT 不是 Preview renderer 的子能力。Agent/媒体与感知 owner 负责选择并调用 provider；Preview 只消费已授权的音频资源和可选 timing metadata，驱动当前模型实例播放和 lip sync。

### TTS 与 `playSpeech`

OpenNeko 复用现有异步 `GenerateTTS` 媒体能力，不在 Live2D、VRM 或 glTF adapter 中实现另一套 TTS client、模型选择或凭据管理。canonical path 是：

```text
Agent text
  -> owning GenerateTTS capability
  -> async media Task
  -> audio ResourceRef + lineage + optional timing metadata
  -> Preview playSpeech
  -> Webview-local audio playback and LipSyncDriver
```

Agent 只发出一次高层 `playSpeech` operation，不逐帧发送 mouth/viseme 参数。Webview-local `LipSyncDriver` 在渲染循环内更新格式 adapter：Live2D 映射到经过 descriptor 允许的 mouth parameters，VRM 映射到标准 viseme/expression，glTF 仅在显式声明 morph mapping 时驱动嘴型。

Speech capability 必须声明实际质量等级：

| 等级            | 语义                                                   |
| --------------- | ------------------------------------------------------ |
| `audio-only`    | 只播放音频，模型不具备可验证的嘴型控制                 |
| `amplitude`     | 根据音频包络驱动开合，不宣称音素级准确                 |
| `phoneme-timed` | 消费明确的音素时间轴并映射到模型 mouth capability      |
| `viseme-timed`  | 消费明确的 viseme 时间轴，提供最高等级的可验证口型同步 |

Provider 未返回 timing 时可以显式选择 `amplitude`，但 result/diagnostic 必须报告实际等级；不得将音量开合描述成精确 phoneme/viseme 同步，也不得在模型没有 mouth capability 时返回 lip-sync 成功。

### STT/ASR

STT 不是 Agent 驱动角色说话的前置条件。只有用户需要音视频转录、字幕证据、麦克风语音输入或双向语音会话时，才通过 provider-owned `audio.asr`/perception capability 提供。已裁剪的 Engine `models:transcribe`、本地 perception fallback 或缺失 provider 时的成功 no-op 不得恢复。

首期 Avatar Preview 不拥有麦克风、always-listening、streaming ASR、VAD、echo cancellation、barge-in 或语音 turn-taking。文件 STT 可以作为独立 P1 Agent perception 能力；实时麦克风 STT 必须通过独立 Voice Session OpenSpec 定义显式用户授权、录音指示、停止操作、原始音频保留、provider credential、取消和隐私边界。STT 结果作为 Agent input/evidence，不写入模型源，也不由 Preview 保存为角色状态。

## 生命周期、队列和失败语义

单个可驱动 Preview 实例采用以下最小状态：

```text
opening -> loading -> ready -> performing -> ready
                    \-> failed
任意非 disposed 状态 -> disposed
```

- `loading` 前建立实例 identity 和 source fingerprint；
- `ready` 后 capability descriptor 才有效；
- `performing` 仍允许显式 replace、enqueue、stop 或 reset；
- 模型重载使旧 descriptor、revision 和未完成 operation 失效；
- `failed` 返回可观察 diagnostic，不返回空模型、默认 descriptor 或成功 no-op；
- `disposed` 后所有新操作失败，迟到结果只能被识别并丢弃，不能复活 session。

动作队列属于单个实例。首期不建立跨实例 choreographer、全局 Avatar workflow、持久动作时间线或后台 playback service。

## 安全、授权与用户数据

- 模型入口和每个依赖文件必须经过 Extension 精确授权；Webview 不可任意读取工作区目录。
- CSP 只放行实际需要的 script、worker、WASM、image/blob 与 WebGL 路径，不使用宽泛网络白名单。
- capability/result 不包含绝对用户路径、Webview token、renderer object、provider credential 或未限定的原始二进制。
- 截图或 Agent 视觉证据继续使用有界资源与 `ResourceRef`；不得因动作能力引入直接 provider upload fallback。
- 模型源、动作和表情资源的许可证由用户与发行方分别承担；OpenNeko 的分发必须单独满足 Live2D Cubism SDK/Core 的发布与可扩展应用条款。Project N.E.K.O 或第三方库的许可证不会自动覆盖 OpenNeko。

## 测试与验收

实施该 ADR 的变更至少需要以下证据：

1. 协议和 validator 测试证明 unknown operation、unknown action、stale identity/revision 和 disposed instance 失败可见；
2. 多面板测试证明 renderer、队列、表情和 lifecycle 完全隔离；
3. 依赖与构建测试证明非目标 Webview entry 不执行 Pixi/Cubism、Three/VRM 或 MMD physics；
4. CSP、授权、依赖资源、取消和 recursive disposal 测试；
5. Extension Development Host 功能场景分别证明真实 Live2D、动画 GLB/glTF 和后续 VRM 的能力发现、Agent 操作、动作结果和关闭清理；静态或不具备目标能力的模型必须返回 unsupported；普通浏览器/Vite 不能替代该验收；
6. 因该能力改变 Agent capability/tool routing 和真实行为，必须按 `neko-agent-evaluation` 规划并执行聚焦真实 Agent evaluation，至少覆盖一个 canonical action case 和一个 unsupported/stale failure case；
7. 路径级断言证明 canonical flow 是 Agent -> owning capability -> exact Preview instance -> Webview adapter，且没有 active-panel fallback、Engine、direct provider 或 renderer-global 旁路。
8. TTS/`playSpeech` 测试证明 Preview 只消费授权的 audio `ResourceRef`，Provider timing 缺失时报告实际 lip-sync 等级，模型无 mouth capability 时不返回同步成功；
9. STT 边界测试证明未配置 provider 时不注册或明确失败，并 poison 已删除的 Engine transcription fallback。

## 实施顺序

1. 新建 Agent 驱动 Live2D 只读预览 OpenSpec，包含最小统一 Performance descriptor/operation、Live2D Webview、实例协议、语义动作、生命周期和 evaluation；
2. 在同一变更或明确依赖的聚焦变更中复用现有 TTS，接入 `playSpeech` 与 Webview-local LipSyncDriver；不把文件/实时 STT 扩入首期；
3. 新建动画 GLB/glTF Preview 变更，在现有 Three canonical path 增加实例级 clip catalog、`AnimationMixer`、playback/disposal，并复用同一 Performance contract；
4. 在 Live2D 与动画 glTF 路径证明契约后，新建 VRM Avatar Preview OpenSpec，复用现有 Three/glTF path 并增加 VRM 标准语义 adapter；
5. 文件 STT 根据真实转录/字幕需求作为 provider-owned Agent perception 变更实施；实时 STT 仅在 Voice Session 变更中实施；
6. 只有真实资产需求和维护依赖成立时，再提出 MMD 技术 spike 与独立 OpenSpec。

这些阶段不得作为一个大而不可独立验收的格式/语音集成变更，也不得修改接近完成的 `add-standard-3d-model-preview` 来隐式吸收 VRM、Live2D、MMD、动画 playback 或 Voice Session。

## 备选方案与拒绝理由

### 使用 Unity 统一 Live2D、VRM 和 MMD

拒绝。它会在本地 VS Code + TypeScript Webview + Rust Media Engine 产品边界外增加完整编辑器/runtime、构建链、嵌入层和许可复杂度，也不能复用现有 Preview Webview、安全模型和 Three.js 路径。

### 用 Three.js 统一渲染 Live2D

拒绝。Live2D 的 Cubism model、motion、expression、parameter 和 draw-order 语义不属于 Three.js scene graph；强制统一 renderer 会增加 adapter 复杂度且失去成熟 Pixi/Cubism 集成。

### 直接集成 Project N.E.K.O bundle

拒绝。其定制 bundle、全局对象和宿主加载方式不符合 OpenNeko 的 TypeScript strict、ESM、CSP、Webview 沙箱、依赖审计和实例隔离要求。只参考行为、资源发现规则和用户体验。

### 首期同时支持 Live2D、VRM 和 MMD

拒绝。三者只有上层 Avatar 动作语义相似，渲染、资源、动画、物理、许可和生命周期差异很大。同时实现会在契约尚未由真实 Live2D 路径证明前制造过度抽象，并显著扩大验收面。

### Agent 直接设置所有模型参数

拒绝。模型 parameter/bone/action identity 不稳定且高度格式相关，模型可能不具备 Agent 猜测的参数。Agent 只操作 descriptor 中明确暴露、受约束的语义能力。

## 后果

正面后果：

- 满足“源只读、运行态可驱动”，不引入持久项目格式；
- Live2D 使用适合的 2D runtime，VRM 复用现有 Three/glTF 路径；
- Agent 面向一个按实例能力发现的小型 Performance contract，不依赖具体渲染 SDK，也不假定普通 GLB 是 Avatar；
- TTS、STT、语音播放与 lip sync owner 清晰，Agent 不需要逐帧驱动嘴型；
- 实例身份、revision、取消和资源释放从首期进入契约；
- MMD 的维护、物理和授权风险不会污染首期依赖面。

代价与风险：

- Live2D 与 Three/VRM 需要独立 Webview runtime 和 adapter；
- 动画 GLB/glTF 需要在当前只报告 animation count 的预览之外增加真实 playback runtime；
- Agent evaluation、真实 VS Code Webview 验收和 license 审计成为发布硬门禁；
- 语义 contract 必须保持精简，不能为了假想 MMD 未来需求提前抽象全部动画系统；
- 如果产品目标转为常驻桌面角色或可编辑动画项目，必须迁移到新的 runtime/project owner，不能继续扩张 Preview。

## 参考资料

- [Project N.E.K.O](https://github.com/Project-N-E-K-O/N.E.K.O)
- [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)
- [Three.js Loading 3D Models](https://threejs.org/manual/en/loading-3d-models.html)
- [`@pixiv/three-vrm`](https://github.com/pixiv/three-vrm)
- [Three.js Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)
- [Three.js 指向的 `three-mmd-loader`](https://github.com/takahirox/three-mmd-loader)
