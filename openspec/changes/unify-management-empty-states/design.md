## Context

三个管理目录都运行在 Desktop Renderer，但由不同 presentation owner 提供：所有项目位于 Desktop 组合根，资源中心由 `@neko/assets-webview` 提供，扩展由 `@neko/agent-webview` 提供。当前三者分别维护空状态 DOM/CSS；项目页的空节点还会被 `auto-fill` 网格当作单个卡片，只占第一列。

仓库已经由 `@neko/ui/primitives` 公开无业务 `EmptyState`，它是此类视觉结构的 canonical owner。现有原语适合紧凑区域，但没有表达“填充集合剩余区域并跨越网格列”的布局契约。

## Goals / Non-Goals

**Goals:**

- 让三个管理目录通过 `@neko/ui/primitives` 的同一公开入口渲染空状态。
- 统一轻量中性色图标、标题、间距、最小高度和内容居中规则。
- 修复网格空状态只占一列的问题，并保持紧凑窗口下不偏移、不溢出。
- 保留 Assets、Agent 与 Project 各自的文案、语义图标和目录容器外观。

**Non-Goals:**

- 不统一三个页面的 header、toolbar、条目边界或业务动作。
- 不改变 loading、diagnostic、数据过滤、排序、安装或项目打开行为。
- 不增加 IPC、领域 DTO、持久化字段或用户数据迁移。

## Decisions

### `@neko/ui` owns the fill layout

`EmptyState` 增加一个默认关闭的 `fill` 布局选项。启用时，原语占满可用宽度、具备统一最小高度、可在 flex 容器中扩展，并在 CSS grid 中跨越所有列。默认布局保持不变，避免影响 Preview 等既有紧凑消费方。

备选方案是在三个页面分别增加同名 class。该方案仍会复制结构与关键几何规则，无法形成可测试的 canonical path，因此不采用。

### Domain pages own content, not structure

资源中心传入目录语义图标与 Assets 文案，扩展传入包图标与 Agent 文案，所有项目传入文件夹图标与 Desktop i18n 文案。共享 UI 不导入任何领域 contract，也不判断空状态原因。

备选方案是建立管理目录领域组件或统一 DTO。三者没有共享业务状态或生命周期，该抽象会造成错误领域耦合，因此不采用。

### Empty collections use the unframed Resource Center baseline

资源中心现有的无框内容区作为 collection shell 基线。项目和扩展无论是否存在目录条目，都移除集合外围的 padding、border、radius 和 raised background；可交互条目继续保留自身边界。空集合额外脱离网格列并填充 root 的剩余高度。这样不会把“所有项目”的外围框和网格约束传播到其他页面，也符合 page section 不作为浮动卡片的页面设计。

## Ownership And Runtime Path

| Surface            | Owner / role                                              | Canonical public path                           | Producer                        | Consumer                  | Runtime boundary                         | Replaced path                                    |
| ------------------ | --------------------------------------------------------- | ----------------------------------------------- | ------------------------------- | ------------------------- | ---------------------------------------- | ------------------------------------------------ |
| Shared empty state | `@neko/ui`, L2 host-neutral React UI                      | `@neko/ui/primitives`                           | `EmptyState` props              | Browser/Renderer surfaces | React DOM only                           | 页面私有空状态 DOM、项目网格空状态和核心几何 CSS |
| Resource Center    | `@neko/assets-webview`, Assets presentation               | `@neko/assets-webview/asset-management/root`    | Assets catalog projection       | Desktop Renderer          | Browser-only package composed by Desktop | 纯文本 `global-library-browser__empty`           |
| Extensions         | `@neko/agent-webview`, Agent presentation                 | `@neko/agent-webview/extension-management/root` | Agent extension projection      | Desktop Renderer          | Browser-only package composed by Desktop | 手写 `management-surface-empty` DOM              |
| All Projects       | `apps/neko-desktop`, Application presentation composition | `DesktopProjectCatalogSurface`                  | `@neko/host` project projection | Desktop Renderer          | Electron Renderer composition            | 手写 `management-surface-empty` DOM              |

所有项目保留在 `apps/*` 的逻辑只负责 Desktop 产品 shell 中的页面组合、交互和 Host 投影展示；它不决定项目领域事实，也不需要下沉为 host-neutral service。本次不新增 app-owned 业务 API。

## User Data Impact

无。变更只影响 React 展示结构和 CSS 布局，不读取、写入、重置或迁移任何用户数据。

## Risks / Trade-offs

- [共享 `fill` 布局影响其他消费方] → 新选项默认关闭，并用共享原语测试覆盖默认与 fill 两种契约。
- [Tailwind 扫描漏掉跨包 class] → class 定义位于已被 Desktop Tailwind content 扫描的 `packages/ui` 源码，并通过 Desktop build 验证。
- [扩展页面已有暂存 contract 修改] → 只增量调整 import 和空状态 JSX，不改动 refresh/mutation 逻辑。
- [空状态高度在紧凑窗口中过大] → 使用有界最小高度与 flex 剩余空间，不设置固定高度；通过 Desktop 可见运行态检查宽、窄视口。

## Migration Plan

1. 先扩展共享 `EmptyState` 并补充契约测试。
2. 原子切换三个消费页面及测试到共享原语。
3. 删除只服务旧空状态结构和集合外围框的 CSS 规则，保留条目、loading 和 diagnostic 的独立语义。
4. 运行包级测试、类型检查和 Desktop 构建/可见 UI 验证。

无需数据迁移；回滚仅涉及展示代码，但正常交付不保留双路径。

## Open Questions

无。
