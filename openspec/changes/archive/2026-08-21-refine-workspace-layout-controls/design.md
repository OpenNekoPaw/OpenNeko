## Context

`@neko/host/desktop-workbench-contract` 已用一个 canonical `DesktopWorkbenchLayoutProjection` 分别保存 Agent/Main display mode、Cut Panel presentation 与 Resource Dock presentation。Desktop Renderer 的 `WorkspaceRegionControls` 当前把四个 projection 维度直接映射成四个顶层 `IconButton`，并用 `layout` 图标表达 Agent；这与可见空间中“左 Agent / 中央 Main（下含 Cut）/ 右 Resources”的层级不一致。

当 Main 被切到 `chat-only` 且 Cut 仍为 `docked` 时，`DesktopSceneWorkbench` 当前把 Interaction 投影为 `main`，导致 Agent 占据 Cut 上方区域。该组合应由可见 slot 派生为“Agent docked + Cut expanded”，无需增加 Main View、Cut placement 持久状态或新的 Host display mode。

Owner 与边界：

- `@neko/host` 是 layout projection、Main View refs、Cut View refs 与 presentation 的 owner；public path 是 `@neko/host/desktop-workbench-contract`。
- `@neko/app-desktop` Renderer 是 Window/Scene composition owner；canonical path 是 `DesktopSceneWorkbench -> WorkspaceRegionControls / ControlledWorkbenchShell -> DesktopWorkbenchRuntimePortals`。
- Producer 是三个顶层控件及组合 Popover 内的 Main/Cut 选项，它们继续调用唯一 `ShellActions.onUpdateWorkbench` 或 `onCreateCutDraft`；consumer 是同一 Renderer composition 对 Host projection 的读取。
- `@neko/ui` 只提供 host-neutral `Popover`、`IconButton`、`ControlledWorkbenchShell` primitives；不接收 Workspace、Agent 或 Cut 业务类型。
- 逻辑保留在 `apps/neko-desktop`，因为它决定 Electron Window 的产品级 Scene slot 组合、原生 title chrome 位置与多个 package Root 的可见装配；它不决定 Main/Cut 领域事实，也不适合作为 host-neutral domain service。

## Goals / Non-Goals

**Goals:**

- 让顶层按钮数量与三列空间结构一致，并让图标直接表达左、中、右区域。
- 在一个中央组合入口中提供可键盘访问的 Main 与 Cut 独立选项。
- 保持现有 Host layout shape、更新命令、Cut draft creation 与精确 identity 不变，仅为既有 `display.mode` 增加一个受 Cut invariant 约束的 canonical enum 值。
- 没有可见 Main 且 Cut 已 docked 时，让同一 Cut Root 扩展占据中央区域；Agent 若可见只停靠侧边，Main 内容不挂载到可见 track。
- 用路径级测试证明旧四按钮顶层路径被删除，Main/Cut 仍只命中现有更新链。

**Non-Goals:**

- 不增加 layout/schema/contract 版本、Main/Cut parent 字段、feature flag 或兼容读取。
- 不改变 Cut 文档、Timeline、Main View、Agent session、Resource Browser 的 owner 或生命周期。
- 不新增通用布局菜单框架、命令 registry 或 package-level Workbench state。
- 不改变非 Workspace Scene、PrimarySidebar 自身显隐控件或窄窗口策略。

## Decisions

### 1. 三个顶层按钮，中间使用 Popover 管理两个子 presentation

顶层固定为 Agent、Creative Panels、Resources：Agent 使用 `layout-sidebar-left`，Creative Panels 使用 `layout`，Resources 继续使用 `layout-sidebar-right`。Creative Panels 触发 `@neko/ui` 现有 `Popover`，内部两个 `button` 使用 `role="menuitemcheckbox"` 分别表达 Main 和 Cut 的 selected/disabled 状态。

选择 Popover 而不是让一个按钮循环四种组合，是因为 Main/Cut 的四种有效组合需要可发现、可直接选择且可表达 disabled；循环会让结果依赖点击历史并弱化 fail-visible 行为。选择现有 primitive 而不是新菜单 abstraction，可保持改动局部且复用 portal、focus boundary 与主题。

### 2. Host projection 增加唯一 `empty-main` canonical mode

`@neko/host/desktop-workbench-contract` 的现有 `display.mode` enum 原子增加 `empty-main`，表达 Agent 与 Main 内容均关闭但 Main track 保留为空 presentation。Codec 只在 exact Cut Panel 已 `docked` 时接受该 mode；`setWorkbenchDisplayMode` 同样 fail-visible 拒绝没有 docked Cut 的请求。所有 producer、consumer、fixture 与测试一次更新，不保留旧 shape、版本分发或兼容路径。

Main 选项继续调用 `toggleWorkbenchRegion(workbench, 'main')`，Cut 选项继续调用 `toggleWorkbenchRegion(workbench, 'cutPanel')` 或在无 Cut View 时调用 `onCreateCutDraft`。不新增 composite command，也不把 Cut presentation 嵌入 Main DTO；`toggleWorkbenchRegion` 根据 Agent/Main/Cut 三个可见状态选择 `chat-main / chat-only / main-only / empty-main`。Cut 是最后可见业务区域时其隐藏选项必须 disabled，helper 对直接非法调用抛错。用户关闭最后一个 Cut 文档仍属于合法的领域操作；Host 在删除最后一个 Cut View 的同一 canonical 更新中把 `empty-main` 明确切换为 `chat-only`，恢复 Agent，避免产生无 Cut 的非法空布局。

被替换路径是 `WorkspaceRegionControls` 中 Main/Cut 两个独立顶层 `IconButton`。实施后顶层不再注册 `data-workbench-region-control="main"` 与 `"cut-panel"`；测试必须断言只有 `agent / creative-panels / management` 三个 Workspace 顶层入口，而 Popover 子选项精确命中 `main / cut-panel`。

### 3. 无可见 Main 时由现有状态组合派生 expanded Cut

当且仅当 exact Workspace Cut slot 存在、Cut Panel 为 `docked` 且 Main presentation 当前不可见时：

- Interaction 若可见只能投影为 `docked`，不得投影为 `main`；`empty-main` 时仍为 `hidden`；
- Main track 隐藏且不挂载已有 Main tabs/View；
- Cut Panel 保持同一 `bottomPanel` Portal、React Root、active View 与 runtime identity，仅由 host-neutral Workbench Shell 把 bottom-panel grid 扩展覆盖中央 Main 与原 bottom-panel track；
- expanded 时不提供纵向 resize handle，但保留 Host-owned Cut height；Main 恢复后 Cut 回到下方并继续使用原高度；
- Resources 与所有 Main/Cut/Agent identities 保持不变。

这不是 fallback：它是“无可见 Main + exact docked Cut”这一明确状态组合的唯一派生 presentation。Renderer 不保存 expanded 状态，也不把 Cut 从 `bottomPanel` Portal 移到 `main` Portal。Cut 不能在 `empty-main` 下通过布局选项成为最后一个被隐藏的业务区域；用户先恢复 Agent 或 Main 后才能隐藏 Cut。关闭最后一个 Cut 文档则按 Host 的 canonical transition 恢复 Agent。Main 再开启时恢复已有 Main View，并把 Cut 收回下方，而不创建或改写事实。

### 4. 可访问性与视觉状态由 exact 子状态驱动

Creative Panels 顶层按钮通过 `aria-expanded` 表达 Popover，并在 Main 或 Cut 任一实际可见时使用 selected 样式。Popover 子选项使用 `aria-checked`，Cut capability unavailable 或 Cut 是最后可见业务区域时只禁用 Cut；Main 无 exact View/slot 时只禁用 Main。按钮状态不得根据 persisted ref、历史选择或 fallback identity 推断。

## Risks / Trade-offs

- [Popover portal 在原生 title chrome 上的层级或定位异常] → 复用 Desktop 已投影的 opaque popover token，并在真实 Electron 的 Main+Cut、Cut-only、关闭状态中直接检查像素与点击路径。
- [`empty-main` 被非法持久化为无 Cut 空窗口] → Host codec 与 setter 都要求 docked Cut，直接非法 toggle 失败；测试 poison 无 Cut 与 hidden Cut 两种输入。
- [用户未发现 Main/Cut 子选项] → 中央按钮使用同时表达两区的 `layout` 图标、明确 tooltip/aria-label，Popover 直接显示两个带选中标记的文字选项。
- [同一文件已有未提交 UI 改动] → 仅修改 controls、Cut-only projection 与聚焦测试的局部块，交付前逐 hunk 审计，不覆盖 continuous management split 等无关改动。
- [Cut 在 docked / expanded 间切换时 Root 重挂载并丢失瞬时状态] → 不改变 Portal slot、portal key 或 Cut runtime identity，只改变 `ControlledWorkbenchShell` 中同一 bottom-panel 容器的 grid presentation，并用路径级测试固定该约束。

## Migration Plan

无持久数据迁移或兼容读取。Host enum producer/consumer 与 Renderer 原子切换；旧数据不可能包含新值，现有数据继续按原 canonical modes 解析。回滚需要同时恢复 Host enum/codec 与 Renderer composition，不涉及 project/workspace/Cut 内容。

## Open Questions

无。图 2/图 3 已分别映射为 canonical Codicon `layout-sidebar-left` 与 `layout`。
