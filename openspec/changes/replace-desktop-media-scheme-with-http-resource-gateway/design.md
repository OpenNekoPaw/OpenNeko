## Context

OpenNeko 是本地 Electron Desktop，Renderer 运行在 Chromium sandbox。当前实现已经删除
`neko-media:` 二次代理，但把资源改成了 app-lifetime loopback HTTP：

```text
ContentLocator
  -> owning Desktop adapter resolves an exact path/stream
  -> DesktopHttpResourceGateway
  -> NodeMediaLoopbackServer (127.0.0.1:<dynamic-port>)
  -> native element / fetch / loader
```

这条链路引入 TCP listener、动态 CSP origin、CORS/PNA、bearer token 和两层 owner bookkeeping。
当前没有 Web/remote consumer；所有请求都由同一个 Electron session 中的 Renderer 发起。
Desktop 同时已有 `neko-app:` protocol 用来加载 Renderer bundle，因此可以用一个产品级 scheme
直接覆盖两个职责。

目标链路为：

```text
ContentLocator
  -> owning Desktop adapter resolves and authorizes an exact source
  -> Desktop exact-resource registry
  -> openneko protocol.handle
  -> openneko://resource/<opaque-id>/<optional-relative-path>
  -> package-owned native element / fetch / loader
```

应用自身使用：

```text
openneko://desktop/index.html
openneko://desktop/<renderer-asset>
```

### Five-Layer Analysis

| 层 | 结论 |
| --- | --- |
| 职责 | Content/representation owner 解析 locator；领域 package 决定播放/处理意图；Desktop Main 拥有 exact-resource registration、sender authorization、响应和释放；`@neko/media` 只拥有 FFmpeg/PCM/浏览器媒体能力。 |
| 依赖 | Renderer 不访问 Node/Electron/系统路径；领域 package 不依赖 Desktop；resource registry 不解释 locator、OTIO、NKC、Preview 或 Agent state；Desktop app handler 直接组合 registry。 |
| 接口 | 持久身份只用 `ContentLocator`；representation、领域 ID、revision 与临时 URL 分离。descriptor 不再携带单值 `transport` discriminant。 |
| 扩展 | finite files、Range、PCM 和 allowlisted dependency set 共享一个 resource host；新的媒体种类不新增 scheme；实时媒体继续使用 MediaStream/WebRTC。 |
| 测试 | contract 与真实 Electron 同时断言 `openneko:` canonical path、sender binding、Range/stream、native consumer、资源释放，并 poison HTTP 与旧 scheme。 |

## Goals / Non-Goals

**Goals:**

- 统一为一个 `openneko:` scheme 和一个 Electron protocol handler。
- 删除 production loopback HTTP server 和它特有的 CSP、CORS、PNA、端口与 bearer 模型。
- 保持 Renderer sandbox、路径非披露、精确授权、source revision fencing 和确定性释放。
- 支持当前 Cut、Canvas、Preview、Agent 所需的 seekable bytes、PCM 与 glTF dependency set。
- 保持 `ContentLocator` 为唯一公共持久内容身份。
- 保留原生 `<audio>`/`<video>`、Canvas/WebGL、PDF/model loader 的 Chromium 能力。

**Non-Goals:**

- 不新增 `opennekomedia:`、`neko-media:`、`media:`、`video:`、`audio:` 或 domain-local scheme。
- 不把 registry 变成项目文件 API、Content resolver、cache manager 或目录浏览器。
- 不把 `@neko/media` 变成 Desktop/Electron package。
- 不用 scheme 名称推断 codec、纹理复用、10-bit 或 HDR 输出能力。
- 不给 Agent 增加 Bash，也不把 Renderer URL 当作 Tool/provider/system path。
- 不为没有当前 consumer 的 HLS/DASH、XR 或直播预建 provider。

## Decisions

### 1. 一个 scheme，两个 host

Electron 在 app ready 前只注册：

```ts
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'openneko',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: false,
    },
  },
]);
```

同一个 `protocol.handle('openneko', ...)` 按 host 分发：

| URL | Owner | 行为 |
| --- | --- | --- |
| `openneko://desktop/...` | app protocol | 只读 Renderer bundle，返回严格 CSP |
| `openneko://resource/<id>/...` | exact-resource registry | 只读授权资源、stream 或 allowlisted dependency |
| 其他 host | 无 | `404` |

不注册第二个 scheme，也不为 media/model/document 建立独立 handler。`resource` 是运行时访问分区，
不是新的公共资源领域或内容身份。

`desktop` 与 `resource` 是不同 origin。CSP 只允许
`openneko://resource` 出现在经过审计的 `media-src`、`img-src`、`connect-src` 等 directive。
需要 Canvas/WebGL/Three.js 取像的 consumer 在设置 `src` 前设置 anonymous CORS；resource
response 只允许 `openneko://desktop` 和当前 development Renderer origin。

### 2. URL 和 descriptor 保持 transport-neutral

`ContentLocator`、`ContentRepresentationLocator`、领域 ID 和 revision 继续由 owning contract
持有。临时 URL 只存在于 Renderer descriptor：

```text
openneko://resource/<opaque-id>
openneko://resource/<opaque-id>/<relative-dependency>
```

opaque ID 只做运行时 lookup，不写入项目文件、Agent memory、provider payload、clipboard、
recent state、日志或持久 cache。URL 不得回写 locator。

因为 production 只有一个 transport，`MediaTransport = 'http'` 及 descriptor 的
`transport` 字段没有 discriminating value，必须删除。浏览器媒体 client 只消费 owning
descriptor 的 URL；Desktop producer/bridge tests 负责证明 URL 来自 resource registry。

`file:` 仍禁止进入 Renderer。`data:` 只用于有严格大小上限的内嵌表现，`blob:` 只用于 Renderer
自产生且显式 revoke 的内容。

### 3. Registry 是唯一必要的 Host resource state

Desktop Main 保留一个 app-lifetime exact-resource registry。它不是 gateway facade，不解析
locator，也不暴露到 preload。它只接受 owning adapter 已授权的：

- exact seekable file：绝对执行路径、MIME、byte length、revision/fingerprint；
- one-shot PCM producer：创建函数、priming、AbortSignal 和 framing metadata；
- frozen resource set：entry path 与 exact relative dependency allowlist；
- owner：Window/View/session/renderer epoch/generation 和允许的 `webContentsId`。

registration 返回运行期 URL 与 release handle。owner replace、View detach、renderer reload、
Window close 和 app quit 撤销对应记录，并 abort in-flight file/PCM response。unknown/revoked ID
返回明确非成功状态，不查找 active/recent owner。

Cut/Canvas 的 Node media runtime 通过最小 publisher port 注册 file/PCM。Preview/Agent 直接调用
registry 的 file/resource-set registration。不存在第二层 `DesktopHttpResourceGateway`、
gateway client、provider、factory 或 public IPC registration API。

### 4. Sender authorization 使用 Electron request context

每个 registration 绑定允许的 `webContentsId`。Desktop 在 owning Electron session 上安装
`session.webRequest.onBeforeRequest` filter：

```text
openneko://resource/*
```

对每个请求读取 `details.webContentsId`，并根据 URL opaque ID 验证该 sender 是否属于
registration。未知、无 sender、stale epoch 或不匹配请求被取消。`protocol.handle` 再次做
token、method、revision、relative dependency 和 lifecycle lookup；两者都不信任 Renderer
提供的 owner header。

授权 listener 与 protocol handler 在 app composition 中安装一次并显式释放。资格测试必须证明
两个 WebContents 之间不能复用 URL，并覆盖 reload、detach 和 close。

如果目标 Electron 版本不能对 custom scheme 可靠提供 `webContentsId`，资格场景必须失败并记录
具体 Electron 行为；不得静默降级为纯 bearer、HTTP 或关闭 webSecurity。

### 5. Seekable response 实现 Range，但不实现 HTTP server

resource handler 接受 `GET` 和 `HEAD`。seekable file 支持 full、closed、open-ended、suffix
single Range，返回 `200`、`206` 或 `416` 以及：

- `Content-Type`
- `Content-Length`
- `Accept-Ranges: bytes`
- partial response 的 `Content-Range`
- `Cache-Control: no-store`
- `X-Content-Type-Options: nosniff`

响应使用 file stream 与背压，不整文件读入 Buffer，不经 IPC/Base64/Blob。重复/并发 Range
保持同一 frozen source revision。client cancel 中止该读取，但不消费 seekable registration。
query、fragment、multiple Range、encoded traversal、NUL、unknown dependency 和 revision change
fail-visible。

这些是浏览器媒体/文档 loader 需要的 byte semantics，不代表存在 HTTP endpoint、TCP listener、
CORS preflight 或 PNA。

### 6. PCM 保留为显式 one-shot stream

Cut timeline 的 Host-mixed framed PCM 是真实领域需求：它负责 trim、gain、fade、overlap、变速、
loudness 和 master clock。registry 把 one-shot PCM producer 直接转换为 `Response` stream，
保持 priming、背压、single-consumer、取消和 FFmpeg termination。

PCM 不支持 byte Range。seek 由 owning Cut generation 撤销旧 stream 并注册新 stream。Canvas
普通音频/视频、Preview 与 Agent 不创建 PCM；它们使用完整 seekable file 和原生元素。

### 7. Resource set 只授权精确依赖

Preview/model owner 在注册前解析并冻结 glTF 等入口及其相对依赖。一个 opaque ID 下的 virtual
path 只映射 exact allowlist。registry 拒绝 `..`、absolute/scheme-relative URL、encoded
separator、unknown entry、symlink/containment escape 和 source revision change。

GLB、PDF、图片和单文件音视频继续使用单资源 registration。resource set 不提供目录 listing，
也不因 loader 请求扩张 scope。

### 8. Consumer 路径保持 package-owned

| Consumer | Canonical path |
| --- | --- |
| Cut timeline | muted native video + Host-mixed framed PCM |
| Canvas ordinary audio | native `<audio>` |
| Canvas ordinary video | native `<video>` with embedded audio |
| Preview audio/video | owning native player |
| Preview image/PDF/model | owning viewer/loader + exact resource URL/set |
| Agent display | transient render URL + owning native card |
| Agent/provider/Tool | `ContentLocator` or authorized real path, never render URL |
| Live capture/call | MediaStream/WebRTC |

各 Cut document、Canvas View、Preview session 和 Agent conversation 独立拥有 generation 与
registration。active selection 只选择 UI，不作为资源 owner fallback。

### 9. Transport 不决定 codec、纹理或颜色能力

`openneko:` 与 loopback HTTP 都只提供 bytes。codec/container 由 Electron/Chromium build
决定；纹理复用由 decoder/GPU/compositor 决定；10-bit/HDR 输出还取决于 OS、driver、显示器和
色彩管理。资格分别记录：

- metadata/play/seek/Range；
- changing decoded pixels；
- first/repeated WebGL texture upload；
- 10-bit input metadata/decode；
- HDR display output；
- copied bytes/zero-copy 是否实际测量。

不得从 scheme、HTTP、播放成功或纹理像素成功推断 zero-copy、10-bit surface 或 HDR output。

### 10. 迁移顺序

1. 更新 OpenSpec 和 red tests，使 HTTP、`neko-app:`、`neko-media:`、`opennekomedia:` 和
   `transport` 字段不能成为新路径成功来源。
2. 注册 `openneko:`，让 app handler 同时分发 desktop/resource host。
3. 实现 exact-resource registry、Range、PCM、resource set、sender authorization 和释放。
4. 注入 Cut/Canvas publisher，迁移 Preview/Agent registration，删除 transport discriminant。
5. 运行真实 Electron consumer matrix，证明 resource handler 与 package-owned consumer 被命中。
6. 删除 HTTP gateway/server production path、qualification launcher、动态 CSP/CORS/PNA 和旧
   scheme 残留。
7. 同步 architecture/ADR/active changes，运行完整质量门禁并分批提交。

这是 prelaunch canonical path 替换，不提供 runtime flag、dual descriptor 或 fallback。

## Risks / Trade-offs

- [custom scheme loader 行为需要资格]：真实 Electron 覆盖 native media、Range、Canvas/WebGL、
  PDF 和 glTF dependency，不用普通浏览器替代。
- [sender context 可能因 Electron API 路径缺失]：资格必须验证 `webContentsId`；失败时暴露具体
  blocker，不回退纯 bearer 或 HTTP。
- [scheme privilege 按 scheme 而非 host]：handler 对 host/method/headers 分区，app asset
  resolver 不接受 resource route，resource registry 不返回 executable app assets。
- [resource host 跨 origin]：只为准确 consumer 返回精确 CORS，CSP 不开放通配 scheme 或网络。
- [registry 可能变成宽泛 facade]：只接受 exact source/producer/allowlist 和 lifecycle owner，
  不解析 locator、不浏览目录、不暴露 preload API。
- [大文件与 stream 释放]：使用 stream/AbortSignal，测试 client cancel、owner revoke、reload、
  Window close 与 app quit。

## Open Questions

无阻塞产品决策。资格阶段若暴露 Electron custom scheme 的具体 loader 或 sender-context 缺陷，
必须以失败证据更新本设计；不得自行恢复 HTTP 或新增第二个 scheme。
