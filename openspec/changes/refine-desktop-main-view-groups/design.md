## Context

Desktop Workbench v1 保存至多八个 Main View，但只提供一个 `activeViewId`、一个
`sideViewId` 和一个 split 字段。Agent 也被编码成 Main View；Cut、Preview 和 Canvas 的打开
路径分别重写 Agent、Main 和 Timeline slices。结果是 active selection 同时承担领域 attachment、
Tab 激活和整体展示 preset，资源打开会改变用户布局，已有 View 也没有 owner-local Tab surface。

`@neko/ui` 已提供 `WorkbenchEditorTabs` 和支持 primary/secondary Main 的
`ControlledWorkbenchShell`。Cut Root 已能把 Timeline portal 到 Host target，但 Stage 仍固定
渲染在 Root 容器中。实现必须复用这些边界，不恢复 Workbench Core，不复制 Canvas/Cut/Preview
Root，也不引入 VS Code 式任意 Dock tree。

## Goals / Non-Goals

**Goals:**

- Chat 展示、Main View Group 和 Timeline presentation 成为三个正交 Window-owned slices。
- Canvas、Cut、Preview View 在最多两个分组内拥有可恢复的 Tab 顺序和独立 active View。
- 普通资源打开聚焦当前分组且保持 Chat 模式；显式侧边打开才创建或复用第二分组。
- Canvas 与 Cut Timeline 组合时默认 Canvas 在上、Timeline 在下，并复用一个 Cut session。
- Workbench v1 持久 projection 确定性迁移为 v2，不删除打开的领域 View。

**Non-Goals:**

- 任意嵌套 split tree、超过两个 Main Group、跨 slot 自由拖拽或插件贡献布局。
- 把 Chat conversation Tab 合并到 Main Tab，或把 Main Tab 提升为领域事实。
- 同时渲染两个 Cut session、两个临时 Preview 或无限后台 Webview Root。
- 改变 `.nkc`、OTIO、Preview descriptor、Agent conversation 或项目文件格式。

## Five-Layer Analysis

| 层   | 决策                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------- |
| 职责 | Window Shell 拥有 display/group/split/timeline presentation；领域 owner 继续拥有文档/session facts。    |
| 依赖 | Desktop 组合 package-owned Root；共享 UI 只提供 render-only Tab/split/resize primitive。                |
| 接口 | Main operation 捕获 Window/View/Group identity 和 expected revision；未知或陈旧 identity fail-visible。 |
| 扩展 | 最多两个稳定 Group；下一种文档只需提供 View ref/label/Root，不扩展组合矩阵。                            |
| 测试 | 覆盖 v1 migration、group invariants、资源打开路径、Chat 保持、Cut Root 单实例和 Electron UI。           |

## Decisions

### 1. Replace inferred presets with orthogonal presentation slices

Workbench v2 使用：

```text
display(mode, chatPosition)
main(views, groups, activeGroupId, split)
timeline(presentation, ownerViewId, height)
```

`display.mode` 只决定 Agent surface 是 dock、占据可用工作区还是隐藏。Agent conversation/runtime
不进入 `main.views`。Main/Timeline operation 不得修改 display slice；display operation 不得
重建 Main Group 或领域 View。

保留一个兼容含义不断扩张的 preset 字段会继续产生多种事实来源，因此 v2 删除 preset，而不是
在 preset 旁新增 groups。

### 2. Use a bounded two-group model

`main.views` 保存 Window attached View refs。`main.groups` 保存一个或两个稳定 `groupId`、
有序 `viewIds` 和各自 `activeViewId`；`activeGroupId` 只选择普通打开目标。每个 View 必须且只能
属于一个 Group。第二组存在时 split 必须显式包含：

- `axis: columns`：左右分栏；
- `axis: rows`：上下分栏；
- `ratio`：第一组占比，受公共最小尺寸约束。

关闭第二组最后一个 Tab 时收敛为单组。重复打开同一 document identity 聚焦现有 Group/Tab，
不得复制领域 session。该模型覆盖真实需求且保持 Phase 1 复杂度上限；不建立递归 split tree。

### 3. Main Tab is presentation over owner View

Shell Tab 只保存 `viewId` 顺序、激活和安全 `displayLabel`。关闭 Tab 表示 detach View 并触发
现有 runtime reconciliation；不删除项目文件或领域文档。Preview temporary View 是当前 Group
内唯一可替换的临时 Tab，pin 后保留同一 owner identity 并成为普通 Tab。

Tab UI 复用 `WorkbenchEditorTabs`。Desktop 只补充 group header actions 和 drag/drop intent；
不复制 Agent 私有 TabBar，也不把 Agent status 语义放入公共 Workbench Tab。

### 4. All open paths use one Main presentation reducer

Canvas renderer handoff、Preview runtime 和 Cut runtime 都调用同一组纯 presentation operation：

- `openOrFocusMainView`
- `closeMainView`
- `reorderMainView`
- `splitMainView`
- `moveMainView`

operation 只返回 Workbench presentation，领域 runtime 继续在自己的 service 中创建/验证 View
owner。普通打开使用 `activeGroupId`；显式 side intent 指定 `columns` 或 `rows`。任何 operation
命中缺失 Group/View、重复 membership 或陈旧 identity 时直接失败。

### 5. Timeline binds an explicit Cut View

Timeline v2 不再通过 active Main View 推断 Cut owner。`ownerViewId` 必须引用 attached Cut View；
没有 owner 时 presentation 必须为 hidden。

存在 Canvas 且打开 Cut Timeline 时，Shell 保持 Canvas 为 Main active View，并把 Timeline
以 `rows` 语义停靠在下方。没有 Canvas 时 Cut View 可在 Main 展示 Stage，同时使用相同 Timeline
owner。切换 Canvas/Preview Tab 不销毁 Cut session或改变 Chat mode。

Desktop 在任一时刻只挂载一个 Cut Root：Cut Tab 激活时由 editor presentation 提供 Stage，
Canvas/Preview 激活而 Timeline 仍可见时由 timeline-only presentation 提供 Timeline。两种
presentation 都绑定同一 Host-owned Cut session identity；切换 Tab 可以重建 renderer
projection，但不得创建第二个领域 session，也不得同时挂载两个 Cut Root。

### 6. Extend shared primitives instead of adding Desktop-local UI systems

`ControlledWorkbenchShell` 增加明确的 `columns/rows` split、ratio 和 resize binding；
`WorkbenchEditorTabs` 继续负责无业务 Tab 可访问性、关闭和排序。Desktop 负责 View label/icon、
Group action 和 Workbench mutation。Chat 与 Main 两个消费者语义不同，因此不复用 Agent 私有
TabBar。

### 7. Workbench v1 migration is explicit and temporary

state repository 读取 v1 时：

- 删除 agent View ref；Chat 展示由旧 Agent fields 映射到 display；
- 所有非 side View 进入 `main:primary`，side View 进入 `main:secondary`；
- `horizontal` 映射为 `columns`，`vertical` 映射为 `rows`；
- 旧 active/side identity 失效时 migration 直接报错，不返回空成功；
- Timeline visible 必须找到 attached Cut View，否则迁移为 hidden 并记录为明确的预发布
  presentation rebuild，而不是保留 dangling owner。

写回只产生 v2。迁移在不再接受预发布 v1 state 后通过独立 cleanup task 删除。

### 8. Lazy package styles and removed projects cannot leave dangling presentation

Canvas 与 Cut 会在同一 Desktop renderer 中按需加载，共享 Workbench stylesheet 因此可能在
Canvas stylesheet 之后再次注入。Canvas 的 package-owned flex layout 必须限定在
`.canvas-webview-root` 下，使其优先级不依赖 chunk 加载顺序；否则后加载的共享 grid rule 会把
Canvas Main 放入空 `auto` 列并压缩到 0px。

移除最近项目时，Shell 必须同时 detach 该项目的 Window Tabs 和 Main Views。即使 Window 当前
显示 Home，也不得把已从 catalog 移除的 project identity 留在 Workbench；重启 parser 应继续
fail-visible，而不是为 dangling identity 增加兼容 fallback。

## Risks / Trade-offs

- [Cut Root target refactor may reset renderer-local presentation] → 保持同一 keyed Root 挂载，
  只更新 portal targets，并以 runtime identity 测试证明 session 未重建。
- [Two group Tab drag can produce duplicate membership] → Host contract parser与纯 reducer同时验证
  每个 View 恰好属于一个 Group，非法 mutation fail-visible。
- [Inactive heavy Views consume resources] → 只挂载每个 Group 的 active Root；领域 session 保持在
  Main owner，View-local viewport 通过现有 view-scoped presentation store 恢复。
- [v1 layout migration changes ambiguous legacy composition] → 使用确定性映射并保留所有非 Agent
  View；只重建无法绑定 owner 的 transient Timeline presentation。
- [Lazy Cut CSS reloads shared Workbench selectors] → package-owned Canvas layout 使用 root-scoped
  selectors，并以加载顺序回归断言保证共享 stylesheet 后加载也不能覆盖。
- [Home removes a Project while its Workbench remains attached] → catalog removal 同一事务内清理
  project-owned Views，并以重启 state repository 的回归测试证明无 dangling identity。

## Migration Plan

1. 先添加 v2 types/parser/reducer 与 v1 repository migration，producer/consumer 仍在聚焦测试内。
2. 将 Shell、Canvas、Preview、Cut 调用方一次性迁移到 v2，poison v1 renderer mutation。
3. 接入 Group Tab、split resize 和 display-only menu，删除 composition matrix helper。
4. 接入 Cut stable targets 与 owner-bound Timeline，删除 active-cut 推断。
5. 运行 migration、Desktop package tests/build 和真实 Electron 场景；失败时回滚整个未发布
   v2 change，不保留 v1/v2 dual-write。

## Open Questions

无。Phase 1 默认普通 side-open 使用 `columns`；Canvas + Timeline 固定默认 `rows`，用户之后可
调整高度或切换 Main Group 分栏。
