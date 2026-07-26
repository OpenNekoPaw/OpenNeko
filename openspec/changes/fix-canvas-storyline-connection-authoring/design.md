## Context

Canvas 持久事实已经包含六类节点、`sequence | reference | derived-from` 连接、node/port endpoint 与可选 Group `layout.mode = sequence`。当前 Webview 却由两套 pending state 共同完成一次拖拽：`useConnectionDrag` 持有指针预览，`canvasStore` 再持有 source node/handle。Media 默认只有 `out` port，目标命中只接受精确 handle，Store 又固定创建 `reference`，导致用户无法用同一交互建立 Storyline 顺序。

Playback adapter 进一步把全部可播放节点按数组/选中顺序线性化，合成不存在的 transition 和单一 canonical route；Storyline 因而无法区分显式顺序、独立组件和孤立节点。

本变更作用于本地 Canvas Webview 与共享纯 TypeScript 投影，不改变 Extension/Engine 边界，也不新增持久数据模型。

### Five-Layer Analysis

| 层 | 决策 |
| --- | --- |
| 职责 | `.nkc` 节点、`sequence` connection 与显式 sequence Group 是顺序事实；Webview 只提交 authoring intent；Playback adapter 投影事实；Storyline 只展示 plan。 |
| 依赖 | 共享层提供端口/播放纯函数；Webview hook 只负责 pointer session；Store 是连接 mutation 与 history 的唯一 owner。 |
| 接口 | 一次拖拽生成完整 `CanvasConnection` draft；创建和更新进入同一 validation；Storyline 使用显式 transition/route，不从空间或数组顺序猜边。 |
| 扩展 | 后续 reference/derived-from authoring 可复用相同 draft/validation，但不通过隐式类型转换伪装成 sequence。 |
| 测试 | 共享 projection、Store mutation、DOM drop target、节点连接手柄、Storyline graph 与 Extension Development Host 分层覆盖。 |

## Goals / Non-Goals

**Goals:**

- Media、Markdown 等可播放节点具有清晰的入向和出向连接位置。
- 顺序拖拽可以吸附目标输入 handle 或节点卡片，并直接创建 `sequence`。
- pointer preview 只有一个 session owner；Store 只接收完整 mutation。
- 创建与修改连接类型共享验证规则，并以可观察结果拒绝非法操作。
- Storyline 只显示显式顺序事实，保留独立组件和孤立节点。
- 保留 branch、merge、previous/next、Preview 与一次性 Canvas reveal。

**Non-Goals:**

- 不在 Storyline Overlay 内编辑连接。
- 不新增 Story、Scene、Beat 或 route 持久实体。
- 不删除 `reference`、`derived-from` 或自定义 port。
- 不修改 Engine、Cut 或 Extension message contract。
- 不根据节点位置、标题、创建时间或当前选择推断顺序。

## Decisions

### 1. 顺序连接使用既有连接契约，不新增第二类 edge

可播放节点的默认 authoring profile 提供左侧 `in` 和右侧 `out`。从输出向输入或目标卡片拖拽属于明确的排序操作，提交：

```text
CanvasConnection {
  type: "sequence",
  sourceEndpoint: node-scoped or compatible output port,
  targetEndpoint: node-scoped or compatible input port
}
```

Media 不再只有输出落点。现有自定义 port 继续用于精确 endpoint；节点卡片吸附产生 node-scoped endpoint，使 Storyline 关系不依赖媒体数据类型。

未采用新增 `StoryEdge`，因为 `sequence` 已是 `.nkc` 的唯一叙事顺序事实。新增平行模型会破坏 Preview、Agent capability 和 undo 的单一事实来源。

### 2. Hook 单独拥有 pointer session，Store 单独拥有 document mutation

删除 Store 的 `isConnecting`、`pendingConnectionSource`、`startConnection`、`completeConnection` 和 `cancelConnection`。`useConnectionDrag` 持有：

- source node/handle/endpoint；
- 当前指针 Canvas 坐标；
- 当前目标及 valid/invalid 状态。

mouseup 时 Hook 解析精确 input handle；没有命中 handle 时解析最近的 `[data-node-id]` 卡片并吸附到 node target。它把完整 draft 交给 `addConnection`，Store 不重建第二份 pending source。

未保留双 pending state，因为它会让 pointer session 与 document mutation 生命周期漂移，也使失败原因只能静默丢弃。

### 3. 创建和更新共享一个 fail-visible validation

package-local 纯函数返回 discriminated result，覆盖：

- source/target 存在；
- 非自连接；
- endpoint/port 存在且方向兼容；
- port data type 兼容；
- 精确连接不重复；
- `sequence` / `derived-from` 不形成有向环；
- input port capacity（node-scoped sequence merge 不使用 data-port 单输入限制）。

`addConnection` 和 `updateConnection` 都调用该函数。用户可恢复的拒绝返回稳定 reason，由拖拽目标状态或 InlineConnectionEditor 显示；内部调用绕过验证则抛错，不返回伪成功。

### 4. Storyline topology 来自显式顺序图

Playback adapter 构造顺序图时只接受：

- 启用的 `sequence` connection；
- `layout.mode = sequence` Group 的相邻可播放 child。

普通 Group、Canvas node array、当前选择和空间位置只影响稳定显示顺序，不生成 transition。

adapter 为每个有向连接组件投影 root-to-terminal route；孤立 playable unit 投影为单节点 route。Storyline 因此可以显示多个独立组件而不画虚假边。当前选择只决定优先 focus/route，不改变拓扑。

为防止任意 DAG 路径数量失控，route 枚举设置确定性上限；超过上限产生 diagnostic 并停止投影，而不是静默截断为看似完整的故事线。

### 5. 目标反馈属于节点 frame，不进入持久状态

连接中所有合法目标显示输入 affordance；指针落在目标卡片或输入 handle 时高亮，非法目标显示拒绝状态。该状态由 `InfiniteCanvas` 将 Hook session 投影给 `BaseNode`，不写 Zustand document store。

Escape、mouseup 到空白和 Webview 卸载都会取消 session。成功提交后 preview 与 target 状态同时清理。

## Risks / Trade-offs

- [为 Media 增加默认输入 port 改变可见 chrome] → 使用与现有 handle 一致的低权重样式，并在拖拽/hover 时增强，不改变节点尺寸。
- [旧 port-scoped Media connection 仍指向 `out`] → 保留 `out` id 和解析规则；新增 `in` 不迁移或重写旧 endpoint。
- [多组件产生多个单节点 route，路线控件可能增加] → 使用组件/route 稳定标题与顺序；后续可增加“未编排”分组，但不得重新合成边。
- [DAG root-to-terminal 路径组合爆炸] → 使用显式上限与 diagnostic，Canvas 保持可编辑。
- [节点卡片吸附可能误连] → 仅在 active connection gesture 中启用，排除 source/self，并展示高亮后才提交。

## Migration Plan

1. 先增加回归测试和共享 validation/projection。
2. 将 Store mutation 切到完整 connection draft，并删除旧 pending path。
3. 更新 BaseNode/Hook/InfiniteCanvas 交互。
4. 更新 Storyline projection 与现有 fixtures。
5. 在隔离 `neko-test` Extension Development Host 中验证媒体到媒体顺序连接和 Storyline 更新。

`.nkc` schema 无迁移；回滚代码后新增的 `sequence` connection 仍是旧版本可读的既有事实。

## Open Questions

无。默认拖拽排序行为、节点卡片吸附、显式 sequence 事实与 Storyline 独立组件展示已由本轮产品目标确定。
