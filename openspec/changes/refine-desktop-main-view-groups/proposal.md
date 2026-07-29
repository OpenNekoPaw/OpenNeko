## Why

Desktop Workbench 当前把 Chat 展示、创作文档激活、双视图组合和 Cut Timeline 可见性编码在同一
组 preset/active-view 字段中。资源打开因此会覆盖用户选择的“Chat + 主面板”，而主面板虽保存
多个 View，却没有可见 Tab、独立分组或稳定的上下/左右分栏。

## What Changes

- 将展示菜单收敛为 Chat + 主面板、仅 Chat、仅主面板以及 Chat 左/右位置，不再在菜单中维护
  Canvas/Timeline/Model 组合矩阵。
- **BREAKING** 将 Window Workbench contract 升级为显式 display、最多两个 Main View Group 和
  owner-bound Timeline presentation；Agent 不再作为 Main creative View。
- 为 Canvas、Cut 和 Preview 文档提供 group-local Tab、激活、关闭、排序、左右分栏和上下分栏；
  同一文档在同一 Window 聚焦既有 View。
- 资源打开只修改 Main/Timeline presentation，不覆盖 Chat 模式、Chat 位置或宽度。
- Canvas 与 Cut Timeline 同时打开时默认使用 Canvas 上、Timeline 下的布局；Timeline 显式绑定
  owning Cut View，不再依赖 active Main View 推断。
- 复用 `@neko/ui` 的 `WorkbenchEditorTabs` 与 `ControlledWorkbenchShell`，扩展受控双分栏比例
  和 resize，而不建立任意 Dock tree 或新的领域 runtime。
- 为预发布 Workbench v1 持久状态提供一次确定性 v2 migration，保留可恢复的打开 View 和布局。

## Capabilities

### New Capabilities

- `desktop-main-view-groups`: 定义 Desktop Chat/Main 正交展示、主面板 Tab Group、受控双分栏、
  owner-bound Timeline 和资源打开保持布局的行为。

### Modified Capabilities

无。

## Impact

- `apps/neko-desktop` Workbench/Shell contracts、state repository、Main/Cut/Preview/Canvas open
  reducers、renderer composition、i18n 与测试
- `packages/neko-ui` 受控 Workbench 双分栏 resize primitive
- `packages/neko-cut` 单一 Cut Root 的 Stage/Timeline presentation target
- Workbench schema 从 v1 升级到 v2；不修改 Canvas、OTIO、Preview descriptor 或 Agent
  conversation 领域事实
