## Context

Markdown 节点的 durable content 已由 Canvas document 中精确 `node.id` 下的 `data.content` 拥有。现有节点组件在本地维护 `isEditing`，并在有限节点正文内懒加载 `MilkdownRichSurface`。Canvas 同时已有场景级 modal Surface，它能够暂停 viewport、连接、框选和快捷键，但当前仅用于只读资源预览。

本变更只替换 Canvas Markdown 节点的编辑 presentation，不改变 Markdown grammar、Canvas domain contract、Desktop IPC 或 Text Editor session。

### Five-layer analysis

| Layer          | Decision                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Canvas Webview 拥有当前场景的沉浸式编辑 Surface、入口、焦点和手势隔离；Canvas document 继续拥有节点内容；Markdown package 继续拥有 Rich engine。                    |
| Dependency     | `@neko/canvas-webview` 只通过既有 `@neko/markdown/rich-surface` public entry 组合编辑器；不依赖 Desktop、Node 或 Text Editor 实现。                                 |
| Interface      | Surface 接收精确 Markdown node 和现有 `onNodeUpdateData` callback；不增加 IPC、domain DTO、schema 或内部版本字段。                                                  |
| Extension      | Canvas 场景使用一个 discriminated fullscreen Surface state；后续 Canvas-owned modal presentation 可显式增加 union case，但不会建立 registry、fallback 或隐藏 Root。 |
| Test           | 组件测试验证节点只读、全屏编辑更新、Escape/完成关闭和故障状态；Canvas 功能场景验证视口不变、输入隔离和视觉布局。                                                    |

## Goals / Non-Goals

**Goals:**

- 为长 Markdown 内容提供占据当前 Canvas 工作区的清晰、可滚动 Rich 编辑布局。
- 保持一个编辑器挂载和一个 authoritative node content 写入路径。
- 让双击与工具栏动作进入同一全屏编辑 Surface。
- 在关闭后恢复 Canvas 的选择、视口和先前焦点。

**Non-Goals:**

- 不增加 Source/Split、文档大纲、文件保存状态或 Text Editor 的完整 authoring 能力。
- 不把 Canvas inline Markdown 转换为 Workspace 文本文件或创建新 View/session。
- 不改变 Main Preview、全屏资源预览或 Agent Markdown presentation。

## Decisions

### 1. 使用一个 Canvas-owned fullscreen Surface state

`InfiniteCanvas` 将只保留一个 discriminated union 表达当前全屏 Surface：资源预览或 Markdown 编辑。该 state 是当前挂载期间的 presentation，不持久化，也不进入全局 store。两个 case 互斥，所有画布输入 suspension、工具栏隐藏和 Root keyboard suspension 都由 union 是否存在计算，避免并行 modal owner。

资源预览继续使用现有 `CanvasFullscreenPreviewOverlay`。Markdown 编辑使用 package-local `CanvasMarkdownEditorOverlay`，两者共享场景边界和关闭/焦点恢复语义，但不共享 Viewer 或 editor body。

### 2. 节点内容保持唯一 authority

全屏 editor 每次 render 通过精确 `nodeId` 解析当前 `nodes` 中的 Markdown 节点，并把 `node.data.content` 传给受控 `MilkdownRichSurface`。编辑回调使用既有 `onNodeUpdateData(node.id, {...node.data, content})`，因此 Canvas store/history/save pipeline 保持不变。

Surface 不保存独立 draft，不在关闭时批量覆盖内容，也不创建 Text Editor session。目标节点若在 Surface 存续期间失效，只在当前 Overlay 显示明确 diagnostic；不得回退到 selected/active/recent 节点。

### 3. 替换节点内编辑，不保留双成功路径

Markdown 节点本体始终渲染紧凑只读 `MarkdownDocumentView`。双击节点与选区工具栏 `canvas:edit-markdown` 动作都打开同一个沉浸式 Surface。删除节点组件的 `isEditing`、Rich engine 和节点内 Escape 路径，防止两个编辑器同时挂载或由相同输入进入不同成功语义。

通用 material `text:edit` 动作继续属于其 owner，但 Canvas inline Markdown 没有 Text Editor document identity，因此它不再为该节点生成不可执行的稳定占位；Main Preview handoff 保持独立。

### 4. 全屏布局与输入边界

Overlay 覆盖当前 Canvas viewport，而不是整个 Desktop Window。顶部栏显示 Markdown 类型、节点标题、编辑状态和“完成”动作；正文使用主题 token、可读行宽、独立滚动和明显焦点。Rich editor 在异步加载后聚焦。

Overlay 使用 modal keyboard metadata，只拥有 Escape；普通方向键、输入法、撤销/重做和 Rich editor 快捷键留给编辑器。Surface 打开期间 viewport wheel、pan、marquee、connection、selection toolbar 和 Canvas keyboard dispatcher 全部暂停。关闭时恢复打开前焦点，不修改 viewport。

## Boundary inventory

| Owner / role                         | Canonical path                  | Producer -> consumer                                  | Runtime boundary                      | Replaced path / user-data impact       |
| ------------------------------------ | ------------------------------- | ----------------------------------------------------- | ------------------------------------- | -------------------------------------- |
| `@neko/canvas-webview` L2            | package Root / `InfiniteCanvas` | exact node selection/activation -> fullscreen Surface | Browser DOM、focus、pointer、keyboard | 替换节点内 Rich editor；节点内容不迁移 |
| `@neko/markdown/rich-surface` L2     | `/rich-surface`                 | Canvas node content -> Milkdown                       | Browser-only controlled editor        | 公共 contract 不变                     |
| Canvas document owner                | existing node update callback   | editor change -> exact `node.id` data update          | 当前 Canvas store/save pipeline       | `.nkc` shape 与 identity 不变          |
| `apps/neko-desktop` composition root | existing Canvas Root wiring     | Canvas package -> Desktop scene                       | Electron composition only             | 无生产变更                             |

## Risks / Trade-offs

- [长文编辑时频繁受控更新] → 继续使用当前节点内 editor 已采用的同一 Rich Surface 和 node update path；本变更不新增同步层。性能风险通过稠密长文功能场景观察。
- [全局 Escape 抢占编辑器语义] → Overlay 只在 capture boundary 拥有 Escape；其余按键不拦截，并通过组件测试验证方向键留在 editor。
- [失去紧凑节点内快速修改] → 显式双击和工具栏仍是一跳进入编辑；换取稳定可读空间并删除两套编辑 presentation。

## Migration Plan

1. 建立 Canvas-owned Markdown editor Overlay 和组件测试。
2. 将 `InfiniteCanvas` modal state 收敛为 preview/editor union，并接入精确 node update。
3. 将 Markdown 节点激活和选区工具栏切到全屏 editor，删除 inline editor。
4. 补充样式、i18n、功能场景、视觉验收和相邻资源预览回归。

不改变 durable facts，因此回退代码即可恢复旧 presentation；不得通过 feature flag 保留旧节点内编辑成功路径。

## Open Questions

无 apply-blocking open question。
