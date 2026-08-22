## Why

Canvas 可以保存多节点选择，但拖拽、层级和锁定操作仍沿用单节点 contract。用户框选或追加选择多个节点后，拖动只提交被抓取节点，右键命令也只修改命中的节点；同时每个选中节点继续显示单节点缩放和旋转手柄，造成批量变换已经可用的错误暗示。追加框选还会在 pointer down 时先清空已有选择，无法可靠合并。

## What Changes

- 让拖动任一已选节点时，全部选中且未锁定的顶层移动根按同一 Canvas delta 实时预览并原子提交。
- 保持父容器与已选后代只移动一次；移动结束只生成一条 history 快照，并保留精确节点 operation 记录。
- 在开始拖动未选节点时将其设为唯一选择；拖动结束不再由 click 折叠已有多选。
- 修复 Shift、Command 和 Control 修饰键的追加点击与追加框选语义，避免 pointer down 清空原选择。
- 让多选右键置顶、置底和锁定命令作用于完整选择，并让多选工具栏提供创建副本和删除入口。
- 多选时隐藏只支持单节点的缩放和旋转手柄，避免不可执行的批量变换提示。

## Capabilities

### New Capabilities

- `canvas-multi-selection-operations`: 定义 Canvas 多选、批量移动、批量命令与单节点变换提示的一致语义。

### Modified Capabilities

- 无。

## Impact

- `@neko/canvas-webview` L2：拥有浏览器内选择修饰键、框选、拖拽预览、批量 Canvas store mutation、工具栏和右键菜单行为。
- `@neko/canvas-domain`、`.nkc` 与 Desktop IPC：公共 contract、持久化 shape 和 host runtime 不变。
- `apps/neko-desktop`：无生产代码变化；继续只组合 Canvas Root。
