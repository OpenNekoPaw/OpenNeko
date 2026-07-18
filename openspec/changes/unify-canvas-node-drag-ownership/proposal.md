## Why

Canvas 普通节点的 Header 与正文采用不同拖拽语义：Header 会移动节点，而正文被整体排除出节点手势并可能触发浏览器原生素材拖拽。该不一致让节点在画布及容器内难以直接移动，也会把素材预览误当成可拖出的内容。

## What Changes

- 将普通节点的非交互正文纳入节点级拖拽热区，使 Header 与正文共享同一节点移动路径。
- 在节点边界统一禁止浏览器原生内容拖拽，避免图片、文本或其他素材内容产生 drag payload 或拖拽幽灵图。
- 保留按钮、输入控件、可编辑内容、滚动条和显式交互区域的局部手势所有权。
- 保留容器内子节点的节点级拖拽能力，不引入节点内容级拖放协议或第二套拖拽实现。

## Capabilities

### New Capabilities

- `canvas-node-drag-ownership`: 定义 Canvas 节点框架、正文内容和显式交互区域之间的拖拽所有权与原生拖拽禁止规则。

### Modified Capabilities

无。

## Impact

- 影响 `packages/neko-canvas/packages/webview` 的 `BaseNode`、`NodeShell` 与节点拖拽回归测试。
- 不改变 `.nkc` 数据、跨层 message、Extension Host、Engine、Proto 或公共包契约。
- Webview 运行态需要验证普通节点正文拖拽、容器内节点拖拽和交互控件不误触节点移动。
