## Context

OpenNeko 已有三类不同但名称相近的预览行为：Agent/Canvas/Assets 中跟随当前卡片或节点的轻量内置预览、Canvas 内不离开画布的沉浸式快速预览，以及拥有独立 View/session 的主 Preview。当前 `@neko/preview-webview` 已拥有 image/video/audio/text/document/model Viewer registry 和主面板播放器，但 Agent 仍维护平行媒体卡片，Canvas 仍维护 package-private preview registry，Resource Browser 使用一个硬编码自动播放策略的 Quick Surface。

Cut 的 Preview Panel 名称相近但职责不同：它是 OTIO 时间线的合成监视器，拥有双 video slot、Canvas 合成、PCM 主时钟和帧精确切换，不能被建模为单资源只读 Viewer。

本变更遵守以下约束：

- `ContentLocator` 是稳定内容 identity；只有 Desktop Host 可投影短生命周期 opaque resource URL。
- `@neko/preview-*` 是授权只读 Viewer 与 Preview presentation 的 owner；`@neko/media` 只拥有领域中立的 prepared media/browser runtime。
- Agent、Canvas、Assets、Cut 继续拥有各自的业务外壳、动作、选择、分组和 runtime lifecycle。
- Renderer 不接收 raw path，不自行展开 Workspace authority，不建立 provider/source fallback。
- 不增加内部 contract/version 字段，不保留新旧成功路径或隐藏 Viewer Root。

### Five-layer analysis

| Layer | Decision |
| --- | --- |
| Responsibility | Preview 拥有单资源只读 Viewer、轻量/嵌入式 presentation 与 viewer snapshot 语义；Agent/Canvas/Assets 拥有场景外壳和动作；Cut 拥有时间线监视器；Desktop 仅拥有授权和组合。 |
| Dependency | Agent、Canvas、Assets Webview 只依赖 `@neko/preview-domain` 与 `@neko/preview-webview/embedded`；Preview Webview 依赖 `@neko/media` browser runtime；Cut 不依赖 Preview Webview。 |
| Interface | 一个 canonical `PreviewMediaDescriptor` 输入，一个精确 Surface owner，一个 Viewer registry；调用方只传 descriptor、locale 和明确 presentation state owner，不传 raw URL/path 或业务动作表。 |
| Extension | 新只读内容类型在 Preview registry 中显式注册；新业务快捷操作留在调用方；不使用 wildcard renderer、mode JSON bag 或 first-compatible registry。 |
| Test | Domain codec、Webview lifecycle、消费者 poison-path、Desktop sender/resource authorization、可见 Electron 功能和 UI 证据共同验证唯一调用链与局部失败。 |

## Goals / Non-Goals

**Goals:**

- 建立由 Preview package 拥有、可被 Agent/Canvas/Assets 组合的轻量和沉浸式只读 Preview Surface。
- 让轻量、沉浸式和主 Preview 复用一个严格 Viewer registry，同时保持不同 presentation lifecycle。
- 将普通图片、视频和音频的最终浏览器渲染统一到 `<img>`、`<video>` 和 `<audio>`，并统一授权、加载、错误、自动播放和释放规则。
- 保留 Canvas 内全屏预览，不再把 Canvas 快速查看解释为跳转主 Preview。
- 明确 Canvas 轻量 Markdown 编辑、Text Editor 完整 authoring、主 Preview 只读文本查看和 Agent 流式 Markdown 展示的边界。
- 删除 Agent/Assets/Canvas 沉浸预览中被替代的平行成功渲染路径，并以路径级测试证明唯一 consumer。

**Non-Goals:**

- 不把 Cut 时间线监视器改造成 Preview Surface。
- 不在本变更中强行替换 Canvas inline video/audio 的 hover、Playback Workspace 或同步控制；只有沉浸式只读预览进入公共 Surface。
- 不把裁剪、重绘、复制、保存为素材、加入参考、Tool 状态或生成结果分组放入 Preview Viewer。
- 不在主 Preview、Agent 或 Quick Surface 中增加文本编辑。
- 不增加云端预览服务、跨窗口共享播放器、通用媒体 facade、插件 renderer registry 或内部 contract 版本。

## Decisions

### 1. 一个 Viewer 内核，三个明确 presentation entry

`@neko/preview-webview` 内部保留一个非扩展式 Viewer registry，并通过一个新的 canonical public entry `@neko/preview-webview/embedded` 暴露：

- `QuickPreviewSurface`：卡片/列表/节点中的有界、临时、默认不自动播放的 image/video/audio 预览。
- `EmbeddedPreviewSurface`：Canvas Overlay 等当前场景内的沉浸式只读预览，支持 Viewer 自身的缩放/播放能力，但不创建主 Preview View/session。
- `PreviewRoot`：继续通过现有 root entry 组合独立 Preview runtime、标题/面板 chrome、持久 snapshot 与 document/model Viewer。

Quick 和 Embedded Surface 不是 `PreviewRoot` 的隐藏挂载或删减版 Main View；三者只复用内部 Viewer registration/rendering。`PreviewPresentation` 与 raw Viewer registry 不作为跨包扩展 API，避免消费者绕过授权和状态 owner。

备选方案：所有场景挂载 `PreviewRoot`。拒绝，因为会为卡片/Overlay 创建无业务依据的 Preview session、订阅和持久 snapshot，并使卸载语义与主 View 混淆。

备选方案：只把原生元素提到 `@neko/ui`。拒绝，因为授权 descriptor、媒体生命周期和 Viewer snapshot 是 Preview 领域职责，不是通用视觉组件。

### 2. Descriptor-first 授权链

所有公共 Surface 只接受经 codec 校验的 `PreviewMediaDescriptor`。成功链为：

```text
Caller exact owner + ContentLocator
  -> Desktop sender/window authorization
  -> short-lived PreviewMediaDescriptor + opaque resource URL
  -> Preview embedded/main Surface
  -> package-owned Viewer
```

Agent conversation/scratch、Asset Center 和 Canvas document/node/output 使用显式 owner union case。Canvas owner 至少包含 Workspace、Canvas document、node 和 output identity；不得使用 active Canvas、selected node 或 recent Workspace 推断。owner union 一次性更新 producer、consumer、codec、fixture 和 tests，不建立兼容 decode。

Desktop 中保留的逻辑仅为实际 `webContents` sender/window identity、Workspace grant、ContentLocator 解析、resource registry 注册/撤销和 IPC wiring；Viewer 选择、presentation 状态、动作和分组均是 host-neutral/package-owned 行为，不能留在 `apps/neko-desktop`。

### 3. 原生元素是普通媒体的唯一浏览器终点

- 图片使用 HTML `<img>`；不使用 HTML `<image>`。
- 普通视频使用一个原生 `<video playsInline preload="metadata">`。
- 普通音频使用一个原生 `<audio preload="metadata">`。
- 自动播放默认关闭。只有明确用户手势或调用方声明的真实 quick-preview policy 才能启动；需要浏览器自动播放时必须静音，不能静默改变音频语义。
- Preview 的完整视频/音频控制仍可在原生元素外组合自定义 UI 和 presentation snapshot。
- 需要显式 PCM、转码、Range 或 dependency set 的场景继续通过 `@neko/media`/Host 返回声明式 descriptor；失败不得改走另一 provider/source/player。

Cut 的 `<video>`/`<canvas>` 仍由 Cut controller 直接拥有，因为其 element 是时间线 runtime 的执行端点，不是 Preview Viewer。

### 4. 状态 owner 按 Surface 生命周期分离

- Quick Surface：只拥有组件挂载期间的 ephemeral loading/error/playback state；卸载即停止元素并释放调用方授权 lease，不保存播放位置。
- Embedded Surface：由当前 Overlay/scene 拥有 ephemeral snapshot store；同一 Overlay 内切换多个结果时保存每个 descriptor 的临时缩放/播放状态，关闭 Overlay 后全部释放。
- Main Preview：继续由 Preview View/session 的 package-owned presentation snapshot 保存 media time/rate/volume、document 和 model state。

公共组件不得在缺失 owner 时回退全局 store。入口构造所需 store，或使用显式定义的 Surface-local ephemeral store；这两种是不同公开 contract，不通过可选参数猜测。

### 5. 业务外壳和结果集合留在调用方

Agent 保留消息卡片、Tool/Job 状态、折叠、文件名和多结果集合；Canvas 保留节点标题、选择、连接、快捷操作、生成状态、多图结果组和左右切换；Assets 保留列表/Inspector 外壳。集合 owner 将当前 active `PreviewMediaDescriptor` 传给 Viewer，Viewer 不解释 Job、Conversation、Canvas output 或 Asset membership。

快捷操作由调用方渲染并执行。公共 Viewer 只公开必要的 presentation callback，例如 activate、load/error、playback interaction；它不接收任意 action registry。

### 6. 文本展示与编辑使用不同 owner

- Agent 流式回复继续使用 Streamdown/Agent Markdown presentation；它不是 authoring surface。
- Canvas Markdown node 继续复用 `@neko/markdown/rich-surface` 的 Milkdown engine 做轻量编辑，并复用 `@neko/ui/markdown` 做只读节点展示。
- Text Editor 继续拥有 Workspace 文档 session、完整 Milkdown authoring、Source/Rich/Split 和保存语义。
- Main Preview 对 `text/plain` 使用只读 plain text Viewer；对明确 Markdown media type 使用共享只读 Markdown renderer。Quick Surface 最多显示调用方已提供的有界摘要，不读取完整文本文件。
- Preview 不导入 Text Editor，不向只读 Viewer增加编辑按钮；Canvas 不复制 Text Editor document session。

### 7. 公共样式必须局部作用且不决定业务 chrome

Preview Surface 使用 `neko-preview-*` scoped class、共享设计 token 和明确的 contained/content-only layout，不写 Canvas/Agent/Cut selector，不引入全局背景覆盖。调用方决定卡片边框、节点 selection ring、Overlay backdrop 和操作栏；Viewer 决定媒体适配、黑场、加载和错误内容。

locale 通过当前 Surface 的 provider/props 绑定，不依赖多个挂载 Surface 可互相覆盖的 module-global mutable locale。

### 8. Boundary and canonical path inventory

| Owner / role | Canonical public path | Producer -> consumer | Runtime boundary / retained responsibility | Replaced path / user-data impact |
| --- | --- | --- | --- | --- |
| `@neko/preview-domain` L0 | root + authorized-session | Host authorization -> all Preview Surfaces | strict descriptor、owner identity、diagnostic | 更新 owner union；不改 durable user content |
| `@neko/preview-webview` L2 | `/embedded`, `/root` | descriptor -> Viewer | registry、native elements、ephemeral/persistent viewer state | 替换 Agent/Assets/Canvas Overlay 平行 renderers；无数据迁移 |
| `@neko/agent-webview` L2 | package root | transcript projection -> Quick Surface | card、Tool status、collapse、result grouping | 删除 ImagePreview/VideoCard/AudioCard 的成功渲染实现；transcript facts 不变 |
| `@neko/canvas-webview` L2 | package root | exact node/output -> Embedded Surface | node、actions、collection、Overlay、Canvas playback coordination | 替换 image-only immersive renderer；`.nkc` facts 不变 |
| `@neko/assets-*` | package roots | item projection -> Quick Surface | catalog/selection/Inspector | 替换 Resource Browser 专用 quick rendering；Asset facts 不变 |
| `@neko/cut-*` | package roots | OTIO timeline -> Cut monitor | dual video、Canvas、PCM、clock、seek | 无替换；poison test 阻止 Preview Surface 进入 Cut monitor |
| `apps/neko-desktop` | package Root wiring + typed IPC | sender/locator -> descriptor | Electron trust、resource registration/release | 删除 viewer/business rendering wiring；无用户数据影响 |

## Risks / Trade-offs

- [公共 Surface 变成可选参数过多的万能组件] → 维持 Quick、Embedded、Root 三个明确 entry，共享内部 Viewer 而非共享业务 chrome。
- [Agent 卡片迁移后丢失紧凑布局或 Tool 状态] → 只替换卡片 body，保留 Agent presenter/card owner，并做相邻 transcript UI 验收。
- [Canvas Overlay 切换多图时泄漏旧媒体] → active descriptor 切换前停止旧 element、释放旧 lease，并在 Overlay-local store 中隔离 descriptor state。
- [共享 CSS 再次污染 Canvas/Agent 背景] → scoped selectors、token contract 和跨 Surface visual regression；禁止 package 外 selector。
- [多个 Surface 的 locale 相互覆盖] → 使用 Surface-bound locale provider，移除嵌入式路径对 module-global mutable locale 的依赖。
- [完整 Preview Player 使轻量卡片 bundle 过重] → 按 content kind lazy-load；Quick image 不加载 audio/video/document/model chunk。
- [主 Preview 与轻量 Surface 自动播放行为分叉] → 在 contract 中固定默认关闭，任何自动播放由明确入口 policy 和用户手势测试证明。
- [Canvas inline 播放与公共 Viewer 继续重复] → 本变更先处理沉浸式路径；保留的 inline 专用协调写入 non-goal，后续只有在 lifecycle/port 真正一致时独立收敛。

## Migration Plan

1. 在 Preview Domain 一次性扩展精确 embedded owner identity/codec，并补充 fail-local contract tests。
2. 在 Preview Webview 内提取不导出的 Viewer kernel，建立 `/embedded` public entry、Surface-local snapshot owner、scoped styling 和按类型 lazy loading；保持主 `PreviewRoot` 使用同一 kernel。
3. 先将 Resource Browser Quick Surface 切到 canonical entry，验证单图/视频/音频授权、加载、错误和释放。
4. 将 Agent media card body 和 Generation Job 结果切到 Quick Surface，保留 card/group owners，删除所有被替代的 raw `<img>/<video>/<audio>` 成功路径及 imports。
5. 将 Canvas immersive Overlay 切到 Embedded Surface，保持 Canvas group/navigation/actions；删除 image-only parallel immersive renderer 和 Canvas-to-main-Preview effect。
6. 对 Canvas inline playback 仅做路径审计和 poison assertions，不改变其 Playback Workspace/hover owner；Cut monitor 增加禁止导入 Preview embedded entry 的架构测试。
7. 收敛 plain text/Markdown 只读 Viewer 与 Canvas/Text Editor authoring boundary，验证 Agent Streamdown 未被用作编辑器。
8. 运行 package typecheck/tests、路径级 contract tests、真实 Electron media fixtures、UI validation 和 quality review；确认关闭/切换/失败只影响当前 Surface。

本变更不改变 durable Canvas、Conversation、Asset、Cut 或 Preview document facts，因此可通过原子回退代码恢复旧构建；不得在同一发布中保留旧/新 renderer runtime flag 或双路径。

## Open Questions

无 apply-blocking open question。Canvas inline video/audio 是否最终复用 Preview Viewer 取决于后续对 playback store、hover ownership 和 transport lifecycle 的独立证据，不属于本变更。
