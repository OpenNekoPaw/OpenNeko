## Context

Text Editor Rich 和 Canvas 沉浸式 Markdown 编辑器都消费 `@neko/markdown/rich-surface`，但表格 DOM 目前直接是 `table`，consumer 只能让整个编辑区域横向溢出或压缩单元格。Canvas 全屏文件预览走另一条只读链：`@neko/preview-webview` 消费 `@neko/ui` 的 `MarkdownDocumentView`。该 renderer 已有滚动 wrapper，但 `table` 固定 `width: 100%` 且没有列数驱动的最小宽度，因此仍会压缩。

### Five-layer analysis

| Layer          | Decision                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Responsibility | `@neko/markdown` 拥有 Rich table 的稳定 DOM hook；`@neko/ui` 拥有只读 Markdown table 的稳定 DOM hook；各 Webview 只应用主题化 presentation。     |
| Dependency     | 只依赖浏览器 DOM、React 和既有 Markdown AST；不引入 Electron、Host、Workspace IO 或新的 renderer。                                               |
| Interface      | 复用现有 Rich Surface 和 `MarkdownDocumentView` public entry，不增加业务 contract；共享 class/data attributes 仅是可丢弃 presentation contract。 |
| Extension      | 新增 Markdown consumer 可复用同一 hook；列数增加时由结构决定最小宽度，不需要为文档类型或 Skill 增加分支。                                        |
| Test           | Rich Surface DOM 测试验证 wrapper 和 round trip；UI renderer 测试验证列数宽度；consumer CSS contract 与真实 Electron 图形证据验证可读性。        |

## Goals / Non-Goals

**Goals:**

- 五列及以上 GFM 表格不再被压缩成逐字换行的窄列。
- 横向滚动局限在表格自身，正文阅读和整个 View 不发生横向漂移。
- 编辑态、Canvas 沉浸式编辑态和只读文件预览具有一致的表格层次。

**Non-Goals:**

- 不修改 Skill 输出规则、文档内容或自动重写现有 Markdown。
- 不引入私有 Markdown 语法、table schema、分页或电子表格编辑能力。
- 不重做整套 typography、主题 token 或 Text Editor 布局。

## Decisions

### 1. Rich table 使用 package-owned presentation NodeView

`@neko/markdown/rich-surface` 为 GFM `table` 提供一个 `div.neko-markdown-table-scroll` 外壳，内部仍是标准 `table > tbody` content DOM。Milkdown schema、parser 和 serializer 保持 canonical；NodeView 只解决局部滚动边界，编辑仍由同一个 ProseMirror document 和 caller-owned source authority 完成。

### 2. 只读 renderer 根据列数设定最小宽度

`MarkdownDocumentView` 继续渲染标准 table，并在共享 wrapper 上声明列数。table 具有 40rem 的完整文档基线，每个 cell 具有 12rem 的可读最小宽度，因此多列表格由标准 table intrinsic layout 自然扩展；父级 wrapper 承担局部横向滚动。规则只存在于 class/CSS，不生成 inline style，也不进入 Markdown AST、projection 或持久数据。

### 3. Consumer 只拥有主题化视觉

Text Editor、Preview 和 Canvas Webview 对相同 hook 设置表头背景、边框、cell padding、line-height 和 scrollbar behavior。颜色继续来自各 surface 已有 token；不建立第二套主题或全局 CSS owner。

## Boundary inventory

| Owner / role                    | Canonical path                            | Producer -> consumer                                     | Runtime boundary           | Replaced path / user-data impact                     |
| ------------------------------- | ----------------------------------------- | -------------------------------------------------------- | -------------------------- | ---------------------------------------------------- |
| `@neko/markdown` Rich structure | `src/browser/milkdown-rich-surface.tsx`   | GFM table node -> Rich consumers                         | browser-only package entry | 替换无局部 scroll owner 的直接 table DOM；无数据影响 |
| `@neko/ui` read-only structure  | `src/markdown/markdown-document-view.tsx` | normalized Markdown AST -> Agent/Preview/Canvas renderer | React L2                   | 替换固定 `w-full` 压缩；无数据影响                   |
| Webview presentation            | package-owned CSS                         | shared hook -> visible theme                             | visible browser Surface    | 仅 presentation；无 durable state                    |

## Risks / Trade-offs

- 宽表需要用户横向滚动，但相比逐字换行能保留列语义和显著降低行高。
- 小型 Canvas 卡片仍可能出现局部横向滚动；这是现有卡片尺寸下展示结构化表格的可见、局部行为，不会扩大整个 Canvas scroll width。
- ProseMirror table NodeView 必须保留编辑和序列化语义，因此以真实 Rich Surface 测试和 Electron 编辑验证作为完成条件。

## Migration Plan

1. 增加共享 renderer 与 Rich Surface 失败测试。
2. 原子加入 presentation wrapper 和按列数宽度。
3. 更新三个 consumer 的 package-owned CSS。
4. 运行 package tests/build、严格 OpenSpec、质量审查和可见 Electron 验证。

无 durable migration；回退 presentation code 即恢复旧显示，Markdown source 不受影响。

## Open Questions

无 apply-blocking open question。
