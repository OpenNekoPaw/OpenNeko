## Why

大型 EPUB 在首屏可读后仍会后台逐章渲染整本书以测量高度，导致图片解码、DOM 构建和内存占用持续增长，用户看到预览长时间卡顿。预览应只渲染当前视口及邻近章节，并在浏览过程中逐步校正布局。

## What Changes

- 删除 EPUB waterfall 模式初始化后的全书章节高度预热，不再按顺序渲染所有章节。
- 保留视口附近章节的 IntersectionObserver 加载/卸载，并只在导航到具体章节时预取有限邻域。
- 使用稳定估算高度作为未访问章节占位，章节实际进入加载范围后再校正高度与页数。
- 增加回归测试，证明首屏就绪后不会调用全量章节测量路径，导航仍能加载目标章节。
- EPUB 字节读取由 `progressive-creative-surface-loading` 变更收敛为 Host 授权虚拟目录；epub.js 只请求当前元数据、章节和资源条目。

## Capabilities

### New Capabilities

- `epub-preview-progressive-rendering`: 定义 EPUB waterfall 预览的视口级章节渲染、有限预取、占位布局与首屏就绪行为。

### Modified Capabilities

无。

## Impact

- Owning responsibility: `@neko/preview-webview` 拥有 EPUB 浏览器渲染、章节可见性和展示性能；归档条目读取与授权资源投影由 `progressive-creative-surface-loading` 的 Content Node/Desktop 边界拥有。
- Affected package role: `packages/preview/webview`（L2 browser UI）及其测试。
- Canonical path: 继续使用 `EpubViewer` 的单一 epub.js Book、IntersectionObserver 和 chapter render/unload 路径，删除平行的全书 background measurement 路径。
- User data: 只改变瞬时预览渲染，不修改 EPUB 文件、阅读位置或持久业务事实。
- Resource boundary: Viewer 只消费虚拟目录 URL，不再接收或读取完整 EPUB 归档 binary。
