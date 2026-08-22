## Context

Desktop 的 Cut/Preview 已在可见 Surface 层并行启动动态模块与 Snapshot，但 Canvas、Text Editor 和
Resource Browser 仍由 Root effect 在模块解析后启动 Snapshot。Canvas Main 创建 Session 时还同步执行
`reattachGenerationNodes()`，把外部 Job 查询与输入准备放在首份文档投影之前。Workbench 按当前 Scene
卸载隐藏 Root 后，返回 View 会重新暴露这条串行链。Preview Root 的格式加载与 EPUB 历史问题也属于同一
“重任务阻塞首个可用投影”问题。

现有 `openneko://resource` handler 已提供 sender-bound、opaque、Range-aware 文件 URL；CBZ 已证明 `zip.js` 可以只读取 ZIP 目录和目标 entry。Renderer/Webview 不得获得本地路径，Desktop Main 不得拥有 EPUB 解析规则，不可见 Root 不得为了预热而常驻。

## Goals / Non-Goals

**Goals:**

- 每个创作 Surface fallback 首次提交后即并行启动动态模块与精确 session Snapshot，不再由 Root 模块挂载触发首份数据读取。
- Canvas 权威文档 Snapshot 不等待 Generation Job 恢复；恢复结果通过同一 Session projection 发布。
- Preview 只执行当前格式 Viewer 的模块和 CSS。
- EPUB 只在 Node ZIP owner 中读取中央目录及被请求 entry；epub.js 以虚拟目录模式自然请求 container、OPF、navigation、章节和关联资源。
- 每个 Surface 保持一个 authoritative runtime、一条 Snapshot 路径、精确 identity、可取消释放和局部可见失败。
- 通过路径测试和真实 Electron 证据分别验证冷/热模块、首份数据并行以及未访问 EPUB entry 不被读取。

**Non-Goals:**

- 不保留隐藏业务 Root，不新增通用 LRU、跨领域 cache manager 或数据预热 catalog。
- 不改变 OTIO/EPUB 文件内容、项目事实、阅读位置或 Viewer presentation snapshot 格式。
- 不为 EPUB entry 建立 loopback server、Renderer 文件访问、完整归档 fallback 或临时全量解压目录。
- 不承诺压缩 entry 内的随机访问；一个被请求 entry 可以被完整解压，但未请求 entry 不得读取或解压。

## Decisions

### Surface owns a small preparation resource, not a hidden Root

`@neko/cut-webview/runtime-bridge` 的 concrete bridge 增加幂等 `prepare()` / `dispose()`。`prepare()` 在 Cut Surface fallback 提交后立即订阅 exact runtime 并启动唯一 `getSnapshot()`；bridge 保存最新 Snapshot，在 Root 后续订阅时重放。`cut:ready` 复用同一 pending/current Snapshot，不再发起第二次 bootstrap。

`@neko/preview-webview/runtime-bootstrap` 提供由 exact `PreviewHostRuntime` 构造的幂等 preparation resource。Desktop Preview Surface 在 effect 中启动它，Preview Root 只消费该 resource 的唯一 Snapshot Promise 和同一 runtime。该 resource 只缓存本次可见 Surface 的 Promise，不持有领域事实、React tree 或跨 View cache。

Canvas、Text Editor 和 Resource Browser 采用相同的 package-owned preparation resource：Desktop Surface
创建 exact runtime 后立即 `prepare()`，Root 消费同一 pending/latest Snapshot Promise 与同一 runtime。
Canvas bootstrap 额外负责把 runtime projection 订阅建立在 Snapshot 前，防止首次 Snapshot 与后续事件之间
出现窗口；它不复制 Canvas facts，也不跨 View 保存 Snapshot。

替代方案是在 renderer startup 直接挂载或保留隐藏 Roots。拒绝原因是它违反 UI residency 约束，并把访问历史变成长期 React/subscription 资源。

### Canvas publishes the document before background Generation recovery

Desktop Canvas Session 在完成 grant、路径解析、`.nkc` 读取与校验后立即注册并返回首份 Snapshot。
Generation 节点 reattach 作为同一个 Session 的后台恢复开始；每个节点的成功或局部 diagnostic 更新
`generationNodes` projection 并发布 canonical event。恢复失败不得把文档退回 loading，也不得创建第二个
Canvas authority。Session dispose 后的晚到结果必须被拒绝或忽略。

替代方案是把恢复结果放进独立 Renderer fetch 或空默认 Snapshot。前者会建立第二条事实路径，后者会掩盖
真实节点状态；两者都拒绝。

### Lightweight video owns the full node content box

Canvas 继续复用 Preview package 的 canonical `LightweightPreview` 和同一个原生 `<video>` 播放能力。
视频元素本身占满 Lightweight Preview 的可用宽高，`object-fit: contain` 只约束视频画面比例；节点外框、
黑色媒体场和原生控制条因此共享同一个 content box。不得让 `<video>` 按 intrinsic ratio 缩小元素边界，
否则控制条会悬在节点内部并形成看似额外的上下 margin。

该规则属于共享 Viewer 的尺寸语义，不在 Canvas 复制播放器或增加节点专用视频实现。Main Preview 与
Lightweight Preview 仍使用同一 `<video>` 组件，只由接入 Surface 决定外层尺寸和控制密度。

### Preview session publication becomes demand-driven

Preview open 先创建 exact View/session 和 `loading` projection，保存 Host-only、session-bound source preparation；它不读取文档内容或注册 runtime URL。Surface 的 bootstrap `getSnapshot()` 触发一次 preparation：普通文件注册 exact file，glTF 注册 frozen dependency set，EPUB 创建 ZIP entry source并注册资源树。成功后 Preview session 原子提交 `ready` projection；失败提交当前 session 的 `unavailable` diagnostic。

同一 session 的并发 Snapshot 共享一个 pending preparation。关闭、替换、Window detach 或 renderer change 会取消 preparation、释放 resource registration，并阻止 stale result 提交。绝对路径只存在于 Desktop Host adapter 的短生命周期 source preparation，不进入 contract 或 Renderer。

替代方案是在 Renderer 直接读取 archive Range。拒绝原因是 epub.js 仍需要可加载的章节相对 URL和资源 URL，最终会引入 archive 内部 adapter、Blob URL 图和第二套资源生命周期。

### Restored Preview Views rebuild runtime authority from ContentLocator

Pinned/side Preview View 的可恢复 presentation 只持久保存 document identity、显示元数据和 canonical
`ContentLocator`。`preview-session:*` 只标识该 Preview instance，不是内容 authority；sender-bound opaque URL、
pending source 和 resource lease 均为进程内 transient runtime state。Renderer reload 或 Desktop 重启释放旧
runtime 后，首个 exact Snapshot 由 Desktop Preview adapter 校验恢复的 View 与 locator，通过当前 Workspace
authority 重新解析源并注册新的 lease，再在同一 View identity 下提交 `loading -> ready | unavailable`。

缺失或非法 locator 的旧 presentation 只关闭受影响的 Preview View；源文件和其他 Workbench View 保持不变。
不得回退到 `documentId` 猜路径、active Workspace、旧 absolute path、旧 opaque URL 或最近一次 Preview session。

替代方案是持久化 resource URL 或让 Shell 复用旧 session registry。前者跨 renderer/sender 后必然失效且会
绕过授权生命周期，后者把可丢弃 runtime 提升为业务事实；两者都拒绝。

### Viewer modules follow the resolved format

Preview Root 保留小型状态、header、snapshot provider 和 viewer selector。PDF、DOCX、EPUB、CBZ、Model、Audio、Video 各自通过 `React.lazy` 精确导入；Quick Preview 移到独立 public entry，避免其 audio/video imports 回流主 Preview Root。每个 Viewer 使用稳定、等尺寸的局部 Suspense fallback；模块失败由当前 Preview Surface error boundary 显示。

模块 Promise 可由 hover/idle intent 预取，但文件/归档数据只在 exact View/session 已创建且可见 Surface 启动 preparation 后读取。动态 import 成功由 ESM cache 复用，不新增模块 cache registry。

### Content owns ZIP entry access; Desktop owns opaque publication

`@neko/content/document/node` 增加只读 `NodeArchiveResource`：打开时通过 `zip.js` + Node range reader读取中央目录，规范化并冻结 exact entry allowlist，拒绝 traversal、absolute path、duplicate path、encrypted entry 和超限 entry；`readEntry(path, signal)` 只解压被请求 entry，并在源文件 fingerprint 改变时拒绝。

Desktop resource registry 增加 `registerResourceTree(owner, source)`。source 只暴露 normalized entry metadata、MIME 和可取消 reader，不暴露 archive path。handler 对 exact virtual path 执行 sender 检查、MIME/length/Range 响应；未知、escaping、released 或 stale source fail closed。Registry 不解析 EPUB、container 或 OPF，也不选择 entry。

Preview domain 提供 EPUB entry MIME 解析；Desktop Preview adapter 把 content archive entry 映射为 registry resource tree。该逻辑需要 Electron Application boundary，因为它绑定实际 `webContentsId`、Window/View/session、协议请求和短生命周期授权；ZIP 解包与路径业务规则仍在 host-neutral Node package。

### epub.js uses one virtual-directory path

EPUB Viewer 删除 archived-binary loader，使用 descriptor base URL 以 `openAs: 'directory'` 和 `replacements: 'none'` 打开 epub.js。container、OPF、navigation 和 spine 是首屏必需 metadata；section render 和浏览器相对资源请求通过同一 opaque resource tree读取 entry。waterfall 继续只渲染 viewport neighborhood，paginated 继续只显示当前 rendition。

不保留 raw `.epub` ArrayBuffer fallback。Standalone/functional fixtures 也必须提供同一虚拟目录 contract，以证明生产 canonical path。

## Ownership And Runtime Path

| Responsibility               | Owner / role                                              | Canonical public path                                   | Producer                         | Consumer                      | Runtime boundary                           | Replaced path                                 |
| ---------------------------- | --------------------------------------------------------- | ------------------------------------------------------- | -------------------------------- | ----------------------------- | ------------------------------------------ | --------------------------------------------- |
| Cut preparation/replay       | `@neko/cut-webview`, L2                                   | `runtime-bridge`                                        | exact Cut host runtime           | visible Cut Root              | Renderer -> typed Cut IPC                  | Root-ready then first Snapshot                |
| Preview preparation          | `@neko/preview-webview`, L2                               | `runtime-bootstrap`                                     | exact Preview host runtime       | visible Preview Root          | Renderer -> typed Preview IPC              | Root effect then first Snapshot               |
| Preview restore source       | `@neko/preview-domain` source ref + Desktop trust adapter | Preview View `ContentLocator` / `DesktopPreviewRuntime` | persisted Workbench View         | fresh Preview runtime session | Host projection -> Electron resource lease | stale session/opaque URL reuse                |
| Canvas preparation/replay    | `@neko/canvas-webview`, L2                                | `runtime-bootstrap`                                     | exact Canvas host runtime        | visible Canvas Root           | Renderer -> typed Canvas IPC               | Root-ready then first Snapshot                |
| Canvas Generation recovery   | `@neko/canvas-domain`, L0 application session             | `CanvasHostRuntimeSession`                              | exact Canvas Session             | Canvas projection subscribers | Host-neutral async task                    | Session creation waiting for every Job resume |
| Text Editor preparation      | `@neko/text-editor-webview`, L2                           | `runtime-bootstrap`                                     | exact Text Editor host runtime   | visible Text Editor Root      | Renderer -> typed Text Editor IPC          | Root effect then first projection             |
| Resource Browser preparation | `@neko/assets-webview`, L2                                | `resource-browser/runtime-bootstrap`                    | exact Resource Browser runtime   | visible Resource Browser Root | Renderer -> typed Assets IPC               | Root effect then first projection             |
| Viewer selection             | `@neko/preview-webview`, L2                               | `root`, `quick-preview`                                 | ready descriptor                 | exact Viewer                  | browser ESM                                | one static all-viewer Root chunk              |
| ZIP entry index/read         | `@neko/content`, L1 Node                                  | `@neko/content/document/node`                           | authorized absolute file adapter | Preview resource publisher    | Node file boundary                         | Renderer full ArrayBuffer + JSZip             |
| Opaque archive tree          | Desktop Application trust adapter                         | `DesktopResourceRegistry.registerResourceTree`          | package-owned entry source       | authorized WebContents        | Electron protocol/sender boundary          | whole archive file registration               |
| EPUB chapter render          | `@neko/preview-webview`, L2                               | EPUB Viewer module                                      | opaque virtual directory         | visible chapter/rendition     | browser Renderer                           | archived epub.js full-open path               |

User content is unchanged. Preview View persists only its canonical `ContentLocator` source identity. Runtime preparation,
entry maps, opaque URLs, module promises and loading/error state remain disposable projections and are never recovery authority.

## Risks / Trade-offs

- [Some EPUBs use extensionless or incorrectly typed entries] -> Prefer OPF-declared media type when available and use a bounded EPUB MIME map; unsupported active resources fail visibly rather than enabling sniffing.
- [A requested compressed image/font entry is large] -> Enforce per-entry size bounds and cancellation; the guarantee is entry-level demand, not compressed-entry Range decoding.
- [Rapid View replacement races with preparation] -> Bind every preparation and commit to session identity, abort on release, poison stale completion in tests, and release any lease created after cancellation.
- [React StrictMode invokes lifecycle twice] -> `prepare()` and Snapshot reads are idempotent per resource; tests assert one runtime bootstrap and exact disposal.
- [Viewer split creates nested loading transitions] -> Keep dimensions stable, distinguish Surface bootstrap from format-module fallback, and capture cold/warm Electron states.
- [Existing dirty Desktop/Host work overlaps touched files] -> Apply minimal hunks against current content and stage only this change; do not revert unrelated work.

## Migration Plan

1. Add contracts/tests for loading Preview projection, idempotent preparation and one canonical Snapshot path.
2. Split Viewer public entries and switch Desktop consumers atomically.
3. Add Node archive resource plus Desktop resource-tree registration and path-level security tests.
4. Replace EPUB archived loader with the virtual-directory path and remove full-binary tests/functions.
5. Update the active EPUB progressive spec so full archive reads are no longer accepted; validate both changes strictly.
6. Run package tests/typechecks/build, then visible Electron cold/warm Cut and EPUB acceptance with request instrumentation.
7. Extend the same preparation contract to Canvas, Text Editor and Resource Browser; move Canvas Generation reattach behind the first Snapshot and qualify cold/warm Workbench View switching.
8. Persist Preview `ContentLocator` source refs and rebuild fresh runtime authorization after renderer/Desktop restart; locally remove older invalid Preview presentation records.

Rollback restores the previous code as one atomic boundary. No data migration or user-file rewrite is required.

## Open Questions

无。
