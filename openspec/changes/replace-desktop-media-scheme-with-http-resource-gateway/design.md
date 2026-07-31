## Context

OpenNeko 是本地 Electron Desktop，Renderer 仍是 Chromium sandbox。当前媒体链路同时存在：

```text
Cut / Canvas Node runtime
  -> NodeMediaLoopbackServer (127.0.0.1 HTTP)
  -> DesktopMediaDescriptorRegistry
  -> desktop-media-protocol upstream proxy
  -> neko-media:
  -> Renderer
```

Preview 则把 Host 解析出的绝对路径注册到同一个 Desktop registry，再由 `neko-media:` 提供
文件响应。两条路径最终都只是给 Chromium `<audio>`、`<video>`、PDF/model loader 或 Web Audio
提供 bytes；custom scheme 不参与 codec decode、GPU compositor、纹理上传或 OS 色彩管理。

现有代码和 contract 的关键事实如下：

| 范围          | 当前事实                                                                                   | 设计问题                                                          |
| ------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `@neko/media` | `MediaTransport = 'http' \| 'authorized'`，其中 `authorized` 固定为 `neko-media://desktop` | 同一字节资源存在两种 Desktop transport 事实                       |
| Desktop Main  | registry 同时注册 file 与 upstream；upstream 把已授权 loopback HTTP 再 fetch/pipe 一次     | 重复 Range、取消、header、错误和生命周期逻辑                      |
| Cut           | 原生 muted video + 多路/混合 PCM；PCM 是 timeline master clock                             | PCM 是真实领域需求，不能随协议迁移删除                            |
| Canvas        | 单资源 audio/video 也被统一转换为 video + PCM                                              | 普通 node 播放没有多轨混音和 timeline master-clock 需求           |
| Preview       | package viewer 已能直接消费 source URL；支持 image/audio/video/document/model              | transport 不能只按 audio/video 文件扩展名设计                     |
| Agent         | 消息投影会把本地媒体 path 转成展示 URL；原生 audio/video card 已存在                       | 展示 URL、稳定 attachment 和 Tool/Bash 文件路径容易被混为一种身份 |

### Five-Layer Analysis

| 层   | 结论                                                                                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 职责 | 领域 package 拥有 locator、播放/处理意图和 session；Desktop Main 拥有授权和 gateway 实例；`@neko/media/node` 拥有 FFmpeg/PCM 与可复用 loopback byte publisher；Renderer 只消费投影。 |
| 依赖 | Renderer 不获得 Node/Electron/文件路径；gateway 不 import React，不解释 OTIO/NKC/Agent message；领域 package 不依赖 Desktop 实现。                                                   |
| 接口 | 持久 `ContentLocator`/owning domain identity 与短生命周期 `DesktopResourceProjection` 分离；seekable file、one-shot PCM 和 resource set 使用显式 descriptor kind。                   |
| 扩展 | HLS/DASH、glTF dependency set 和未来 XR 可在 HTTP resource model 上增加有 owner 的 adapter；实时流单独走 MediaStream/WebRTC。                                                        |
| 测试 | contract/producer/consumer、HTTP/Range/CORS/PNA、真实 Electron、FFmpeg/PCM、纹理/HDR 资格、性能和 dispose 都需要路径级证据，并 poison `neko-media:`。                                |

### Existing HTTP Evidence

2026-07-31 在 `darwin-arm64`、Electron 43.2.0、Chromium 150 上运行的临时 spike 得到：

| 场景                                 | 结果                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------- |
| H.264 metadata                       | 26–66 ms                                                               |
| H.264 first frame                    | 热启动约 34 ms；冷启动约 172–180 ms                                    |
| H.264 seek                           | 22–36 ms                                                               |
| WAV metadata / seek                  | 4–8 ms / 0.7–1.0 ms                                                    |
| Renderer 读取 32 MiB                 | 671–685 MiB/s                                                          |
| production `NodeMediaLoopbackServer` | 中位 820 MiB/s                                                         |
| 1 MiB Range                          | 中位 2.7 ms；P95 3.7 ms                                                |
| 内容与 GPU                           | SHA-256、变化帧、WebGL2 首次/重复纹理上传通过                          |
| 10-bit/HDR input                     | Main10 HEVC、BT.2020/PQ bytes 与 metadata load 通过；未证明 HDR output |

这些结果证明 HTTP 可作为本机播放/预览 transport，不证明 Windows、所有 codec、零拷贝、
10-bit surface 或 HDR 显示链已经合格。临时 spike 不替代仓库内回归和真实发布目标资格。

## Goals / Non-Goals

**Goals:**

- 删除 Desktop 私有媒体 scheme 和 HTTP 二次代理，建立唯一 loopback HTTP canonical path。
- 保持 Renderer sandbox、CSP、路径非披露、capability-scoped access 和确定性释放。
- 为 Cut、Canvas、Preview、Agent 明确同一 transport 上不同的领域消费策略。
- 将 PCM 限定为 Cut timeline 或其他显式信号处理需求，而不是普通播放的默认格式适配层。
- 支持 seekable audio/video、图片、文档、PDF Range、GLB/glTF 依赖和未来 HLS/DASH 资源集合。
- 记录 HTTP 对纹理、10-bit、HDR 和跨平台能力的真实影响与资格边界。

**Non-Goals:**

- 不移除 `neko-app:`；它继续只加载可信 Desktop Renderer bundle。
- 不以 HTTP 扩大 Chromium direct codec 白名单，不承诺 HDR/10-bit 输出或零拷贝纹理。
- 不把 gateway 变成项目文件 API、通用远程 Web server、cache manager 或任意目录浏览器。
- 不给普通 Agent 增加 Bash；不改变既有 PathAccessPolicy、trust、approval 和 processor ownership。
- 不用 HTTP resource endpoint 承载摄像头、麦克风、通话或无限实时直播。
- 不把 Windows package/typecheck 证据描述为完整 Windows 媒体/GPU 或发布资格。

## Decisions

### 1. 稳定资源身份与 Renderer transport 完全分离

项目事实、Agent message、attachment、Tool result 和跨包 handoff 继续只保存：

- workspace-relative path；
- `ContentLocator`、owning document/entry identity；
- 既有允许的 `${VAR}/path` 配置引用；
- 领域 document/session/revision identity。

Desktop Main 在 exact Window/View/session/revision 已授权后创建短生命周期投影：

```ts
type DesktopResourceProjection =
  | {
      readonly version: 1;
      readonly kind: 'seekable';
      readonly url: string;
      readonly mimeType: string;
      readonly byteLength: number;
    }
  | {
      readonly version: 1;
      readonly kind: 'pcm-stream';
      readonly url: string;
      readonly protocol: 'neko-pcm-f32le-v1';
      readonly sampleRate: number;
      readonly channels: number;
    }
  | {
      readonly version: 1;
      readonly kind: 'resource-set';
      readonly entryUrl: string;
      readonly mimeType: string;
    };
```

URL 形态由 Host-only gateway 产生，例如：

```text
http://127.0.0.1:<ephemeral-port>/v1/resources/<capability-token>
http://127.0.0.1:<ephemeral-port>/v1/streams/<capability-token>
http://127.0.0.1:<ephemeral-port>/v1/resource-sets/<capability-token>/<virtual-path>
```

token 不作为独立 DTO 字段，不写入日志、项目文件、Agent memory、provider input、clipboard 或
recent state。Renderer 不依赖 route grammar，只把 URL 交给相应浏览器 consumer。释放按 owning
session/generation 完成，Renderer 不需要持久 descriptorId 才能回收。

拒绝让 `file:` 成为 Renderer transport：它扩大本地文件 origin 和路径披露面。`data:` 只保留
现有有界 thumbnail/小型附件；`blob:` 只用于 Renderer 自己产生并显式 revoke 的临时内容。
也不改名为 `media:`、`video:`、`audio:` 或 `neko-resource:`，因为改名不会消除私有协议维护成本。

### 2. 一个 app-lifetime gateway，由 Desktop Main 组合现有窄能力

Desktop 在创建/加载 Renderer 前启动一个只绑定 `127.0.0.1` 随机端口的 gateway，并把精确
origin 注入 CSP。应用退出时最后停止 gateway；Window/View/session/generation 关闭只撤销其
注册项和在途响应。

实现优先演进现有 `NodeMediaLoopbackServer` 的 Range、PCM、取消和测试，而不是并行创建第二个
HTTP stack。Desktop composition 向 Cut、Canvas、Preview 和 Agent display projector 注入同一
publisher/registration port：

```text
Desktop Main owns gateway instance and capability registry
  <- @neko/media/node publishes prepared file / PCM source
  <- Preview adapter publishes exact file / document / model resource set
  <- Agent display projector publishes an exact authorized attachment source
```

gateway 只认识 byte source、MIME、seek/stream mode、resource-set allowlist 和 lifecycle owner，
不认识 OTIO clip、Canvas node、Preview tab、Agent message 或 cache policy。各领域 runtime 先
解析稳定 locator、校验 source/revision，再注册 source。这样不需要 interface/factory/registry
多层叠加：一个 registry 是 capability 与生命周期的真实 owner，各领域只提供窄 registration。

### 3. HTTP capability 是 bearer authorization，不伪装成 sender authentication

标准 TCP 请求不能可靠携带 Electron `webContentsId`。因此 gateway 不信任客户端提供的
window/view/session header，也不声称每个 HTTP request 都能重新验证 sender。安全模型是：

- 至少 128 bit CSPRNG capability token，只出现在 URL path；
- token 只映射到一个 exact file/stream 或显式 resource-set allowlist；
- 注册记录保留 server-side Window/View/session/revision/generation owner，用于签发和撤销；
- session replace、stop、View detach、Window close、renderer epoch change 和 app quit 立即撤销；
- 未知、过期、跨 generation 或已撤销 token 返回明确非成功状态；
- URL 和 token 在 Logger/diagnostic 中脱敏；
- token 不进入持久状态，另一进程只有先窃取 token 才能访问资源。

精确 CSP 和 origin 是 defense in depth，不代替 token：

- production 只允许 `neko-app://desktop`，development 只允许当前 Vite origin；
- `media-src`、需要纹理/图片的 `img-src`、需要 fetch 的 `connect-src` 只加入精确
  `http://127.0.0.1:<port>`；
- 只有 viewer 确实使用 frame navigation 时才加入 `frame-src`，不因 PDF/model blanket 开放；
- server 对带 `Origin` 的请求只接受当前 Renderer origin，并返回该精确
  `Access-Control-Allow-Origin`，不得返回 `*`；
- 无 `Origin` 的 native media Range 请求仍依赖 bearer token；不能用伪造 header 提升 scope；
- PNA preflight 仅接受允许的 origin/method/header，并在请求明确要求时返回
  `Access-Control-Allow-Private-Network: true`；
- 保持 `sandbox`、`contextIsolation`、`webSecurity`、导航拦截和 permission deny。

这与 custom protocol 的权衡是显式的：custom handler 可看到 Electron request context，但当前
实际授权也只检查 `webContentsId`，而持有 URL 的同一 Renderer 已能读取资源。HTTP 放弃协议级
sender introspection，换取标准 Chromium 网络栈、直接 Range、无二次代理和更广泛 loader 兼容；
高熵最小 capability 与确定性撤销保持本地产品所需边界。

### 4. gateway 实现完整而有限的 HTTP resource semantics

seekable resource 支持：

- `GET`、`HEAD`、`OPTIONS`；
- full response、一个 closed/open/suffix byte Range、`206`、`Content-Range`、
  `Accept-Ranges: bytes` 和非法/不可满足 Range 的 `416`；
- 精确 `Content-Length`、MIME、`X-Content-Type-Options: nosniff`；
- Chromium 对同一 token 的重复/并发 Range；
- client disconnect/AbortSignal 关闭 file handle、stream 和 FFmpeg child；
- 背压，不整文件读入 Buffer，不经 typed IPC/Base64/Blob 复制；
- session resource 默认 `Cache-Control: private, no-store`，避免撤销后从 HTTP cache 继续成功；
- 非允许 method、未知 route、query-based path、encoded traversal、NUL 和 malformed URL
  fail-visible。

PCM 是 single-consumer、chunked、framed stream，不支持 seek Range；重复消费返回冲突，stop
会终止 FFmpeg。seek 通过 owning domain 停止旧 generation 并签发新 PCM stream，不在 HTTP
层模拟随机访问。

resource set 使用同一 token 下的虚拟路径 allowlist。Preview/model adapter 在注册前解析并冻结
glTF 等入口引用，只映射 exact dependency；路径 normalization 后拒绝 `..`、absolute URI、
scheme-relative URI、未知文件和跨 root symlink。GLB 等单文件格式继续使用 seekable resource，
不创建空泛目录授权。PDF/CBZ、DOCX/EPUB entry 和 model loader 由 Preview/content owner 选择
Range、bounded bytes 或 resource set，不把 archive 解析职责放入 gateway。

### 5. HTTP 与 custom protocol 对浏览器媒体/GPU 能力等价

| 能力                                              | Custom protocol                                             | Loopback HTTP                                                     | 结论                                         |
| ------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------- |
| `<audio>` / `<video>` metadata、play、seek、Range | Electron 正确注册 secure/stream 后可用                      | Chromium 原生网络路径可用，已实测                                 | HTTP 不减少元素能力                          |
| codec/container                                   | 由 Electron/Chromium build 决定                             | 相同                                                              | transport 不扩大格式支持                     |
| WebGL/Three.js `VideoTexture`                     | 跨 origin 需正确 CORS/untainted source                      | 设置 `crossOrigin="anonymous"` 且精确 ACAO 后可用，已实测重复上传 | 不承诺零拷贝或复用 decoder surface           |
| 10-bit input                                      | Chromium decoder/OS/GPU 决定                                | 相同 bytes 和 MIME                                                | metadata/decode success 不等于 10-bit output |
| HDR                                               | Chromium compositor、OS color management、GPU、display 决定 | 相同                                                              | transport 与 HDR 资格无关                    |
| CSP                                               | 需声明私有 scheme                                           | 需声明精确 ephemeral origin                                       | HTTP 必须在 load 前冻结 port/CSP             |
| 授权                                              | handler 可读取 Electron request context                     | bearer capability + origin/CSP                                    | HTTP 的限制必须写入 threat model             |
| loader 兼容                                       | 每个 Chromium/Electron API 需验证 scheme 行为               | 标准 URL/relative resolution                                      | 文档、模型、HLS/DASH 更自然                  |

需要 canvas/WebGL 取像或纹理的 media element 必须在设置 `src` 前设置
`crossOrigin = 'anonymous'`；gateway 返回精确 CORS header。普通 native playback 不因此获得
HDR、10-bit surface 或 zero-copy 保证。Texture reuse 的验收只声明像素可用和重复上传正确，
不能从帧率或 API success 推断 GPU 内存零拷贝。

### 6. PCM 按 consumer 的时间语义选择

| Consumer / operation                | Canonical audio path                   | 原因                                                            |
| ----------------------------------- | -------------------------------------- | --------------------------------------------------------------- |
| Cut timeline preview                | Host 混合 framed PCM，video muted      | clip trim/gain/fade、overlap、变速、loudness、统一 master clock |
| Cut video-only interval             | `<video>` clock                        | 没有 audible PCM clock                                          |
| Canvas 普通 audio node              | 原生 `<audio>`                         | 单资源播放、seek、volume、rate 由浏览器提供                     |
| Canvas 普通 video node              | 原生 `<video>`，使用其内嵌音频         | 浏览器自己保持单文件 A/V 同步                                   |
| Canvas 显式同步/混音/处理 operation | 版本化 PCM 或 prepared seekable output | 只有 contract 声明的信号处理需要才承担 PCM 成本                 |
| Preview audio/video                 | 原生 `<audio>` / `<video>`             | 只读单资源预览；waveform/metadata 是独立派生操作                |
| Agent message/attachment preview    | 原生 `<audio>` / `<video>`             | 展示不拥有 timeline 或音频处理                                  |
| Live capture/call                   | `MediaStream` / WebRTC                 | 不是有限 seekable file                                          |

不根据 codec、播放失败或“当前只有一轨”在 native 与 PCM 间动态 fallback。Cut 始终使用其
timeline PCM canonical path；Canvas 普通播放始终使用 native path。若 direct audio/video profile
不合格，Host 在发布 descriptor 前显式准备完整 seekable 文件或返回 diagnostic。

Canvas 迁移需新增适合普通音频的 native descriptor/consumer，并删除普通 node 创建
`PcmAudioClient` 的成功路径。Cut 的 `CutPreviewClock`、bounded PCM、start barrier、drift、
generation handoff 和 dispose 保持唯一事实，不复用 Canvas native player 来模拟 timeline。

### 7. 各领域只拥有自己的投影和操作

**Cut**

- OTIO/ContentLocator、document/session/revision 仍是 authority。
- Node/FFmpeg 直接向共享 gateway 注册 original/remux/prepared video 和 mixed PCM，不再把 HTTP
  URL交回 Desktop upstream proxy。
- video descriptor 是 HTTP seekable resource；所有 audible timeline content 是一个 owning
  generation 的 PCM stream，video 保持 muted。
- active/standby、same-clip retain、seek、stop 和 ExportJob 语义不变。

**Canvas**

- `.nkc` 继续保存 portable source identity，不保存 HTTP URL、PCM token 或播放状态。
- 普通 media node 的 probe/prepare 在 Host；Renderer 使用 package-owned native audio/video
  component。
- 只有新的显式 processed-playback contract 可以返回 PCM；普通 node request 命中 PCM handler
  必须失败测试。
- 多 Canvas 实例各自拥有 operation/generation，gateway registry 只按 owner 回收，不使用 active
  Canvas fallback。

**Preview**

- Preview Root/registry 继续选择 image、audio、video、document、model viewer；Desktop 不复制
  viewer。
- Preview session 可发布一个 seekable resource 或一个 exact resource set。temporary replace、
  pin/side close、hover leave、source revision change 和 panel dispose 都撤销旧 capability。
- glTF 外部 buffer/texture 保持相对 URL，PDF/document/model MIME 与 worker/asset CSP 分开审计。
- 3D Reference 的 capture 输出仍先进入 workspace-owned `ContentLocator` 或 owning artifact
  identity；HTTP URL 不是 Agent context。

**Agent**

- Pi/runtime 消费 attachment metadata、`ContentLocator` 或 owning document/artifact
  identity；workspace-relative path 只进入授权 Tool 边界。只有 conversation-to-Webview
  display projector 请求临时 HTTP projection。
- tool/provider 输入保留稳定引用，provider materializer 在授权 Host 边界读取 bytes，不把
  loopback URL 当成公网 provider URL。
- `Read`/`Write`/`ReadImage`/`ReadDocument` 继续走 PathAccessPolicy 和 ContentReadService；
  直接文件读写使用 workspace-relative input，由 Host 解析系统路径。
- 普通创作 Agent 仍没有 Bash。若 Developer Mode 或受管 processor 明确授权 shell，Host 先校验
  executable、cwd、env、network、input/output 和 approval，再以真实 workspace/system path 执行；
  命令不得接收 HTTP URL，输出先成为 Host-owned locator，只有 owning workflow promotion 后才是
  durable resource。

### 8. 点播、实时、模型和 XR 使用不同的标准 Web 能力

- 普通有限文件：gateway seekable resource + native element/loader。
- HLS/DASH：gateway 发布 manifest 与 exact segment resource set；是否 direct native 或使用
  audited player library由独立 consumer contract/qualification 决定。
- 3D/model/XR 静态资源：HTTP resource set + loader；video texture 复用同一 media URL/CORS。
- 摄像头、麦克风、屏幕采集：Electron permission/Host authorization 后投影 `MediaStream`。
- 实时通话/远端直播：WebRTC 或专门 streaming runtime；鉴权、重连、latency 和 DRM 不进入本地
  file gateway。

gateway 不提前实现尚无 consumer 的 route/provider。上述扩展只定义协议归属，实施仍需独立
OpenSpec 和真实场景。

### 9. 平台和媒体资格保持按目标封闭

当前原生构建 contract 只有 `darwin-arm64` 与 `win32-x64`，Linux 只运行 host-neutral CI。
本变更已有 macOS arm64 feasibility evidence；完整媒体运行态验收必须在本地 packaged
`darwin-arm64` Electron 上验证启动、CSP/PNA、audio/video、Range、模型/文档、取消和资源
释放。Windows job 必须保持 typecheck/package 通过，但它不运行图形化 UI 场景，也不能据此
声明 Windows 媒体/GPU 完整资格。

direct codec、10-bit 和 HDR 继续由精确 Electron/Chromium、OS、架构、GPU/driver、显示器和
FFmpeg build 的 manifest 决定。HTTP bytes/load/texture success 只能证明 transport 与 decode
候选；HDR output 必须使用既有输出链资格方法。Windows 完整安装、凭据、GPU/媒体和发布资格
继续由 Phase 2 在真实设备或明确授权的本地场景中独立验证。

### 10. 迁移是一次 canonical path 替换

实施顺序：

1. 先冻结新的 projection/registration contracts 和 red tests，poison
   `transport: 'authorized'`、`neko-media:` URL 与 protocol registration。
2. 让 app-lifetime gateway 支持现有 file/PCM/Range 行为和新 security/resource-set contract。
3. 先迁移 Preview/Agent 的直接文件 projection，再迁移 Canvas native audio/video，最后让 Cut
   和 remaining Canvas processed operations 注入同一 gateway。
4. CSP 在 gateway port 确定后生成；真实 Electron 路径验证通过前不删除旧代码，但旧代码在新
   path tests 中必须 poison，不能作为 fallback success。
5. 删除 `DesktopMediaDescriptorRegistry` upstream/file proxy、`desktop-media-protocol`、
   `DESKTOP_MEDIA_SCHEME`、scheme privilege、authorized transport 和相关 dual-path fixture。
6. 同步 active OpenSpec 与 accepted 架构文档，明确哪些旧规划被 supersede。
7. 完成 macOS 参考平台运行态、Windows package/typecheck、性能对比、资源释放与 repository
   quality gates 后才宣布迁移完成；不扩大 Windows 完整资格声明。

这是 prelaunch transport 破坏性变更，没有用户数据 migration。Rollback 只能显式 revert 整个
变更；不得在 production 保留 runtime flag、dual descriptor、custom-scheme fallback 或双写。

## Risks / Trade-offs

- [HTTP request 不能证明 `webContentsId`] → 明确采用 bearer capability；token 高熵、scope 最小、
  不持久化/不记录并随 owner 立即撤销，CSP/origin 只做附加约束。
- [ephemeral port 使 CSP 变成启动期依赖] → gateway 必须先于 app protocol/window load 启动；
  启动失败直接阻止媒体能力 ready，不回退宽泛 `http:` 或 custom scheme。
- [Windows PNA/CORS/codec 行为与 macOS 不同] → 本变更只要求 Windows native package/typecheck
  不回退；完整 packaged UI/media 资格留给 Phase 2，不能用 macOS、Chrome 或 cross-build 替代。
- [resource set 可能扩大目录读取] → 只注册解析后 exact virtual-path allowlist，不授权任意目录，
  所有 dependency 做 containment、fingerprint 和 MIME 检查。
- [native Canvas audio 改变 Web Audio UI/clock 行为] → 保留 package-owned UI，重写底层 native
  consumer；用 save/reopen、seek、pause、rate、hover/replace 和多 Canvas isolation 场景验收。
- [HTTP cache 可能在撤销后继续服务 bytes] → session resource 使用 `no-store`，撤销时 abort
  response；测试证明旧 URL 在 replace/dispose 后不再成功。
- [协议迁移被误解为 HDR/纹理升级] → capability matrix 和 UI 资格继续分离 transport、decode、
  texture pixel correctness 与 display output。
- [单 app gateway 成为共享资源] → registry record 按 owner/generation 隔离，server 本身无领域
  可变状态；所有 listener、response、FFmpeg child 和 socket 在 owner/app dispose 明确释放。

## Open Questions

无阻塞设计问题。HLS/DASH player、远端直播/DRM、XR live media 与 HDR display qualification
均需要出现明确产品 consumer 后通过独立 OpenSpec 决定，不在本变更中预建抽象。
