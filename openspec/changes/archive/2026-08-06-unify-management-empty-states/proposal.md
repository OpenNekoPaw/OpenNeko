## Why

资源中心、扩展和所有项目目前使用三套空状态结构与尺寸规则，其中项目网格的空状态只占据第一列而视觉偏左，资源中心又缺少与其他目录一致的图标和文本层级。统一这些展示可以让管理目录在空数据和搜索无结果时保持一致、可辨认且响应式稳定。

## What Changes

- 扩展 `@neko/ui` 的 `EmptyState`，提供适合填充集合内容区域的标准布局。
- 让资源中心、扩展和所有项目使用同一个共享空状态原语，同时保留各领域自己的文案和语义图标。
- 以资源中心的无框内容区为基线，移除项目与扩展的集合外围边框，并让三个页面的空状态在可用内容区域内稳定居中。
- 增加共享原语和三个消费页面的回归测试，证明不再走页面私有空状态结构。

## Capabilities

### New Capabilities

- `management-catalog-empty-state`: 定义管理目录空数据与搜索无结果时的共享视觉结构、填充布局和页面消费要求。

### Modified Capabilities

无。

## Impact

- `packages/ui`（L2 shared UI owner）：拥有无业务 `EmptyState` 的填充集合布局契约。
- `packages/assets/webview`（Assets browser-only presentation owner）：资源中心消费共享原语并提供媒体目录文案与图标。
- `packages/agent/webview`（Agent browser-only presentation owner）：扩展管理页消费共享原语并保留现有 Agent 目录行为；改动会增量保留当前已暂存的 runtime contract 更新。
- `apps/neko-desktop`（Electron Desktop composition/presentation root）：所有项目页面仅组合共享 UI 与 Host 投影，不新增领域逻辑。
- 不改变 IPC、持久化、用户数据、领域 contract 或依赖方向。
