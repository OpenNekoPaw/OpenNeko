## Why

Agent 将图片、文本引用和 Markdown 结果投影到 Workspace Board 时，顶层内容固定使用 3 列、288 Canvas unit 列宽，生成批次又使用近似方形网格。对于默认宽度只有 120 的图片，这会产生大面积空白；5 个结果也会被拆为 3+2。另一方面，Markdown 与可预览文本引用仍使用 120×80 或 110×75 的紧凑卡片，正文几乎不可读。

## What Changes

- Workspace Board 顶层投影和生成批次统一为每行最多 5 个节点。
- 顶层列距由当前节点实际宽度与紧凑间隔计算，不再复用角色 lane 的固定宽度。
- Markdown 和可预览的 Markdown/JSON/纯文本文件引用使用统一的较宽阅读尺寸；非文本文件和媒体保持现有类型尺寸。
- 缩小生成批次的组内间距、边距和标题保留区，并缩小 Markdown/文本引用的视觉标题。
- 已持久化的 creator-owned 节点位置与尺寸保持权威，不对现有 Canvas 执行重排或迁移。

## Capabilities

### New Capabilities

- `canvas-agent-projection-layout`: 定义 Agent 投影节点的五列紧凑布局和内容类型默认阅读尺寸。

### Modified Capabilities

- 无。

## Impact

- `@neko/canvas-domain` L0：拥有 Workspace Board 纯投影布局和 canonical 新建节点尺寸；增加文本引用尺寸解析，不改变持久化 contract。
- `@neko/canvas-webview` L2：消费 domain sizing helper 创建节点，并仅调整 Markdown/文本引用的标题呈现。
- `apps/neko-desktop`：无生产代码变化；继续调用 package-owned Workspace Board 投影入口。
- 用户数据：仅影响新创建节点；已有 `.nkc` 位置、尺寸、内容和 `ContentLocator` 不变。
