# UI Validation Plan

## Acceptance inventory

| Surface / state                  | Functional acceptance                                                                      | Visual acceptance                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Text Editor Markdown Rich        | Existing seven-column document opens, remains editable and keeps the same source authority | Table columns remain readable; local horizontal scroll appears; body and outline do not widen |
| Canvas full text preview         | Authorized Markdown file loads through Preview Webview                                     | White document page keeps readable hierarchy; table header/cells match Rich and no逐字窄列    |
| Canvas immersive Markdown editor | Existing Markdown node opens and serializes through shared Rich Surface                    | Same local table treatment inside the document page                                           |
| Narrow / adjacent regression     | Heading, paragraph, list, source switch and close/reopen remain usable                     | No clipping, overlap, global horizontal drift or theme regression                             |

## Authoritative runtime

- 可见真实 Electron Desktop development runtime。
- 使用用户已配置的真实 Workspace 和现有生成文档；不以静态 HTML、单元测试或 mock 截图代替最终验收。
- 直接图像审查，检查编辑态与全屏预览态。

## Failure policy

- 无法启动或控制真实 Electron 时标记 `infrastructure-blocked`，不得把 unit/headless 结果写成 UI pass。
- 表格仍逐字换行、整个 View 横向漂移、Rich 编辑失效或 source 变化均为 apply-blocking failure。

## Validation result — 2026-08-23

状态：`pass`。

- Text Editor Rich：打开现有七列表格计划，窄主面板中单元格保持可读宽度，表格底部出现局部横向滚动；拖动后可查看后续“阶段交付物”“验收标准”列，外层文档和 Canvas 未横向扩张。
- Canvas full text preview：同一文件通过主面板预览打开，页面层级、正文和列表正常；横向拖动表格可查看“验收标准”“风险与 blocked 项”，页面本身不漂移。
- Adjacent regression：标题、段落、列表、资源浏览器、文档标签和关闭/重开路径保持可用，未观察到遮挡、全局溢出或主题回归。
- Source integrity：实现只增加可丢弃的 presentation wrapper 与样式，继续使用同一 GFM parser、serializer 和授权文件来源。

命令、结果与未归因于本变更的仓库门禁问题见 `verification.md`。
