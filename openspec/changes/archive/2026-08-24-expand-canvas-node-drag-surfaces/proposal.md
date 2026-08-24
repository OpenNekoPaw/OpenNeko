## Why

Canvas 节点内容卡片可以通过普通非交互内容起拖，但显示在卡片上方的外部标题明确设置了 `pointer-events: none`，鼠标会落到 Canvas viewport。节点上下边缘也没有独立拖拽表面；靠近底部滚动条时，交互又会正确地归属给内容滚动。这使用户感知为只有卡片中间的一小部分可拖拽。

## What Changes

- 外部节点标题成为明确的节点拖拽表面。
- 在节点卡片上、下边缘外侧增加窄的拖拽 rail；选中时 resize handle 仍以更高层级拥有相同边缘。
- 保持按钮、输入控件、显式 block 区域和滚动条命中区域不可启动节点拖拽。
- 增加组件级命中测试，证明标题与上下 rail 启动 canonical drag hook。

## Capabilities

### New Capabilities

- `canvas-node-drag-surfaces`: 定义节点标题、边缘、内容控件和滚动条之间的拖拽命中所有权。

### Modified Capabilities

- 无。

## Impact

- `@neko/canvas-webview` L2：BaseNode 呈现与现有 `useNodeDrag` 的 DOM 命中范围变化；Canvas domain 和 Desktop IPC 不变。
- 用户数据：不改变节点位置 contract、持久化 shape 或历史语义；只有用户完成拖拽后才通过既有路径提交位置。
