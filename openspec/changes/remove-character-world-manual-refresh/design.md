## Context

Character 和 World 管理页当前使用 package-owned runtime 在 Root 挂载后读取目录，并在搜索或排序变化时重新查询。原有集合 header 同时提供手动刷新按钮；加载失败状态另有显式“重试”。普通态刷新没有独立状态语义，也不解决 authoritative catalog 之外的问题。

五层分析：

- 职责：Webview 负责可丢弃的搜索、排序和错误恢复展示；catalog runtime 负责读取 authoritative records。
- 依赖：改动仅位于 browser-only React/CSS/tests，不接触 Electron、Node、路径或持久化。
- 接口：保留现有 runtime `reload`，只删除普通态按钮 producer；错误态重试和查询 producer 不变。
- 扩展：未来出现真实的外部变更通知需求时，应由 owning runtime 提供可观测失效/同步状态，而不是恢复无状态刷新按钮。
- 测试：组件测试覆盖普通态无刷新按钮、查询 reload、失败重试和窄布局；Desktop functional/style 断言覆盖真实组合中的按钮缺席和控件可达性。

## Goals / Non-Goals

**Goals:**

- 删除 Character 和 World 普通目录中的手动刷新按钮。
- 保持搜索、排序、初始加载和错误重试使用唯一 canonical runtime。
- 减少窄集合头部的控件密度。

**Non-Goals:**

- 不改变 catalog authority、缓存、轮询、文件监听或持久化。
- 不删除错误态重试，也不把读取失败伪装成空目录。
- 不改变新增、导入、模板、选择或详情操作。

## Decisions

### 1. 普通态不暴露手动刷新

Character 与 World collection header 只保留 bounded search 和 sort。删除 `RefreshIcon`、按钮 markup、accessible label 与相应普通态测试，不保留不可见 DOM 或 alternative handler。

### 2. Reload 仍由 owning runtime 管理

初始读取、搜索/排序变化和失败重试继续调用各包既有 `reload`。错误状态必须保留明确 diagnostic 和重试按钮；删除普通态刷新不能转换为静默自动成功或第二套读取路径。

### 3. Runtime 与用户数据边界不变

canonical producer 是 Character/World Webview 的查询或错误重试交互，consumer 是各自 package-owned runtime。Desktop 只组合公共 Root 与回调。本次不改变 IPC、领域 command、catalog projection、identity 或用户数据。

## Risks / Trade-offs

- [外部文件变化不会由用户立即强制刷新] → 当前产品没有以普通刷新解决的外部同步契约；重新进入场景会读取最新目录，错误态可重试。未来真实同步需求应增加可观测 invalidation，而不是无状态按钮。
- [旧测试与稳定规范冲突] → 原子更新 capability delta 和全部断言，明确区分已删除的普通态入口与保留的错误恢复。

## Migration Plan

1. 更新 capability requirement，删除普通态刷新可达性要求。
2. 保持现有组件实现中的搜索、排序和错误重试，更新测试覆盖。
3. 运行 owning-package tests/typecheck、Desktop focused checks、OpenSpec 校验和 UI 验收。

无持久数据迁移或回滚步骤；回滚只会恢复 Webview 按钮 presentation。

## Open Questions

无。
