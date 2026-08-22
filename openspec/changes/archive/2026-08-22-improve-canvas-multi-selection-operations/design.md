## Context

Canvas selection 是 Webview 挂载期间的 transient presentation state；节点位置、锁定和 zIndex 是当前 Canvas document facts。现有 `InfiniteCanvas -> CanvasApp -> canvasStore.moveNodeEnd` 链只传递一个节点 identity，且 `BaseNode` 丢弃了已经声明的实时 `onDrag` callback。批量删除、剪贴板和编组已经使用 `nodeIds[]`，证明 selection authority 本身可以表达多选，缺口位于 transform 与命令提交链。

本变更不增加新的 runtime、IPC、document field 或兼容路径，只把移动 contract 收敛为一个同时覆盖单选与多选的 canonical batch mutation。

### Five-layer analysis

| Layer          | Decision                                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | `InfiniteCanvas` 拥有 gesture snapshot 与实时 preview；Canvas store 拥有原子 document mutation、history 和 operation projection；节点组件只产生 pointer gesture。     |
| Dependency     | 所有逻辑留在 `@neko/canvas-webview` L2，不依赖 Electron、Node 或其他 feature package；继续复用现有 Canvas container helpers、history 和 clipboard stores。            |
| Interface      | 用一个 `moveNodesEnd(nodeIds, delta)` 替换单节点 `moveNodeEnd(id, position)`；单节点移动使用长度为一的同一 contract。批量层级和锁定命令接收精确 ID 数组。             |
| Extension      | 纯 selection transform helper 负责移动根、父子去重和锁定策略；未来若加入 selection bounding-box resize，可复用 selection snapshot，但不会复用移动 contract 冒充缩放。 |
| Test           | 纯/store 测试覆盖 delta、父子去重、锁定、单 history、层级/锁定批量命令；组件测试覆盖修饰键、拖拽保留选择、实时 preview、工具栏和隐藏手柄。                            |

## Goals / Non-Goals

**Goals:**

- 多选拖拽的视觉位置、最终 document facts、容器关系和 undo 保持一致。
- 单选与多选共享唯一移动成功路径。
- 多选命令明确作用于完整选择，不静默降级为右键命中的一个节点。
- 未实现的批量 resize/rotate 不显示可操作手柄。

**Non-Goals:**

- 不实现 selection bounding-box resize、rotate、align 或 distribute。
- 不改变 material capability owner 对多选 action minimum/maximum 的声明。
- 不改变 Canvas document、host runtime 或 Desktop message contract。

## Decisions

### 1. 一个 delta-based batch move contract

Canvas store 暴露 `moveNodesEnd(nodeIds, delta)`。gesture 以被抓取节点为 anchor，根据其原始位置与对齐后的最终位置计算同一 Canvas delta。单节点和多节点都调用该方法，禁止循环调用单节点 mutation，因为循环会制造多条 history、重复容器同步和中间成功状态。

Store 在一个 mutation 内记录一次 history，移动所有有效 root，并为每个直接移动 root 投影 operation update。零 delta 不产生 history。选择中不存在的 stale identity 被局部忽略；若没有有效移动根则 mutation 不发生。

### 2. 移动根消除父子重复

选择先过滤 locked 节点，再删除其祖先也位于可移动选择中的后代 identity。容器 root 使用既有 subtree translation，因此其 descendants 无论是否显式选中都只平移一次；其他 root 直接平移。随后按每个 root 运行既有 container membership 同步。

Locked 节点保留选择和位置。直接抓取 locked 节点仍无法开始 gesture；从其他未锁定选中节点开始时，locked sibling 明确保持固定。

### 3. Gesture preview 与 selection 生命周期

拖动已选节点时，gesture snapshot 使用完整当前 selection；拖动未选节点时先将其设为唯一选择。`BaseNode` 将实时 `onDrag` 传回 `InfiniteCanvas`，后者用同一纯 transform helper 投影全部移动节点。drag click 被显式抑制，避免 mouseup 后的普通 click 把多选折叠为单选。

追加选择统一识别 Shift、Command 和 Control。Canvas background pointer down 只有在非追加 gesture 时清空选择；marquee 保存 gesture 开始时的 additive 决策，mouseup 不依赖修饰键仍被按住。

### 4. 批量命令与诚实 affordance

右键命中已选节点时保留完整 selection。置顶、置底和锁定通过 Canvas store 的数组 contract 一次提交，并保持选中节点内部 z-order。混合锁定选择显示“锁定”并把全部设为 locked；全部已锁定时显示“解锁”。

多选工具栏复用 clipboard store 的 batch duplicate，并调用现有 batch delete。多选时 resize/rotate handles 不渲染；节点选中轮廓和 selection toolbar 继续可见。

## Boundary inventory

| Owner / role                                | Canonical path                   | Producer -> consumer                          | Runtime boundary               | Replaced path / user-data impact      |
| ------------------------------------------- | -------------------------------- | --------------------------------------------- | ------------------------------ | ------------------------------------- |
| `@neko/canvas-webview` gesture presentation | `BaseNode` / `InfiniteCanvas`    | pointer gesture -> selection delta preview    | Browser DOM pointer/mouse      | 替换单节点 preview；无持久数据变化    |
| `@neko/canvas-webview` Canvas store         | `canvasStore`                    | exact selected IDs + delta -> Canvas document | Zustand in current Canvas Root | 替换 `moveNodeEnd`；`.nkc` shape 不变 |
| `@neko/canvas-webview` command presentation | selection toolbar / context menu | complete selection -> batch mutation          | Browser DOM keyboard/menu      | 替换右键单节点层级/锁定语义           |
| `apps/neko-desktop` composition root        | existing Canvas Root wiring      | Canvas package -> Desktop scene               | Electron composition only      | 无生产变化                            |

## Risks / Trade-offs

- [选择包含 Group 与 child 时重复位移] → 只移动没有已选可移动祖先的 root，并以纯 helper 和嵌套 Group 测试约束。
- [循环 store 更新产生多个 undo 步骤] → 使用一个 batch mutation，在计算完 next nodes 后只 push 一次 history。
- [locked 节点造成部分移动困惑] → locked 保持明确视觉状态和固定位置；直接抓取 locked 节点禁用，并覆盖混合 selection 测试。
- [实时 preview 与提交结果不同] → preview 和 store commit 复用同一个 selection translation helper；membership 只在 commit 阶段同步。

## Migration Plan

1. 建立 selection transform helper 与原子 Canvas store batch APIs。
2. 将 BaseNode/InfiniteCanvas/CanvasApp 切换到唯一 batch move chain，并删除单节点 store move contract。
3. 修复 additive selection、drag click 和多选 handle presentation。
4. 接通完整 selection 的右键与工具栏命令，补齐测试和 UI 验收。

不改变 durable shape；回退代码即可恢复旧交互，不保留 feature flag 或平行 move handler。

## Open Questions

无 apply-blocking open question。
