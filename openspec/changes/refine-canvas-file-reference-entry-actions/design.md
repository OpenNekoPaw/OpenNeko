## Context

NodeLibrary 当前根据 `NodeLibraryCreationPolicy` 区分 `create`、`file-bound`、`source-bound` 和 `projection-only`。文件绑定类型已经禁止 drag-to-create，并在点击时调用 `project:addSource`，但 `NodeLibraryPanel` 仍把它们投影成与普通节点相同的 TreeView item，使用户难以判断条目是“立即创建节点”还是“先选择来源”。

职责分析：NodeLibrary 只拥有目录投影和用户入口；Extension Host 的 `project:addSource` 拥有文件选择、分类、授权和结果诊断；Canvas store 只在成功结果返回后创建引用节点。依赖分析：改动保持在 Canvas Webview L2，不新增跨层消息。接口分析：继续复用现有 creation policy 与 node type identity。扩展分析：未来新增 file-bound 类型会自动进入同一操作组。测试分析：需要同时证明节点条目保持可拖拽、文件操作不可拖拽、点击只调用 source-add、取消/失败不创建空节点。

## Goals / Non-Goals

**Goals:**

- 普通可创建类型继续使用节点 TreeView 条目。
- 文件绑定类型使用语义明确的操作按钮，标签表达“添加”，而不是空白节点。
- Basic 和 Professional 共享同一文件操作组；Basic 保持 Media 位于该组首位。
- 来源选择成功后继续创建现有具体节点，已有引用节点正常读取和渲染。

**Non-Goals:**

- 不新增 `FileReferenceNode`、导入容器、profile 或第二套节点 registry。
- 不合并或修改 `project:addSource`、文件分类、ResourceRef 或路径授权协议。
- 不把 Media、Document、Script 等改成非节点数据，也不迁移现有 `.nkc`。
- 不重构 Professional 子系统目录或播放路线。

## Decisions

1. `NodeLibraryGroup` 增加 package-local 的展示种类：普通节点组与文件来源操作组。普通组继续复用 `TreeView`；文件组使用简单按钮列表，不伪造 tree item，也不设置 draggable。
2. 文件操作按钮继续以 `CanvasNodeType` 作为请求 hint，点击直接调用已有 `onPickNodeSource(type)`。不增加新的 action id、message 或 dispatcher。
3. 文件操作标签由现有 descriptor label 组合“添加 {node}”，title 继续使用 `library.action.pickFile`。这样保持类型可识别，同时明确其副作用是先选文件。
4. 文件组保留统一聚合和去重逻辑，顺序仍由 owning descriptor/manifests 决定；Basic 中 Media、Script、Document 依次出现，Professional 追加 Model、CanvasEmbed、Project。
5. source-add 取消、拒绝或失败时沿现有 promise/diagnostic 路径结束，不创建默认 data 为空的节点。`createLibraryNodeAt` 的 file-bound guard 保持为路径级保护。

## Risks / Trade-offs

- [文件操作按钮不再享受 TreeView 键盘行为] → 使用原生 button，提供稳定 data attribute、可聚焦语义和完整 title；组折叠仍由现有 section button 管理。
- [“添加文件”组仍包含多种类型] → 保留类型化 picker hint，避免一个泛化入口无法表达 Script/Model/Canvas 过滤条件；未来确认统一分类 UX 后再收敛。
- [已有自动化依赖 data-tree-item-id] → 更新 Basic/Professional functional 场景，使用新的 source-action identity，并保留 Storyboard 等普通节点 selector 不变。
