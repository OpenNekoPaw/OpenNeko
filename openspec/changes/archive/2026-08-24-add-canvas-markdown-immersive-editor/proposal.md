## Why

Canvas Markdown 节点目前只能在节点的有限尺寸内挂载 Rich 编辑器。长文档因此同时受到节点宽高、画布缩放和节点变换控件约束，正文可读性、编辑空间和焦点反馈都不足。Canvas 已经拥有隔离画布交互的全屏 Surface 生命周期，因此 Markdown 编辑应复用该调用方边界，而不是继续把完整编辑交互压缩在节点正文内。

## What Changes

- 将 Canvas Markdown 节点的显式激活从节点内 Rich 编辑改为 Canvas 场景内的沉浸式全屏 Rich 编辑。
- 在选区工具栏为 Markdown 节点提供明确的 Canvas 内编辑动作；不再展示不可执行的通用文本编辑占位动作。
- 全屏编辑期间暂停画布缩放、平移、框选、连线、节点变换和 Canvas 快捷键；Escape 或“完成”关闭编辑并恢复原焦点和未变化的视口。
- 全屏 Surface 直接读取并更新同一个 Markdown 节点内容，不创建 Text Editor 文档会话、第二份内容状态或替代保存路径。
- 节点本体保持紧凑只读投影，避免节点编辑器与全屏编辑器并存。

## Capabilities

### New Capabilities

- `canvas-markdown-immersive-editor`: 定义 Canvas Markdown 节点的沉浸式 Rich 编辑、输入隔离和返回语义。

### Modified Capabilities

- 无。

## Impact

- `@neko/canvas-webview` L2：拥有 Canvas 场景内 Overlay、编辑入口、焦点与画布交互隔离，并通过现有节点更新 callback 写回当前 Canvas 文档事实。
- `@neko/markdown/rich-surface` L2：继续提供唯一 Milkdown Rich Surface；公共接口不变。
- `@neko/canvas-domain` 与 `.nkc`：节点 identity、内容 shape 和持久化事实不变。
- `apps/neko-desktop`：无生产代码变化；Desktop 仍只组合 Canvas Root，不拥有 Markdown 编辑逻辑。
