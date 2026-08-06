## Context

`@neko/preview-webview` 的 `EpubViewer` 在 waterfall 模式中已有可见章节 `IntersectionObserver` 和 `loadChapterContent`/`unloadChapterContent` 路径，但同时维护隐藏 measurement container 与串行队列，在首屏 ready 后对 spine 中每一章执行 `section.render()`。因此“按需章节渲染”与“全书后台渲染”并存，后者会加载未访问章节资源并持续占用 CPU、DOM 与图片解码资源。

EPUB 以 ZIP 归档 URL 交给 epub.js，当前 archive open 会读取完整 binary。仓库没有 package-owned Range-aware EPUB archive adapter；本次只收敛重复章节渲染路径，不在 Webview 内再建立第二个 ZIP authority。

## Goals / Non-Goals

**Goals:**

- 让 `section.render()` 只由可见区加载和显式章节导航的有限预取触发。
- 未加载章节使用稳定估算占位；加载完成后局部校正高度和页数。
- 删除隐藏全书 measurement container、队列和全 spine 预热 effect。
- 保持 waterfall/paginated 切换、当前位置恢复、章节导航和内容发送能力。

**Non-Goals:**

- 不实现 EPUB ZIP 的中央目录 Range reader、Host 解包服务或临时文件缓存。
- 不改变 Preview domain contract、authorized descriptor、Desktop IPC 或用户阅读状态格式。
- 不改变 epub.js paginated rendition 的章节加载策略。

## Decisions

### Keep one canonical chapter render path

删除 `measureChapterHeight` 及其隐藏 measurement DOM。waterfall 中只有 `loadChapterContent` 可以调用 `section.render()`；IntersectionObserver 对视口上下一个 viewport 范围加载，离开范围后卸载。显式导航仅对目标章节及固定半径邻章预取。

替代方案是限制后台预热并发或只预热前 N 章。拒绝原因是它仍会在无用户需求时加载内容，并保留第二条成功渲染路径和额外资源生命周期。

### Estimate before observation, correct after real render

所有未访问章节先使用当前 viewport 与已测章节平均值计算占位高度。章节内容加载且图片/样式 settle 后，以真实 DOM 高度更新该章节占位与滚动指标；不为了精确总页数提前渲染整本书。

这会让初始总页数是估算值，并在阅读时逐步校正。该变化优先保证首屏交互与滚动连续性，而不是在打开阶段阻塞以获得精确全书像素高度。

### Keep archive loading boundary explicit

`@neko/preview-webview/epub` 继续通过 epub.js 打开 authorized archive URL。Range-aware ZIP 解包需要真实 Node/Renderer resource producer-consumer contract、取消与释放语义；没有这些 owner 前不在 Webview 加临时 archive adapter。

## Ownership And Runtime Path

| Responsibility                    | Package role                                 | Canonical path                                          | Producer                       | Consumer     | Runtime boundary           | Replaced path                      |
| --------------------------------- | -------------------------------------------- | ------------------------------------------------------- | ------------------------------ | ------------ | -------------------------- | ---------------------------------- |
| EPUB chapter visibility/rendering | `@neko/preview-webview`, L2 browser UI       | `EpubViewer` waterfall observer -> `loadChapterContent` | Current Book spine + viewport  | Chapter DOM  | Browser Renderer           | Hidden all-spine measurement queue |
| Authorized archive bytes          | Existing Preview/Desktop resource projection | Preview descriptor URL                                  | Host-authorized file publisher | epub.js Book | Electron resource boundary | Unchanged                          |

User data is unchanged: EPUB bytes and persisted reading position are not rewritten. No production logic is added to `apps/*`.

## Risks / Trade-offs

- [Estimated placeholders shift as chapters load] -> Preserve measured heights after unload, update metrics locally, and use immediate correction after navigation.
- [Far chapter navigation starts from an estimate] -> Prefetch target plus bounded neighbors before scrolling and perform one correction frame.
- [Large archive still delays initial metadata] -> Report as residual risk; do not claim byte-range loading until a real archive owner exists.
- [Removing premeasurement changes page count] -> Treat waterfall page count as a progressive viewport metric and test readable first paint/navigation rather than exact unopened-book pixels.

## Migration Plan

1. Add path tests for one canonical chapter render path and bounded neighborhood calculation.
2. Delete measurement-only refs, hidden DOM and warm-all effect in one edit.
3. Run Preview Webview tests/build and visible Electron EPUB smoke with a large image book.

Rollback restores the code path only; no user data migration is required.

## Open Questions

无。
