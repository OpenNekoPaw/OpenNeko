## Context

Canvas Webview 在 `canvasData` 变化后发送 `canvasStatus`。Webview Host 将其转换成 `replace-document` intent，Canvas Host session 更新内存、维护 undo/redo 并标记 dirty。显式 `save` intent 才调用 Desktop 注入的 `saveDocument` effect。节点删除证明目前只保存在 Webview Host，并作为 `save.removedNodeIds` 发送；因此仅在 session 内对现有 `replace-document` 加计时器会丢失合法删除证据。

拖拽已经分离 preview 和 commit：pointer move 只更新交互预览，pointer up 才调用 `moveNodesEnd`。Markdown Rich Surface 则对内容变化持续更新同一节点，所以保存层必须合并连续 document replacement。

### Five-layer analysis

| Layer          | Decision                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Canvas domain Host session 拥有 dirty 与 durable save policy；Webview 拥有手势/编辑 presentation；Desktop 拥有授权文件 I/O。                            |
| Dependency     | Domain 只依赖注入的 save effect 和平台计时能力，不依赖 Electron、DOM 或 Node 文件 API。Webview 只提交 canonical intent。                                |
| Interface      | `replace-document` 原子携带完整 Canvas 与当前 pending removal evidence；`save` 只表达立即 flush。Snapshot shape 与 `.nkc` shape 不增加内部版本。        |
| Extension      | 所有 Canvas document mutation 复用一个 session scheduler；新增节点类型或编辑器无需增加保存 handler。                                                    |
| Test           | fake timer 单元测试证明 debounce、coalescing、手动 flush、失败 dirty、删除证明；Webview Host 测试证明消息顺序；Desktop 测试继续证明原子写入与冲突拒绝。 |

## Goals / Non-Goals

**Goals:**

- durable Canvas 编辑在短暂空闲后自动保存。
- pointer move 等 transient preview 不产生磁盘写入。
- 连续变更合并为最新 Canvas，持久化不并发。
- 显式 Save 立即保存，失败保持 dirty 和删除证明。
- 保持 presentation snapshot 与 Canvas document persistence 分离。

**Non-Goals:**

- 不改变 NKC schema、Workspace 文件 identity 或 Canvas 节点 contract。
- 不引入 crash-recovery journal、通用 document framework 或跨进程 cache。
- 不在本变更中重新设计多 View 共享同一 Canvas 的协同编辑。
- 不把 viewport、selection、hover、menu 或 drag preview 写入 `.nkc`。

## Decisions

### 1. Canvas Host session 拥有唯一 autosave scheduler

所有把 session Canvas 置为 dirty 的 canonical mutation 都调用同一 trailing scheduler。默认空闲窗口为 800ms；新 mutation 重置计时器。timer 到期后把保存加入 session 已有的 `operationTail`，因此 save 与 intent 不并发，也不会越过已排队的 document replacement。

保存成功清除 dirty 和 pending removal evidence。保存失败保持两者不变，并通过 Host projection diagnostic 显式报告；后续 mutation 或显式 Save 可以重试同一 canonical save effect。不得从 Webview component、store action 或 Desktop adapter 建立第二套 debounce/save 路径。

### 2. Document replacement 原子携带删除证明

`replace-document` intent 携带完整 Canvas 和当前 `removedNodeIds`。Webview Host 继续从 package-owned operation delta 累积删除/恢复事实，并在每次 document replacement 时发送当前集合。Session 以该集合替换 pending removal evidence，并在成功保存后清空。

`save` intent 不再携带删除证明，只要求 session 立即 flush 自己拥有的当前 Canvas 与 pending evidence。producer、consumer、parser、fixtures 和测试一次性切换到这一 canonical shape，不保留旧 save payload。

### 3. 手势预览不进入 durable mutation

移动、缩放和旋转的 pointer move state 保持在 Canvas interaction presentation。只有 pointer up/end 产生一次 store mutation、一次 history entry 和一次 `replace-document`。Autosave 不监听坐标帧、React render、selection 或 viewport。

Markdown 内容仍可在每次 Rich Surface change 时更新 authoritative in-memory Canvas，以避免第二 draft authority；800ms trailing save 合并连续输入。编辑器完成动作与 Cmd/Ctrl+S 都通过显式 Save flush 当前队列。

### 4. 显式 Save 是 flush，不是替代成功路径

显式 Save 取消待触发 timer，并在 session operation queue 中立即调用同一个 save effect。当前 Canvas 已 clean 时不产生冗余文件写入。失败返回 rejected result、保持 dirty，并保留 deletion evidence；成功发布 clean snapshot。

### 5. Presentation 保持独立

viewport 与 selection 继续通过 `update-presentation` 和 package-owned viewport snapshot policy 保存。它们不得安排 `.nkc` autosave。现有 500ms viewport snapshot debounce 不与 document autosave 合并。

## Boundary inventory

| Owner / role              | Canonical path                      | Producer -> consumer                               | Runtime boundary              | Replaced path / user-data impact          |
| ------------------------- | ----------------------------------- | -------------------------------------------------- | ----------------------------- | ----------------------------------------- |
| `@neko/canvas-domain` L0  | `CanvasHostRuntimeSession`          | document intent -> serialized save effect          | host-neutral async session    | 替换 explicit-only policy；NKC facts 不变 |
| `@neko/canvas-webview` L2 | `createCanvasWebviewHost`           | store projection/removal delta -> canonical intent | Browser/Renderer to Host port | 删除 `save.removedNodeIds` 临时 authority |
| Desktop Main              | `DesktopCanvasRuntime.saveDocument` | session save effect -> authorized Host files       | Electron trust boundary       | 原子写入实现不变                          |

## Risks / Trade-offs

- **连续编辑产生较多内存 history entry。** 本变更只合并磁盘写入，不改变现有 Rich editor undo/history 语义；该问题需要独立 history transaction 设计。
- **同一文档多个 View 仍可能产生 stale write。** 现有删除冲突保护保留；完整的共享 document owner/CAS 属于独立变更。本 autosave 不新增并行 save，因为每个 session 内严格串行。
- **应用在 debounce 窗口内异常退出。** 本变更降低正常操作丢失窗口，但不声称提供 crash journal；正常关闭 flush lifecycle 需由后续精确 Canvas close contract 完成。

## Migration Plan

1. 原子更新 Host intent contract、parser、producer、consumer 和 fixtures。
2. 在 Host session 加入可测试的 autosave scheduler、pending removal evidence 和 flush 语义。
3. 添加 domain/Webview/Desktop 路径级回归并更新 explicit-save guardrail。
4. 运行聚焦验证、OpenSpec、质量审查和 UI 交互验收。

## Open Questions

无 apply-blocking open question。
