## Why

资源中心当前只支持单条选择和单条移除，包含大量素材时无法通过框选完成批量整理，也缺少符合文件管理器预期的右键操作入口。增加多选、批量操作和受约束的文件移动，可以让本地素材整理保持高效，同时继续保护 Asset Library 与外部 Media Library 的所有权边界。

## What Changes

- 为资源中心增加单击、Cmd/Ctrl 切换、Shift 连选、全选与空白区域拖拽框选，并在目录或筛选结果变化时清理失效选择。
- 选择一个或多个可操作条目后显示批量工具栏，提供“移动到”和适用的批量移除操作。
- 使用 `@neko/ui` 的 canonical context-menu primitive 为条目提供右键菜单；右键未选条目时先将其设为唯一选择，右键已选条目时作用于当前选择。
- 增加同 owner 文件移动命令：Asset Library 文件只能移动到 OpenNeko 自有 Asset 根目录内，Media Library 文件只能移动到同一个已授权连接内。
- 移动前完整校验条目、目标目录和名称冲突；任一输入失效或冲突时拒绝整批操作，不静默覆盖文件，也不跨 owner、跨 Media Library 或移动连接/目录根。
- Asset Library 文件移动时同步更新 membership 的 package-relative path；文件系统或 metadata 提交失败时回滚当前批次并返回明确 diagnostic。
- 保留现有单条预览、目录导航、媒体库连接管理和“移除 Asset Library 记录但保留文件”语义。

## Capabilities

### New Capabilities

- `asset-center-collection-actions`: 定义资源中心多选、框选、批量工具栏、右键菜单、批量移除与同 owner 文件移动的交互和运行时边界。

### Modified Capabilities

- `media-library-resource-entry`: 允许用户通过显式资源中心命令在同一已授权 Media Library 连接内移动普通文件，同时保持 locator 与连接边界 fail-closed。

## Impact

- Owning responsibility: `@neko/assets-domain` 拥有选择可操作性、批量命令和结果 contract；`@neko/assets-node` 拥有路径授权、移动计划、冲突检查、文件系统执行与回滚；`@neko/local-metadata` 拥有 Asset membership 路径的原子更新；`@neko/assets-webview` 拥有会话内多选与菜单展示。
- Package roles: `packages/assets/domain`（host-neutral contracts/application）、`packages/assets/node`（Node 文件 owner）、`packages/assets/webview`（L2 browser UI）、`packages/local-metadata`（SQLite authority）和 `apps/neko-desktop`（Electron dialog、typed IPC wiring 与真实 fixture）。
- Canonical path: `AssetManagementRoot` → `AssetCenterManagementRuntime` → package-owned Host request → `AssetCenterNodeRuntime` → `ResourceBrowserNodeRuntime` 的单一 batch-move owner；不增加 Renderer 路径、raw filesystem API、备用 mover 或 test-only direct runtime。
- User data: 移动会修改用户显式选择的 Asset Library 或 Media Library 文件位置；操作限制在同一 owner 根内，禁止覆盖，并在提交失败时回滚。批量移除继续只修改 Asset membership，不删除源文件。
- Existing dirty worktree: 当前正在进行的 internal-versioning、Media Library sync 与 Asset Library 变更会被增量保留；本 change 不恢复已删除字段或建立兼容路径。
