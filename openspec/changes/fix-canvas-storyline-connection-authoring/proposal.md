## Why

Canvas 当前把媒体数据端口和叙事关系连接混在同一套拖拽交互中：Media 只有输出端口，目标节点通常没有可接受落点，失败又被静默取消；即使成功，拖拽也固定创建 `reference`，无法可靠地定义 Storyline 使用的 `sequence`。用户因此既不能直观连接两个剧情节点，也无法让画布上的显式顺序成为故事线事实。

## What Changes

- 为所有可参与故事线的 Canvas 节点提供独立的入向/出向顺序连接手柄，不再依赖媒体数据端口表达叙事关系。
- 拖动顺序手柄时显示并扩大合法目标命中区域，允许在目标输入手柄或目标节点卡片上松手，并对无效目标给出可见反馈。
- 通过一个经过验证的连接提交路径直接创建 `sequence`，统一处理自连接、重复连接、缺失端点和有向环。
- 连接类型更新复用相同验证规则，禁止先创建 `reference` 再无验证地转换为非法 `sequence`。
- Storyline 只把显式 `sequence` connection 投影为连接边；未连接节点保持孤立，不再由节点数组顺序生成虚假相邻关系。
- Storyline 在折叠 Overlay 中保留可同时辨认两至三条分支行的图区域高度，更多分支继续使用既有滚动视口。
- 增加共享契约、Store、交互组件、Storyline projection 和真实 VS Code Webview 回归覆盖。

## Capabilities

### New Capabilities

- `canvas-storyline-connection-authoring`: 定义 Canvas 中显式故事顺序连接的手动创建、验证、目标命中、反馈和 Storyline 投影行为。

### Modified Capabilities

无。

## Impact

- 共享 Canvas playback/connection 投影：`packages/neko-types`。
- Canvas Webview 节点框架、连接拖拽、Store mutation、Storyline 布局与相关测试：`packages/neko-canvas-webview`。
- 不修改 `.nkc` schema；继续使用既有 `CanvasConnection`、node-scoped endpoint 和 `sequence | reference | derived-from` 类型。
- 不修改 Extension/Engine 通信，不新增第二套故事线或连接事实模型。
