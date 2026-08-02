## Why

OpenNeko 当前只支持 Electron Desktop。此前生产链路先由 `@neko/media` 启动
`127.0.0.1` HTTP server，再由 Desktop 管理动态端口、CSP、CORS/PNA、bearer token 和 owner
lease；更早的实现还把 HTTP 二次代理成 `neko-media:`。这些层级都只是向 Chromium 提供 bytes，
不会扩大 `<audio>`、`<video>`、纹理、10-bit 或 HDR 能力。

Electron 已经提供 standard/secure/fetch-capable custom scheme、`protocol.handle()` 的
`Request`/`Response` 以及 `session.webRequest` 的 `webContentsId`。当前没有 Web client、远程
gateway 或独立 HTTP API consumer，因此生产 loopback HTTP 是不必要的 transport 和安全表面。

Desktop 已有应用 scheme `neko-app:`。最终设计把它统一重命名为产品级 `openneko:`，并在同一
scheme 内用 host 区分可信应用资源与短生命周期授权资源。系统不得新增 `opennekomedia:`、
`neko-media:`、`media:`、`video:`、`audio:` 或第二个 production transport。

## What Changes

- **BREAKING** 把 `neko-app://desktop/...` 统一为 `openneko://desktop/...`。
- 在同一个 `openneko:` handler 中增加
  `openneko://resource/<opaque-id>/<optional-relative-path>`，用于有限文件、Range、PCM stream
  和精确 allowlisted dependency set。
- 删除 production `DesktopHttpResourceGateway`、`NodeMediaLoopbackServer` 默认运行路径、
  动态端口、CORS/PNA、loopback bearer authorization 和 HTTP qualification launcher。
- 删除 descriptor 中冗余的 `transport: 'http'` / `MediaTransport`。运行期 URL 不是内容身份，
  不得持久化或进入 Agent reasoning、provider、Tool 或 shell 参数。
- Desktop Main 在 locator owner 完成解析和授权后注册精确资源；资源记录绑定
  Window/View/session/renderer epoch/generation，并通过 `session.webRequest` 的
  `webContentsId` 限制请求 sender。
- 一个 `protocol.handle('openneko', ...)` 同时分发 `desktop` 和 `resource` host。未知 host、
  method、token、依赖、revision 或 sender fail-visible，不做 HTTP/custom fallback。
- 保持 `ContentLocator` 为唯一公共持久内容身份；不恢复 `ResourceRef`、path-to-locator 推断、
  URL locator 或宽泛 Desktop content facade。
- Cut 保留 Host 混合 framed PCM；Canvas 普通音视频、Preview 和 Agent 展示继续使用原生
  `<audio>`/`<video>`。PDF、GLB/glTF、图片和其他有限资源复用同一 resource host。
- 摄像头、麦克风、屏幕采集、通话和无限直播继续使用 `MediaStream`、WebRTC 或专门 live
  runtime，不映射为 seekable resource URL。
- 真实 Electron 资格必须覆盖 metadata、play、seek、Range、PCM、Canvas pixels、WebGL texture、
  PDF、GLB/glTF dependencies、sender isolation、reload/close release 和 packaged macOS。

## Capabilities

### New Capabilities

- `desktop-openneko-resource-transport`: 定义统一 `openneko:` scheme、resource registration、
  Range/stream/resource-set response、sender authorization、生命周期和资格边界。
- `desktop-media-consumer-projection`: 定义 Cut、Canvas、Preview、Agent 对
  `ContentLocator`、原生媒体、PCM、文档/模型资源、Agent 文件工具和实时流的唯一消费路径。

### Modified Capabilities

- `desktop-cut-node-media-runtime`：把 Cut seekable video 与 mixed PCM 从 loopback HTTP
  收敛到统一 OpenNeko resource registration。
- `standard-3d-model-preview`：把模型与精确依赖从 `ResourceRef`/`neko-media:` 收敛到
  `ContentLocator` 与 transient OpenNeko resource set。
- `model-preview-agent-context`：把模型与派生预览图身份从 `ResourceRef` 收敛到 validated
  `ContentLocator`，并禁止 runtime resource URL 进入 Agent context。

## Impact

- `packages/media`：保留 probe、FFmpeg、PCM framing、浏览器 consumer 和最小 host
  publication port；删除 HTTP-only transport contract、resource-set gateway 扩张和默认
  loopback server ownership。
- `apps/neko-desktop`：`neko-app` 重命名为 `openneko`；同一个 app protocol handler 增加
  resource host；新增一个必要的 Host-internal exact-resource registry，删除 HTTP gateway。
- `packages/cut/*`、`packages/canvas/*`、`packages/preview/*`、
  `packages/agent/*`：删除 `transport: 'http'` 判断，消费 Host 投影的临时 resource URL，
  不获得 Electron、Node 或文件系统能力。
- `packages/neko-tools*`：媒体比较 descriptor 删除单值 HTTP transport；任何运行期媒体 URL
  只作为 transient projection，Tools effect 继续使用 Host 授权的真实输入。
- CSP 不再依赖动态端口、`http://127.0.0.1:*`、CORS 或 PNA；只声明同一
  `openneko:` scheme 下经过审计的 resource origin。
- 不迁移用户数据。旧 `neko-app:`、HTTP URL、`neko-media:` 或其他运行期 URL 若出现在持久内容
  中继续按非法/失效事实处理，不做一次性迁移或推断。
