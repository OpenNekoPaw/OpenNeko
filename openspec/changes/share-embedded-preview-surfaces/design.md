## Context

OpenNeko 只需要两套预览 UI：Agent/Canvas/Assets 复用的轻量预览，以及拥有独立 View/session 的主 Preview。全屏 Overlay 是轻量预览的调用方容器，不是第三种 Viewer presentation。当前 `quick`、`embedded`、`main` 参与 Viewer 实现选择，Canvas 普通节点又保留独立 media host/player，导致相同内容在不同入口命中不同能力。

Cut 的 Preview Panel 名称相近但职责不同：它是 OTIO 时间线的合成监视器，拥有双 video slot、Canvas 合成、PCM 主时钟和帧精确切换，不能被建模为单资源只读 Viewer。

本变更遵守以下约束：

- `ContentLocator` 是稳定内容 identity；只有 Desktop Host 可投影短生命周期 opaque resource URL。
- `@neko/preview-*` 是授权只读 Viewer 与 Preview presentation 的 owner；`@neko/media` 只拥有领域中立的 prepared media/browser runtime。
- Agent、Canvas、Assets、Cut 继续拥有各自的业务外壳、动作、选择、分组和 runtime lifecycle。
- Renderer 不接收 raw path，不自行展开 Workspace authority，不建立 provider/source fallback。
- 不增加内部 contract/version 字段，不保留新旧成功路径或隐藏 Viewer Root。

### Five-layer analysis

| Layer          | Decision                                                                                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Preview 拥有单资源只读 Viewer、轻量 UI、主面板 Viewer 组合与 snapshot 语义；Agent/Canvas/Assets 拥有场景外壳和动作；Cut 拥有时间线监视器；Desktop 仅拥有授权和资源注册。                              |
| Dependency     | Agent、Canvas、Assets Webview 只依赖 `@neko/preview-domain` 与 `@neko/preview-webview/root` 的 `LightweightPreview`；Preview Webview 依赖 `@neko/media` browser runtime；Cut 不依赖 Preview Webview。 |
| Interface      | 一个 canonical `PreviewMediaDescriptor`、一个 Viewer kernel、一个 `LightweightPreview` public entry；主面板组合相同 Viewer。调用方不传 raw URL/path 或业务动作表。                                    |
| Extension      | 新只读内容类型在 Preview registry 中显式注册；新业务快捷操作留在调用方；不使用 wildcard renderer、mode JSON bag 或 first-compatible registry。                                                        |
| Test           | Domain codec、Webview lifecycle、消费者 poison-path、Desktop sender/resource authorization、可见 Electron 功能和 UI 证据共同验证唯一调用链与局部失败。                                                |

## Goals / Non-Goals

**Goals:**

- 建立由 Preview package 拥有、可被 Agent/Canvas/Assets 组合的唯一 `LightweightPreview`。
- 让轻量组件和主 Preview 组合同一个严格 Viewer kernel 与媒体元素能力，同时保持各自 UI 和状态 owner。
- 将普通图片、视频和音频的最终浏览器渲染统一到 `<img>`、`<video>` 和 `<audio>`，并统一授权、加载、错误、自动播放和释放规则。
- 保留 Canvas 内全屏预览，不再把 Canvas 快速查看解释为跳转主 Preview。
- 明确 Canvas 轻量 Markdown 编辑、Text Editor 完整 authoring、主 Preview 只读文本查看和 Agent 流式 Markdown 展示的边界。
- 删除 Agent/Assets/Canvas 沉浸预览中被替代的平行成功渲染路径，并以路径级测试证明唯一 consumer。

**Non-Goals:**

- 不把 Cut 时间线监视器改造成 Preview Surface。
- 不把 Canvas 播放 handoff、节点选择或业务动作放入 Viewer；这些意图由 Canvas 外壳持有并通过轻量组件的受控参数表达。
- 不把裁剪、重绘、复制、保存为素材、加入参考、Tool 状态或生成结果分组放入 Preview Viewer。
- 不在主 Preview、Agent 或 Lightweight Preview 中增加文本编辑。
- 不增加云端预览服务、跨窗口共享播放器、通用媒体 facade、插件 renderer registry 或内部 contract 版本。

## Decisions

### 1. 一个 Viewer 内核、一个轻量公共入口、一个主面板外壳

`@neko/preview-webview` 内部保留一个非扩展式 Viewer registry。跨包只通过既有 `@neko/preview-webview/root` 入口公开 `LightweightPreview`；Agent、Canvas、Assets 统一使用该组件，避免长期运行的开发服务依赖新增 package 子路径。`PreviewRoot` 是主面板 runtime、标题栏、操作与持久 snapshot 的外壳，并在内容区组合同一个 Viewer。

Viewer 不接收 `main | quick | embedded`。轻量 UI 可通过明确的控件参数表达是否显示紧凑控制、是否受控播放；这些参数不得选择另一个元素、codec、resource source 或播放器实现。全屏由调用方的 Overlay/View CSS 和输入边界实现。

资源目录 hover preview 使用同一 `LightweightPreview` 的显式 ambient media policy：原生 `<video>` 静音、自动播放、循环且不显示完整控制条；原生 `<audio>` 有声自动播放且不渲染波形、缩略卡片或播放控件。它只改变共享元素的接入参数，不建立资源目录播放器。Agent、Canvas 普通节点与普通轻量预览使用手动紧凑控制；Asset Center 选中项使用 Main Preview 外壳组合相同 Viewer。Asset Center catalog 只保留静态 icon thumbnail，不再把 hover thumbnail 描述为第二条媒体预览成功路径。

每个媒体元素挂载实例只有一个播放控制者。Canvas 普通节点不传受控播放参数，悬停只改变节点视觉反馈，用户通过原生视频控件或 Preview-owned 紧凑音频控件手动播放；指针离开、节点选择和拖拽均不得改变播放。Canvas 故事线播放工作区传入受控播放参数并独占播放意图，Viewer 在该挂载中隐藏内部播放控件。资源目录 ambient 挂载由悬停入口控制，离开时卸载并释放资源。受控或 ambient 的异步 `play()` 完成必须服从最新暂停/卸载意图。

备选方案：所有场景挂载 `PreviewRoot`。拒绝，因为会为卡片/Overlay 创建无业务依据的 Preview session、订阅和持久 snapshot，并使卸载语义与主 View 混淆。

备选方案：只把原生元素提到 `@neko/ui`。拒绝，因为授权 descriptor、媒体生命周期和 Viewer snapshot 是 Preview 领域职责，不是通用视觉组件。

### 2. Descriptor-first 授权链

所有公共 Surface 只接受经 codec 校验的 `PreviewMediaDescriptor`。成功链为：

```text
Caller exact owner + ContentLocator
  -> Desktop sender/window authorization
  -> short-lived PreviewMediaDescriptor + opaque resource URL
  -> Lightweight Preview or Main Preview shell
  -> package-owned Viewer
```

Agent conversation/scratch、Asset Center 和 Canvas document/node/output 使用显式 owner union case。Canvas owner 至少包含 Workspace、Canvas document、node 和 output identity；不得使用 active Canvas、selected node 或 recent Workspace 推断。owner union 一次性更新 producer、consumer、codec、fixture 和 tests，不建立兼容 decode。

Desktop 中保留的逻辑仅为实际 `webContents` sender/window identity、Workspace grant、ContentLocator 解析、resource registry 注册/撤销和 IPC wiring；Viewer 选择、presentation 状态、动作和分组均是 host-neutral/package-owned 行为，不能留在 `apps/neko-desktop`。

### 3. 原生元素是普通媒体的唯一浏览器终点

- 图片使用 HTML `<img>`；不使用 HTML `<image>`。
- 普通视频使用一个原生 `<video playsInline preload="metadata">`。
- 普通音频使用一个原生 `<audio preload="metadata">`。
- 自动播放默认关闭。只有明确用户手势或调用方声明的真实 lightweight-preview policy 才能启动；需要浏览器自动播放时必须静音，不能静默改变音频语义。
- Preview 的完整视频/音频控制仍可在原生元素外组合自定义 UI 和 presentation snapshot。
- 需要显式 PCM、转码、Range 或 dependency set 的场景继续通过 `@neko/media`/Host 返回声明式 descriptor；失败不得改走另一 provider/source/player。

Cut 的 `<video>`/`<canvas>` 仍由 Cut controller 直接拥有，因为其 element 是时间线 runtime 的执行端点，不是 Preview Viewer。

### 4. 状态 owner 按调用方生命周期分离

- Lightweight Preview：由卡片、节点、Asset slot 或 Overlay 的精确调用方拥有 snapshot；未提供 snapshot 时只保留组件挂载期间的临时状态。
- Main Preview：继续由 Preview View/session 的 package-owned presentation snapshot 保存 media time/rate/volume、document 和 model state。

公共组件不得在缺失 owner 时回退全局 store。入口构造所需 store，或使用显式定义的 Surface-local ephemeral store；这两种是不同公开 contract，不通过可选参数猜测。

### 5. 业务外壳和结果集合留在调用方

Agent 保留消息卡片、Tool/Job 状态、折叠、文件名和多结果集合；Canvas 保留节点标题、选择、连接、快捷操作、生成状态、多图结果组和左右切换；Assets 保留列表/Inspector 外壳。集合 owner 将当前 active `PreviewMediaDescriptor` 传给 Viewer，Viewer 不解释 Job、Conversation、Canvas output 或 Asset membership。

快捷操作由调用方渲染并执行。公共 Viewer 只公开必要的 presentation callback，例如 activate、load/error、playback interaction；它不接收任意 action registry。

### 6. 文本展示与编辑使用不同 owner

- Agent 流式回复继续使用 Streamdown/Agent Markdown presentation；它不是 authoring surface。
- Canvas Markdown node 继续复用 `@neko/markdown/rich-surface` 的 Milkdown engine 做轻量编辑，并复用 `@neko/ui/markdown` 做只读节点展示。
- Text Editor 继续拥有 Workspace 文档 session、完整 Milkdown authoring、Source/Rich/Split 和保存语义。
- Main Preview 对 `text/plain` 使用只读 plain text Viewer；对明确 Markdown media type 使用共享只读 Markdown renderer。轻量卡片最多显示调用方已提供的有界摘要，不读取完整文本文件。
- Preview 不导入 Text Editor，不向只读 Viewer增加编辑按钮；Canvas 不复制 Text Editor document session。

### 7. 公共样式必须局部作用且不决定业务 chrome

Preview Surface 使用 `neko-preview-*` scoped class、共享设计 token 和明确的 contained/content-only layout，不写 Canvas/Agent/Cut selector，不引入全局背景覆盖。调用方决定卡片边框、节点 selection ring、Overlay backdrop 和操作栏；Viewer 决定媒体适配、黑场、加载和错误内容。

locale 通过当前 Surface 的 provider/props 绑定，不依赖多个挂载 Surface 可互相覆盖的 module-global mutable locale。

### 8. Boundary and canonical path inventory

| Owner / role               | Canonical public path           | Producer -> consumer                        | Runtime boundary / retained responsibility                       | Replaced path / user-data impact                                            |
| -------------------------- | ------------------------------- | ------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `@neko/preview-domain` L0  | root + authorized-session       | Host authorization -> all Preview Surfaces  | strict descriptor、owner identity、diagnostic                    | 更新 owner union；不改 durable user content                                 |
| `@neko/preview-webview` L2 | `/root`                         | descriptor -> Viewer                        | registry、native elements、ephemeral/persistent viewer state     | 替换 Agent/Assets/Canvas 平行 renderers；无数据迁移                         |
| `@neko/agent-webview` L2   | package root                    | transcript projection -> LightweightPreview | card、Tool status、collapse、result grouping                     | 删除 ImagePreview/VideoCard/AudioCard 的成功渲染实现；transcript facts 不变 |
| `@neko/canvas-webview` L2  | package root                    | exact node/output -> LightweightPreview     | node、actions、collection、Overlay、Canvas playback coordination | 删除普通节点与 Overlay 的独立 media renderer；`.nkc` facts 不变             |
| `@neko/assets-*`           | package roots                   | item projection -> LightweightPreview       | catalog/selection/Inspector                                      | 替换 Resource Browser 专用 quick rendering；Asset facts 不变                |
| `@neko/cut-*`              | package roots                   | OTIO timeline -> Cut monitor                | dual video、Canvas、PCM、clock、seek                             | 无替换；poison test 阻止 Preview Surface 进入 Cut monitor                   |
| `apps/neko-desktop`        | package Root wiring + typed IPC | sender/locator -> descriptor                | Electron trust、resource registration/release                    | 删除 viewer/business rendering wiring；无用户数据影响                       |

### 9. Canvas 使用两个显式预览入口并隔离 Overlay 交互

Canvas selection toolbar SHALL NOT reinterpret the Preview-owned `preview:open` material action as a local Canvas action. For an exact node/output that supports fullscreen viewing, Canvas adds a caller-owned `canvas:preview` action with a fullscreen icon; the Preview-owned `preview:open` action remains a separate Main Preview handoff with an external/open icon. The two buttons therefore have different action identity, label, icon and lifecycle:

- `canvas:preview` mounts `LightweightPreview` inside the current Canvas scene and never creates or navigates a Main Preview View/session.
- `preview:open` executes the canonical Host material action and opens/focuses Main Preview.

Image, video, audio and bounded text/Markdown/JSON file projections support Canvas fullscreen lightweight preview. PDF、DOCX、EPUB、CBZ and other document/model formats remain Main Preview-only because their navigation, Range/dependency and persistent snapshot capabilities belong to Main Preview. Node double-click follows the same policy rather than silently selecting another route.

Canvas Overlay is a modal interaction owner. While mounted, the viewport wheel listener, pan/marquee/connection gestures and Canvas editor shortcut dispatcher are suspended; the Overlay owns Escape and gallery arrow keys through a modal keyboard boundary. Viewer zoom/playback events stay inside the Overlay. Closing the Overlay restores the unchanged Canvas viewport and the previous keyboard focus.

Preview resource registration carries an explicit resource purpose. Thumbnail variants may remain caller-owned list decoration, while every interactive lightweight or Main Viewer receives the exact authorized content bytes/file. The adapter MUST NOT give a video/audio/text Viewer an image thumbnail or apply a caller-specific extension whitelist.

### 10. 文本 Viewer 使用独立阅读页而不是透明媒体场

Text preview is a document-reading presentation, not an image black-field variant. Preview owns a solid, high-contrast reading page: the page has an explicit foreground/background pair, a bounded readable line length, document padding, independent vertical scrolling and selectable text. Markdown and plain text share this shell while retaining their canonical read-only renderers. The shell MUST NOT inherit a caller Overlay foreground or expose the underlying Canvas through the document body.

Canvas keeps the modal title and close action, but does not reserve an empty gallery footer for a single text resource. Loading and failure remain local to the reading page with an explicit diagnostic; a transport failure MUST NOT be presented as faint unscoped text over the Canvas backdrop.

Every lightweight mount owns a request-scoped Preview descriptor and resource lease. A stale effect cleanup may release only the descriptor returned for that exact request; it MUST NOT release a remounted instance's lease merely because both requests target the same Canvas output. This keeps React remount and rapid reopen behavior fail-local without retaining stale resources.

Descriptor lease release is authorized by the lease ownership recorded when Host grants the resource: exact sender Window、Canvas session identity and descriptor identity. Release remains valid after the Canvas View has left the active Workbench because teardown necessarily runs after presentation detachment; it MUST NOT re-resolve the current active Workbench grant. A mismatched Window/session/descriptor releases nothing and MUST NOT affect sibling leases.

Lightweight and Main Preview continue to share the same native media elements and authorized resource path, while control presentation remains a parameter of the shared player. Lightweight video intentionally exposes the platform's native video controls. Lightweight audio hides the native control strip and uses the Preview-owned compact waveform transport so it remains legible inside Canvas, Agent and Assets cards; Main Preview retains the full audio presentation. A rejected `play()` promise without an `HTMLMediaElement.error` is an interaction/autoplay refusal, not a source failure, and MUST NOT replace an otherwise usable native video with a blocking diagnostic.

Shared media element setup/teardown is keyed by the descriptor resource, not by caller callback identity or playback projection objects. Updating Canvas playback intent, time projection or snapshot callbacks MUST NOT run resource cleanup, pause the element or restart playback. Only resource replacement or actual unmount snapshots and pauses the old element.

## Risks / Trade-offs

- [轻量组件变成可选参数过多的万能组件] → 只接受 descriptor、locale、可选受控播放与 snapshot callbacks；全屏、卡片、节点、集合和业务 chrome 均留在调用方。
- [Agent 卡片迁移后丢失紧凑布局或 Tool 状态] → 只替换卡片 body，保留 Agent presenter/card owner，并做相邻 transcript UI 验收。
- [Canvas Overlay 切换多图时泄漏旧媒体] → active descriptor 切换前停止旧 element、释放旧 lease，并在 Overlay-local store 中隔离 descriptor state。
- [共享 CSS 再次污染 Canvas/Agent 背景] → scoped selectors、token contract 和跨 Surface visual regression；禁止 package 外 selector。
- [多个 Surface 的 locale 相互覆盖] → 使用 Surface-bound locale provider，移除嵌入式路径对 module-global mutable locale 的依赖。
- [完整 Preview Player 使轻量卡片 bundle 过重] → 按 content kind lazy-load；轻量图片不加载 audio/video/document/model chunk。
- [主 Preview 与轻量 Surface 自动播放行为分叉] → 在 contract 中固定默认关闭，任何自动播放由明确入口 policy 和用户手势测试证明。
- [Canvas 播放协调再次复制 Viewer] → 只有故事线播放工作区保留受控意图；普通节点完全由共享 Viewer 手动控制。元素与资源生命周期必须由共享 Viewer 执行，边界测试 poison package-local `<img>/<audio>/<video>` 成功路径。

## Migration Plan

1. 在 Preview Domain 一次性收敛精确 owner identity/codec，并补充 fail-local contract tests。
2. 在 Preview Webview 内保留唯一 Viewer kernel，通过既有 `/root` public entry 导出 `LightweightPreview`，建立实例级 snapshot owner、scoped styling 和按类型 lazy loading；保持主 `PreviewRoot` 使用同一 kernel。
3. 将 Resource Browser 与 Agent media card/Generation Job 切到 `LightweightPreview`，保留调用方外壳并删除被替代 renderer。
4. 将 Canvas 普通节点与 fullscreen Overlay 都切到 `LightweightPreview`，保留 Canvas playback intent、集合、动作和 Overlay input owner，删除 inline media player 与专用 Host preparation path。
5. 统一 Desktop descriptor/resource/Range projection，验证同一 WebM、音频和图片在轻量与主面板命中相同底层处理。
6. Cut monitor 增加禁止导入 Preview public entry 的架构测试。
7. 收敛 plain text/Markdown 只读 Viewer 与 Canvas/Text Editor authoring boundary，验证 Agent Streamdown 未被用作编辑器。
8. 运行 package typecheck/tests、路径级 contract tests、真实 Electron media fixtures、UI validation 和 quality review；确认关闭/切换/失败只影响当前 Surface。

本变更不改变 durable Canvas、Conversation、Asset、Cut 或 Preview document facts，因此可通过原子回退代码恢复旧构建；不得在同一发布中保留旧/新 renderer runtime flag 或双路径。

## Open Questions

无 apply-blocking open question。
