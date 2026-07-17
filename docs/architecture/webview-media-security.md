# Webview Media Security 与运行时约束

更新日期：2026-06-15

本文记录 VS Code Webview 中媒体展示、资源授权和运行时读取的稳定约束。它适用于 `neko-cut`、`neko-preview`、`neko-audio`、`neko-agent`、`neko-canvas`、`neko-live`、`neko-model` 以及任何新增 Webview。

## 结论

Webview 不是普通浏览器页面，也不是本地文件播放器。开发时必须同时满足三类限制：

1. **CSP 限制**：Webview HTML 必须默认拒绝所有资源，再按 directive 最小开放。
2. **媒体格式限制**：不能假设浏览器能播放任意 `mp4`、`mov`、`mkv`、`m4a`、`aac` 或 `opus`。
3. **Range 限制**：不能假设 `webview.asWebviewUri(...)` 暴露的本地资源支持稳定 byte range、seek 或大文件流式读取。

因此，大型音视频和需要 seek/metadata 的媒体默认走 **Engine probe + Engine file access/range endpoint + stream/proxy descriptor**。Webview 只消费 Extension Host 授权后的短生命周期 URL、token、stream descriptor 或兼容 preview URL。

## CSP 规则

所有生产 Webview HTML 必须：

- 使用 `default-src 'none'`。
- 使用 `${webview.cspSource}` 加载 extension bundle、样式、字体和受控本地资源。
- 使用 nonce 绑定脚本；业务代码不得依赖裸 inline script。
- 将 `connect-src` 限定到明确需要的 Engine endpoint、dev server 或受控 HTTPS endpoint。
- 将 `media-src` 限定到明确需要的 `blob:`、`${webview.cspSource}` 或 Engine preview endpoint。
- 将 `worker-src blob:`、`frame-src blob:` 等能力只开放给 PDF/EPUB/worker 等确实需要的入口。

生产 Webview 不应：

- 在 `media-src` 中开放 `file:` 作为工作区媒体读取方案。
- 使用 `*`、无界 `http:`、无界 `ws:` 或任意本机端口。
- 用 CSP 放宽来弥补资源授权、编码兼容或 Range 能力缺失。
- 为了临时调试长期保留 `unsafe-eval`、宽泛 `blob:` 或宽泛 localhost 权限；确需保留时必须有 owner、原因和验证。

Dev Webview 可以为 Vite HMR 临时开放 localhost、React Refresh 或 dev-only `unsafe-eval`，但这些权限不得被复制到生产 CSP。

## VS Code 容器级 Warning

打开任意 VS Code Webview 编辑器或 Webview View 时，DevTools 可能出现以下 warning：

- `Unrecognized feature: 'local-network-access'`
- `An iframe which has both allow-scripts and allow-same-origin for its sandbox attribute can escape its sandboxing.`

这些 warning 来自 VS Code Workbench 创建 Webview iframe 时的容器属性，而不是 Neko Webview HTML、CSP、媒体节点、路径转换或保存逻辑。扩展侧没有 API 修改 VS Code 内部 iframe 的 `allow` / `sandbox` 属性，因此不应在 Canvas、Cut、Audio、Model、Sketch 或 Puppet 等功能包中添加 package-local hack。

运行态排障时：

- 堆栈指向 `webviewElement.ts`、`overlayWebview.ts`、`customEditorInput.ts` 或 `webviewEditor.ts` 时，将其视为已知良性容器 warning。
- 不要把它作为保存失败、媒体加载失败、缩略图失败或 CSP 配置错误的证据。
- 继续追踪 Neko 自身 logger、CSP violation、`preview:*`、`media:*`、Engine file-access、`Failed to save NK*` 和 project-file-io diagnostics。

## 媒体格式规则

VS Code 官方 Webview 文档只列出以下可用媒体能力：

| 类型 | Webview 可用格式    |
| ---- | ------------------- |
| 音频 | Wav、Mp3、Ogg、Flac |
| 视频 | H.264、VP8          |

容器扩展名不是能力证明。常见 `.mp4` 可能是 H.264 视频 + AAC 音频；VS Code Webview 可能播放视频但没有声音。开发时必须遵守：

- 进入 `<video>` / `<audio>` 前先由 Engine probe 或已知 manifest 识别容器、video codec、audio codec、duration、seekability。
- Native HTML media 只用于已确认兼容的小范围预览；未知或不兼容媒体必须显示 diagnostic/fallback，并提供 Engine 转码、proxy、stream 或打开外部播放器的路径。
- 高质量预览、时间线播放、波形、字幕、全景和最终导出不要依赖 `<video src={asWebviewUri(file)}>`。
- PCM、H.264 frame stream、fMP4 segment、WebSocket stream 等 Engine 数据面必须通过专用 client/WebAudio/WebCodecs/renderer 消费，不冒充普通文件 URL。
- Agent、Canvas、Preview 中的媒体卡片只消费投影 DTO；如果 DTO 没有声明兼容 preview URL，就渲染 fallback，不直接猜测本地路径可播。

## Range 与大文件读取规则

HTML media 元素为了 duration、metadata、seek 和缓冲经常发起 Range 请求。VS Code Webview 的本地资源投影只解决“可被 Webview 加载”的授权问题，不应被当作通用 byte-range 文件服务器。

必须走 Engine file access 或 stream 的场景：

- 视频、音频、全景、长文档或任意需要 seek 的大文件。
- remote workspace、虚拟文件系统、container entry、模型 sibling resources。
- 需要 `206 Partial Content`、`Accept-Ranges`、`Content-Range` 或缓存验证的读取。
- 需要统一 token、权限、生命周期、GC、diagnostic 或审计的资源。

禁止：

- 为了绕过 Range，把大型音视频整体读成 base64、data URI 或无界 blob。
- 在 Webview 中直接构造 `file:`、绝对路径、workspace path 或 `vscode-resource:` legacy URL。
- 把 Engine token、preview URL、blob URL、Webview URI 写入项目事实。

允许的例外：

- 小型图像、CSS、字体、extension bundle 可通过 `asWebviewUri` 和最小 `localResourceRoots` 投影。
- 小型测试 fixture 可以用 data URI/blob，但必须标注 fixture boundary，不能证明生产媒体性能。

## 推荐链路

### 静态 Webview 资源

```text
extensionUri/dist/webview/assets
  -> webview.asWebviewUri(...)
  -> CSP ${webview.cspSource}
  -> Webview
```

### 交互媒体预览

```text
source ref / ResourceRef / project path
  -> Extension Host authorization
  -> Engine probe
  -> Engine register preview file or create stream
  -> range URL / stream descriptor / compatible proxy URL
  -> Webview client
```

### 不兼容媒体

```text
source ref
  -> Engine probe detects unsupported codec/container
  -> diagnostic + preview proxy/transcode option
  -> Webview fallback UI
```

## 当前仓库影响

- `neko-preview` 的文档和媒体预览应优先使用 Engine endpoint、blob URL 或 stream descriptor；不能把 `media-src blob:` 理解成任意源文件可播。
- `neko-cut` 的视频编辑器应把 `media-src ... file:` 和生产 `unsafe-eval` 类权限视为历史兼容面；新增路径不得扩大此类权限。
- `neko-audio` 可以使用 `blob:`、`mediastream:` 和 WebAudio，但任意本地音频文件仍需 Engine probe/stream/proxy，而不是直接交给 `<audio>`。
- `neko-agent` 媒体卡片应继续保留 fallback：只有收到兼容、授权、短生命周期的 preview URL 才渲染 `<video>` / `<audio>`。
- `neko-model`、`neko-live` 和互动视图消费 Engine stream/control，不通过 Extension Host 代理高频媒体帧。

## 开发检查清单

新增或修改媒体 Webview 前先回答：

1. 资源是 extension 静态资源、小图/文档预览，还是大型媒体/需要 seek 的源文件？
2. CSP 是否 `default-src 'none'`，且 `script-src`、`connect-src`、`media-src`、`worker-src` 只开放必要来源？
3. 是否用 Engine probe 或 manifest 确认容器、video codec、audio codec 和 seekability？
4. 不兼容 codec、无 Range、remote workspace、Engine 不可用时，用户会看到什么 fallback/diagnostic？
5. 验证证据是否覆盖 CSP、格式兼容、Range/seek、Webview debugger smoke 或 Engine smoke？

## 验证建议

- CSP/HTML helper 单元测试：检查 `default-src 'none'`、nonce、生产 CSP 不含无理由 `file:`/宽泛源。
- Engine file access 测试：覆盖 register、Range、invalid range、token 过期和大文件 seek。
- 媒体 fixture 测试：至少覆盖 H.264+AAC MP4 无声风险、MP3/WAV 音频、WebM/VP8 或 H.264 视频兼容路径。
- VS Code debugger Skill smoke：打开目标 Webview，检查 console CSP violation、media error、network request 和可见 fallback。

## 参考

- VS Code Webview API: https://code.visualstudio.com/api/extension-guides/webview
- VS Code Webview 官方说明列出的媒体格式：Wav、Mp3、Ogg、Flac、H.264、VP8；并明确 `.mp4` 中 AAC 音轨可能不被支持。
