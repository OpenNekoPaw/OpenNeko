## Context

Workspace Board 的 Agent delivery 由 `@neko/canvas-domain` 的 `planCanvasWorkspaceBoardProjection` 计算新节点、关系和位置。当前同一个 `CONTENT_LANE_WIDTH` 同时承担角色 lane 间距和顶层网格列距，导致 120-unit 图片以 288-unit 步长排列。生成批次另行使用 `ceil(sqrt(count))` 决定列数，因此 5 个节点只能形成 3×2 网格。

新建节点默认尺寸由 `canvas-node-sizing.ts` 拥有，但文件节点只有一个通用尺寸，Webview authoring、Headless authoring 和 Workspace Board projection 无法对“可阅读文本引用”采用一致尺寸。

### Five-layer analysis

| Layer          | Decision                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| Responsibility | Canvas domain 继续拥有纯布局和 canonical authoring size；Webview 只负责视觉标题，不决定 Agent 布局。        |
| Dependency     | 文本引用识别复用 domain 已有 `resolveCanvasTextFilePreviewKind`，不引入 Electron、文件读取或 runtime 状态。 |
| Interface      | 新增精简的 `resolveCanvasFileNodeDefaultSize({ path, mediaType })`；所有 creator 复用同一尺寸语义。         |
| Extension      | 后续增加稳定文本格式时，只需扩展既有 preview-kind 识别；媒体和未知文件仍走各自 canonical 尺寸。             |
| Test           | Domain 测试验证 5 列、无重叠、紧凑间距和类型尺寸；Webview 测试验证 factory 与标题 class 消费同一判断。      |

## Goals / Non-Goals

**Goals:**

- Agent 新增的 5 个同类节点保持在同一行，并显著缩小图片之间的空白。
- Markdown 与 Markdown/JSON/纯文本引用默认具有可阅读的宽高。
- 所有新建入口对文本引用使用同一 canonical 尺寸。

**Non-Goals:**

- 不自动重排或修改已存在节点。
- 不改变图片等比缩放上限和用户 resize 语义。
- 不引入响应式 layout engine、自动整理命令或可配置网格系统。
- 不改变 Agent delivery contract、`ContentLocator` 或 Canvas persistence shape。

## Decisions

### 1. 顶层网格与角色 lane 分离

角色 lane 保留用于没有显式 source relation 的 source/analysis/output 起始位置。`findAvailableContentPosition` 改为每行最多 5 个候选，候选步长为当前节点宽度加紧凑间隔；碰撞检测继续以所有顶层节点的真实矩形为准。这样 120-unit 图片按约 136-unit 步长排列，而 240-unit 文本卡片仍不会重叠。

### 2. 生成批次固定最多五列

生成批次列数为 `min(5, artifactCount)`，第 6 个结果才进入下一行。组 padding、header 和 gap 使用紧凑常量，组尺寸仍由子节点真实宽高计算，不裁剪不同纵横比图片。

### 3. 文本引用使用稳定内容分类

Markdown canonical 默认尺寸调整为 240×160。文件节点只在 `resolveCanvasTextFilePreviewKind` 判定为 Markdown、JSON 或纯文本时采用相同阅读尺寸；其他文件保持通用 110×75。Workspace projection、Webview factory、Headless authoring 和 authored-default resolver 都消费同一 helper，显式 creator size 始终优先。

### 4. 标题弱化但正文尺寸不降级

Markdown 内部标题和文本引用外部标签使用更小字号，正文现有字号保持不变。媒体标签不随文本规则缩小。

## Boundary inventory

| Owner / role                        | Canonical path                      | Producer -> consumer                | Runtime boundary | Replaced path / user-data impact       |
| ----------------------------------- | ----------------------------------- | ----------------------------------- | ---------------- | -------------------------------------- |
| `@neko/canvas-domain` sizing        | `canvas-node-sizing.ts`             | node data -> authoring creators     | host-neutral L0  | 替换各入口通用 file 尺寸猜测；仅新节点 |
| `@neko/canvas-domain` projection    | `canvasWorkspaceBoardProjection.ts` | Agent delivery -> Canvas operations | host-neutral L0  | 替换 3 列固定步长与近方形批次          |
| `@neko/canvas-webview` presentation | `CanonicalContentNodes.tsx` / CSS   | canonical node -> visible card      | browser L2       | 仅文本标题视觉调整；无 durable data    |

## Risks / Trade-offs

- 5 个宽文本节点会形成较宽的一行；这是用户明确要求的每行 5 个，并由 viewport pan/zoom 承载。
- 动态列步长按当前插入节点计算，异构历史节点可能跳过发生碰撞的候选；测试只保证无重叠与五列上限，不伪造全局重排。
- 更大的 Markdown 默认卡片占用更多空间，但仍远小于沉浸式编辑面板，且只作用于新建节点。

## Migration Plan

1. 先增加布局和尺寸失败测试。
2. 原子更新 domain sizing 的 producer/consumer 与 Workspace projection。
3. 更新 Webview 标题呈现和 factory 测试。
4. 运行 package tests/build、严格 OpenSpec、质量审查和真实 Canvas UI 验证。

无 durable migration；回退代码即可恢复旧的新建默认值，已有节点不变。

## Open Questions

无 apply-blocking open question。
