## Why

Markdown 文档在 Text Editor 富文本模式和 Canvas 全屏预览中会把多列表格压缩进正文阅读列。列数较多时，单元格只能逐字换行，表格行异常增高，编辑态与预览态也缺少一致的表头、间距和横向阅读方式。问题属于 Markdown presentation，而不是 Skill 内容或 Markdown 文件格式。

## What Changes

- 为共享 Markdown 富文本表格增加 package-owned 横向滚动结构，不改变 GFM source、schema 或编辑 authority。
- 共享只读 Markdown renderer 按列数计算稳定的最小表格宽度，并输出同一 presentation hook。
- Text Editor、Preview Webview 和 Canvas 沉浸式 Markdown 编辑器采用一致的可读单元格宽度、表头层次、边框和局部横向滚动。
- 保持正文、标题、列表、源码模式、文档持久化和现有用户内容不变。

## Capabilities

### New Capabilities

- `markdown-document-presentation`: 定义 Markdown 正文与宽表格在编辑和只读表面上的统一可读展示。

### Modified Capabilities

- 无。

## Impact

- `@neko/markdown` L0/browser entry：拥有 Milkdown GFM table 的 presentation-only NodeView 结构；不改变 parser、serializer 或 source contract。
- `@neko/ui` L2：共享只读 `MarkdownDocumentView` 输出同一表格滚动 hook 和按列数计算的最小宽度。
- `@neko/text-editor-webview` L2：为 Workspace Markdown Rich Surface 应用文档级表格样式。
- `@neko/preview-webview` L2：为授权 Markdown 文本预览应用同一阅读规则。
- `@neko/canvas-webview` L2：为已有沉浸式 Markdown 编辑器消费同一 Rich Surface 结构；不改变 Canvas durable node。
- `apps/neko-desktop`：无生产代码变化，继续只组合 package Roots。
- 用户数据：无 schema、内容、路径或持久化变更；仅改变可丢弃的浏览器 presentation。
