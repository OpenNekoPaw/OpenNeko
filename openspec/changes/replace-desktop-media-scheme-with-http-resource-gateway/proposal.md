## Why

Desktop 当前把 `@neko/media` 已生成的 tokenized loopback HTTP URL 再代理为
`neko-media:`，形成两层 transport、两套授权/取消逻辑和额外字节转发，却没有扩大
Chromium `<audio>`、`<video>`、纹理、10-bit 或 HDR 能力。真实 Electron 43.2.0 验证已证明
标准 `127.0.0.1` HTTP 的 metadata、首帧、seek、Range、音频、WebGL2 纹理上传和本机吞吐可用，
因此应在实施前把 Desktop 收敛到一个可授权、可测试的 HTTP canonical path，并明确 PCM 只服务
真实时间线处理需求。

## What Changes

- 新增 app-lifetime、仅监听 `127.0.0.1` 的 Desktop HTTP resource gateway，通过不可预测、
  短生命周期 capability token 向 Renderer 投影文件、派生文件、PCM 和复合资源依赖。
- gateway 统一支持 `GET`、`HEAD`、单段 Range、`206`/`416`、明确 MIME、取消、背压、撤销、
  精确 Renderer origin、CSP 和 Private Network Access；URL 不包含本地路径或稳定资源身份。
- **BREAKING** 删除 Desktop `neko-media:` 注册、upstream 二次代理和
  `MediaTransport: 'authorized'` 成功路径；生产 descriptor 只接受授权的 loopback HTTP URL，
  旧 scheme 必须 fail-visible，不能 fallback。
- Cut 保留原生 `<video>` Range 与 Host 混合的 framed PCM：所有可听 timeline 输入继续通过单一
  PCM master clock，实现 clip gain、fade、overlap、变速、响度和 A/V 同步。
- Canvas 的普通单资源音频改用原生 `<audio>` 或 Host 准备的 seekable 文件；只有声明同步、混音、
  变速、分析或生成时序需求的 Canvas operation 才可请求 PCM，不保留按运行时猜测的双路径。
- Preview 的 image/audio/video/document/model viewer 继续由 package owner 负责；音视频优先使用
  原生元素，PDF/CBZ/模型及 glTF 外部 buffer/texture 通过 gateway 的受限资源集合和相对依赖解析
  读取，不把协议设计局限为音视频。
- Agent 消息、attachment、tool result 和 provider input 继续保存 `ContentLocator` 或 owning
  domain identity；workspace-relative path 只作为授权 Tool 输入。只有 Renderer 展示投影得到
  临时 HTTP URL。Agent 文件工具或受管 processor 在授权 Host 执行边界使用真实系统路径，HTTP
  URL 不进入 shell、项目事实或 provider payload。
- HLS/DASH 等点播清单可通过 HTTP 能力扩展；实时采集、通话和直播使用 `MediaStream`/WebRTC 或
  专门 live runtime，不把无限实时流伪装成 seekable resource。
- `file:` 不进入 Renderer；`data:` 仅用于有严格大小上限的小型内嵌表现；`blob:` 仅用于
  Renderer 自生成且可释放的临时内容。保留 `neko-app:` 作为可信 Renderer bundle scheme。
- 平台资格保持封闭：当前原生构建目标只有 `darwin-arm64` 与 `win32-x64`，Linux 只用于
  host-neutral CI。本变更以 `darwin-arm64` 本地图形化 Electron 场景完成媒体运行态验收，并
  保持 Windows package/typecheck 通过；完整 Windows 媒体/GPU 资格仍由 Phase 2 独立完成。

## Capabilities

### New Capabilities

- `desktop-http-resource-gateway`: 定义 Desktop loopback HTTP 的授权模型、HTTP/Range/CSP/CORS/PNA
  行为、复合资源解析、生命周期、安全边界、性能基线和平台资格。
- `desktop-media-consumer-projection`: 定义 Cut、Canvas、Preview、Agent 对稳定资源身份、原生
  `<audio>/<video>`、PCM、文档/模型依赖、工具路径和实时流的唯一消费路径。

### Modified Capabilities

- 无。已归档的 `desktop-cut-node-media-runtime` 本身已要求 loopback HTTP 与 Cut PCM；本变更
  保持该语义，并替代仍处于 active change 中的 Desktop `neko-media:` 规划。

## Impact

- `packages/neko-media`：收敛 transport contract，泛化现有 loopback server 为授权 resource
  gateway，并保留 Node/FFmpeg、Range、PCM 与 browser consumer 边界。
- `apps/neko-desktop`：移除 `desktop-media-protocol` 二次代理和 `neko-media:` privilege/CSP；
  Main composition 管理一个 gateway，preload 仍只传递 typed descriptor/identity。
- `packages/neko-cut*`、`packages/neko-canvas*`、`packages/neko-preview*`、
  `packages/neko-agent*`：迁移 descriptor validation 与 consumer 路由，不获得文件系统能力。
- 现有 active OpenSpec `define-desktop-media-capability-boundary`、
  `integrate-desktop-cut-preview-media` 和 `integrate-desktop-assets-canvas` 中关于
  `neko-media:`、拒绝 loopback URL 或 Canvas 全量 PCM 的规划由本变更取代；Node/FFmpeg、HDR、
  平台和资源身份约束继续有效。
- 架构文档需同步 `media-runtime.md`、Desktop 媒体 ADR、package boundaries 与 application
  composition；不迁移或修改用户项目数据，因为 transport URL 从来不是持久事实。
