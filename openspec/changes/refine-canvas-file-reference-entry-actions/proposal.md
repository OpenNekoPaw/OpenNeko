## Why

Canvas 节点库当前把 Media、Document、Script、Model、CanvasEmbed 和 Project 等文件绑定类型渲染成普通节点条目，即使运行时会先打开文件选择器，视觉上仍暗示可以直接创建没有来源的空节点。需要把“创建节点”和“选择文件后添加引用”明确分离，同时保留文件选择成功后产生的持久引用节点。

## What Changes

- 将文件绑定类型从可创建节点 TreeView 条目改为明确的“添加文件/媒体”操作条目。
- 文件操作条目不得支持拖拽创建；点击后继续通过 `project:addSource` 选择、识别并授权来源。
- 只有来源添加成功时才创建对应 Media、Document、Script、Model、CanvasEmbed 或 Project 节点；取消或失败时 Canvas 保持不变。
- Basic 与 Professional 继续复用同一节点 schema、descriptor 和 source-add canonical path，不新增 FileReferenceNode、空引用节点或第二套导入协议。

## Capabilities

### New Capabilities

- `canvas-node-library-source-actions`: 定义 Canvas 节点库中直接创建节点与文件来源添加操作的展示、交互和结果边界。

### Modified Capabilities

无。

## Impact

- 影响 `packages/neko-canvas/packages/webview` 的 NodeLibrary 分组、渲染、i18n 与交互测试。
- 继续复用现有 `NodeLibraryCreationPolicy`、`project:addSource`、文件分类和稳定 `ResourceRef` 创建路径。
- 不改变 `.nkc`、Extension/Webview message、Proto、Engine、容器模型或已存在引用节点的读取与渲染。
