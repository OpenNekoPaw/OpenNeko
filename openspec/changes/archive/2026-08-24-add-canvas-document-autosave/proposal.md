## Why

Canvas 用户编辑当前只进入实例级 Host 内存并标记 dirty，只有显式 Save intent 才写入 `.nkc`。节点内容、位置、尺寸等用户事实因此可能在关闭 View 或应用时丢失。直接从每个 UI handler 保存又会让 Markdown 每次输入和连续操作产生高频磁盘写入，并形成多个持久化成功路径。

## What Changes

- 由 Canvas Host runtime session 统一拥有文档自动保存调度，而不是由节点组件或拖拽 handler 直接写文件。
- 文档变更采用 trailing debounce；连续输入与连续操作只保存最新 authoritative Canvas，且同一 session 的持久化继续串行执行。
- 拖拽、缩放和旋转继续只在手势结束时提交 durable document change，预览帧不触发保存。
- 节点删除证明随 canonical document replacement 进入 Host session 并保留到成功保存，避免自动保存把合法删除误判为外部覆盖。
- 显式 Save 立即 flush 待保存文档；保存失败保持 dirty 并通过既有 Host diagnostic 路径显式报告。
- 视口和选择仍属于 presentation snapshot，不进入 `.nkc` 自动保存。

## Capabilities

### New Capabilities

- `canvas-document-autosave`: 定义 Canvas durable document 的空闲保存、手势提交、显式 flush、删除证明和失败语义。

### Modified Capabilities

无。

## Impact

- `@neko/canvas-domain` L0：拥有 Host session 的 dirty、删除证明、自动保存计时与串行持久化语义，并更新单一 canonical intent shape。
- `@neko/canvas-webview` L2：继续把 Canvas store 文档投影和删除/恢复事实提交给 Host；不拥有计时或文件写入。
- `apps/neko-desktop` Main：继续作为授权文件写入 adapter，使用现有 NKC codec、冲突检查与原子替换；不新增自动保存业务策略。
- 用户数据：现有 `.nkc` shape 不变；自动保存只写入当前有效文档事实，不迁移或重写其他文件。
