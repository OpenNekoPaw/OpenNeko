## Why

Workbench 已按 UI residency 约束只挂载当前可见业务 Root，但 Canvas、Text Editor 和 Resource Browser
仍在动态模块挂载后才请求首份领域 Snapshot；Canvas 首份 Snapshot 还同步等待 Generation Job 恢复。
因此用户每次切换回可见 View 都会重新经历串行全屏加载，后台恢复变慢时甚至长期停在“加载中”。Cut
和 Preview 已使用 Surface-owned preparation 并行模块与 Snapshot，其他创作 Surface 必须收敛到同一启动语义。

EPUB 虽已按视口渲染章节，但仍在打开阶段读取完整 ZIP，且 Preview Root 静态加载所有格式 Viewer，因此
原有 Preview 实现也不满足界面即时反馈和数据按需读取。

## What Changes

- Canvas、Cut、Preview、Text Editor 与 Resource Browser Surface 在显示稳定加载界面的同时，并行准备动态模块和精确 identity 下的首份领域 Snapshot；模块挂载不得成为数据读取的前置条件。
- Canvas 首份 Snapshot 只等待权威文档读取；Generation Job 恢复在 Session 发布后异步执行并通过 canonical projection event 更新，不得阻塞首屏。
- Preview Root 按实际 `contentKind` / MIME 动态加载唯一 Viewer，打开 EPUB 不再执行 PDF、DOCX、CBZ、Model、Audio 或 Video Viewer 模块。
- **BREAKING**：EPUB Viewer 只接受授权的虚拟目录资源 URL，不再把完整 `.epub` 二进制交给 epub.js 的 JSZip archive 路径。
- `@neko/content/document/node` 提供只读 ZIP entry 资源，Desktop exact-resource registry 只将该已授权资源树投影为 sender-bound opaque URL；Renderer 继续不接收本地路径。
- EPUB 初始化只读取 ZIP 目录、container、OPF、navigation 和 spine metadata；当前章节及其 CSS、图片、字体等资源由浏览器按需请求，未访问章节不读取、不解压、不构建 DOM。
- 快速切换或卸载时，旧 View/session 的异步结果不得覆盖当前 Surface，相关订阅、请求和资源注册按精确 identity 释放；失败在当前 Surface 可见且不影响 sibling Root。

## Capabilities

### New Capabilities

- `creative-surface-progressive-bootstrap`: 定义 Canvas/Cut/Preview/Text Editor/Resource Browser 界面、动态模块和首份领域数据的并行启动、局部加载/错误展示与精确 identity 生命周期。

### Modified Capabilities

- `desktop-media-consumer-projection`: Preview Viewer 改为按格式加载，EPUB 通过授权虚拟目录消费按需 entry，而不是读取完整归档。
- `desktop-openneko-resource-transport`: exact-resource registry 增加 package-owned 只读资源树投影，同时保持 sender、路径、MIME、取消和释放约束。
- `epub-preview-progressive-rendering`: 删除“归档可完整读取”的要求，扩展为 ZIP entry、章节和关联资源的字节级按需读取。

## Impact

- Owning responsibility：各 Webview package 拥有自身可见 Surface bootstrap；`@neko/canvas-domain` 拥有 Canvas Session 文档就绪与 Generation 恢复的解耦；`@neko/preview-webview` 拥有 Viewer 模块选择和 EPUB 浏览器渲染；`@neko/content/document/node` 拥有 Node ZIP entry 解析与读取；`@neko/preview-domain` 拥有 EPUB entry MIME 语义。
- Desktop role：`apps/neko-desktop` 只组合 package public entry、精确 View/session identity，并在 Electron trust boundary 将已授权只读资源树注册为 transient `openneko://resource` URL。
- Public/API impact：Canvas、Preview、Text Editor、Resource Browser Root 使用 package-owned bootstrap resource；Cut runtime bridge增加显式 prepare/dispose 生命周期；Desktop resource registry 增加只读虚拟资源树注册。
- User data：不修改 EPUB、OTIO、阅读位置或项目事实；opaque URL、ZIP entry 与加载状态仍为可丢弃 runtime projection。
- Dependencies：复用仓库已有 `@zip.js/zip.js` 和现有 `openneko:` resource handler，不新增协议、loopback server、缓存或隐藏 React Root。
