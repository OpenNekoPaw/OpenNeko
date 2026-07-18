## Why

Workspace Board 已经是统一的创作结果落点，但当前自动投递只覆盖 VS Code Agent 媒体生成路径；普通 Agent、后台任务和 TUI 产生的可审阅 Markdown、实际使用的素材引用及部分生成结果仍停留在对话或 Host 私有流程，导致用户打开 `neko/boards/workspace.nkc` 时无法看到完整、连续的素材处理记录。现有 extension-only writer 也不能安全处理跨 Host、多 Agent 并发，继续扩展会造成 `.nkc` 覆盖、重复节点或活动画布误路由。

## What Changes

- 引入统一的 Workspace Board typed artifact delivery：当前处理产生的 creator-visible Markdown、实际消费的稳定素材引用和生成媒体都通过同一 Canvas-owned 投递契约进入 Board；普通回答、reasoning、日志、未选搜索结果、runtime handle 和不可审阅失败继续留在 Agent 运行时。
- 让 VS Code Agent、Terminal TUI、纯 Node/Bun Host 和可恢复后台任务共享同一 Host-neutral delivery contract；Agent core 只声明 typed result 与 provenance，不拥有 Canvas 目标或直接解析、写入 `.nkc`。
- 将用户级 `LocalMetadataStore` 的既有 `tasks` / `task_checkpoints` 复用为 Board delivery 账本和恢复状态，按 `workspaceId` 分区；不新增 workspace SQLite、不增加第 19 张核心表，也不把该账本作为 conversation transcript 或 Board 布局事实源。
- 保持 `neko/boards/workspace.nkc` 为默认 Board 和布局权威。SQLite 只保存 pending/claimed/projected/blocked 投递状态；打开 Board 或 Host 启动时消费未完成投递，不从全部 SQLite 历史自动重建、覆盖或复活用户已编辑/删除的 Board 节点。
- 明确目标策略：没有显式 owning Canvas document 的 Agent typed result 写入 Workspace Board；已显式绑定普通 `.nkc` 的 Canvas authoring 只写该目标，不再镜像到 Workspace Board，也不通过活动/最近编辑器推断目标。
- 增加多 Agent/多 Host 协调：稳定 `projectionId + revision` 幂等、target-scoped fenced claim、写前重新加载与 revision 校验、原子文件保存、过期 lease 恢复和 fail-visible diagnostics，禁止 last-write-wins、静默重试到其他 Canvas 或旧 `Send to Canvas` fallback。
- **BREAKING**：用通用 typed delivery/flush contract 替换 VS Code Extension 私有的 `projectGeneratedAssets()` 成功路径，并迁移媒体生成、Markdown artifact、素材消费和后台结果调用方；当前 typed result 不再显示或依赖通用 `Send to Canvas`。

## Capabilities

### New Capabilities

- `workspace-board-artifact-delivery`: 定义跨 VS Code/TUI/后台 Host 的 creator-visible artifact 自动投递、默认与显式 Canvas 目标、SQLite delivery 账本、`.nkc` authority、幂等恢复和多 Agent 并发语义。

### Modified Capabilities

<!-- None. The repository has no promoted base OpenSpec capability for Workspace Board delivery; existing Canvas material actions consume projected nodes without owning delivery. -->

## Impact

- `packages/neko-types`: 扩展 Workspace Board typed artifact、delivery envelope、状态/诊断和 Host-neutral projector/storage ports；复用 LocalMetadataStore task repositories 与既有 project file codecs。
- `packages/neko-canvas`: 把 Workspace Board authoring 从 VS Code-only composition 中拆出可由 Node/Bun Host 复用的 Canvas-owned service，并让 Extension editor 与 headless writer遵循同一 revision/原子写入边界。
- `packages/neko-agent`: 在 typed result finalization、素材消费证据、Markdown artifact、媒体/后台 task delivery 中提交 Board delivery；删除 extension-only generated-asset 特化与当前结果的通用 handoff 路径。
- `scripts/agent-eval`: 更新现有 Workspace Board TUI case，并增加 Markdown/素材处理、后台恢复、显式 Canvas 不镜像和并发 no-fallback 的聚焦 Evaluation 证据。
- 文档与迁移：同步 Agent/Canvas architecture、SQLite ADR 的 delivery-task 使用说明和 prelaunch 内部 API 迁移；不迁移或删除现有 `.nkc`、生成素材、用户设置与有价值本地数据。
