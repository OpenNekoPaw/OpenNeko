## Context

Desktop 当前只在 `DesktopCutSurface` / `DesktopPreviewSurface` 挂载后调用 `React.lazy`，Cut Root 发送 `cut:ready`、Preview Root effect 启动后才调用 `getSnapshot()`。因此模块解析、CSS 执行和领域 bootstrap 串行。Preview Root 还静态导入所有格式 Viewer；EPUB 使用 `ePub(url, { openAs: 'epub' })`，自定义 request 对 binary 调用 `arrayBuffer()`，导致完整 ZIP 在 Renderer 内进入 JSZip。

现有 `openneko://resource` handler 已提供 sender-bound、opaque、Range-aware 文件 URL；CBZ 已证明 `zip.js` 可以只读取 ZIP 目录和目标 entry。Renderer/Webview 不得获得本地路径，Desktop Main 不得拥有 EPUB 解析规则，不可见 Root 不得为了预热而常驻。

## Goals / Non-Goals

**Goals:**

- Surface fallback 首次提交后即并行启动动态模块与精确 session Snapshot，不再由 Root 模块挂载触发首份数据读取。
- Preview 只执行当前格式 Viewer 的模块和 CSS。
- EPUB 只在 Node ZIP owner 中读取中央目录及被请求 entry；epub.js 以虚拟目录模式自然请求 container、OPF、navigation、章节和关联资源。
- 保持一个 authoritative Preview/Cut runtime、一条 Snapshot 路径、精确 identity、可取消释放和局部可见失败。
- 通过路径测试和真实 Electron 证据分别验证冷/热模块、首份数据并行以及未访问 EPUB entry 不被读取。

**Non-Goals:**

- 不保留隐藏 Cut/Preview Root，不新增通用 LRU、跨领域 cache manager 或数据预热 catalog。
- 不改变 OTIO/EPUB 文件内容、项目事实、阅读位置或 Viewer presentation snapshot 格式。
- 不为 EPUB entry 建立 loopback server、Renderer 文件访问、完整归档 fallback 或临时全量解压目录。
- 不承诺压缩 entry 内的随机访问；一个被请求 entry 可以被完整解压，但未请求 entry 不得读取或解压。

## Decisions

### Surface owns a small preparation resource, not a hidden Root

`@neko/cut-webview/runtime-bridge` 的 concrete bridge 增加幂等 `prepare()` / `dispose()`。`prepare()` 在 Cut Surface fallback 提交后立即订阅 exact runtime 并启动唯一 `getSnapshot()`；bridge 保存最新 Snapshot，在 Root 后续订阅时重放。`cut:ready` 复用同一 pending/current Snapshot，不再发起第二次 bootstrap。

`@neko/preview-webview/runtime-bootstrap` 提供由 exact `PreviewHostRuntime` 构造的幂等 preparation resource。Desktop Preview Surface 在 effect 中启动它，Preview Root 只消费该 resource 的唯一 Snapshot Promise 和同一 runtime。该 resource 只缓存本次可见 Surface 的 Promise，不持有领域事实、React tree 或跨 View cache。

替代方案是在 renderer startup 直接挂载或保留隐藏 Roots。拒绝原因是它违反 UI residency 约束，并把访问历史变成长期 React/subscription 资源。

### Preview session publication becomes demand-driven

Preview open 先创建 exact View/session 和 `loading` projection，保存 Host-only、session-bound source preparation；它不读取文档内容或注册 runtime URL。Surface 的 bootstrap `getSnapshot()` 触发一次 preparation：普通文件注册 exact file，glTF 注册 frozen dependency set，EPUB 创建 ZIP entry source并注册资源树。成功后 Preview session 原子提交 `ready` projection；失败提交当前 session 的 `unavailable` diagnostic。

同一 session 的并发 Snapshot 共享一个 pending preparation。关闭、替换、Window detach 或 renderer change 会取消 preparation、释放 resource registration，并阻止 stale result 提交。绝对路径只存在于 Desktop Host adapter 的短生命周期 source preparation，不进入 contract 或 Renderer。

替代方案是在 Renderer 直接读取 archive Range。拒绝原因是 epub.js 仍需要可加载的章节相对 URL和资源 URL，最终会引入 archive 内部 adapter、Blob URL 图和第二套资源生命周期。

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

| Responsibility | Owner / role | Canonical public path | Producer | Consumer | Runtime boundary | Replaced path |
| --- | --- | --- | --- | --- | --- | --- |
| Cut preparation/replay | `@neko/cut-webview`, L2 | `runtime-bridge` | exact Cut host runtime | visible Cut Root | Renderer -> typed Cut IPC | Root-ready then first Snapshot |
| Preview preparation | `@neko/preview-webview`, L2 | `runtime-bootstrap` | exact Preview host runtime | visible Preview Root | Renderer -> typed Preview IPC | Root effect then first Snapshot |
| Viewer selection | `@neko/preview-webview`, L2 | `root`, `quick-preview` | ready descriptor | exact Viewer | browser ESM | one static all-viewer Root chunk |
| ZIP entry index/read | `@neko/content`, L1 Node | `@neko/content/document/node` | authorized absolute file adapter | Preview resource publisher | Node file boundary | Renderer full ArrayBuffer + JSZip |
| Opaque archive tree | Desktop Application trust adapter | `DesktopResourceRegistry.registerResourceTree` | package-owned entry source | authorized WebContents | Electron protocol/sender boundary | whole archive file registration |
| EPUB chapter render | `@neko/preview-webview`, L2 | EPUB Viewer module | opaque virtual directory | visible chapter/rendition | browser Renderer | archived epub.js full-open path |

User data is unchanged. Runtime preparation, entry maps, opaque URLs, module promises and loading/error state are disposable projections; none are persisted or used as content identity.

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

Rollback restores the previous code as one atomic boundary. No data migration or user-file rewrite is required.

## Open Questions

无。
