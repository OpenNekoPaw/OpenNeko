## Context

项目管理页已经有搜索、排序、列表/网格展示以及单项目打开和移除，但选择状态仍等同于 Shell 的单个活动项目，无法表达目录管理中的多选。资源中心已经验证了桌面目录常用的修饰键、范围选择、全选和批量工具栏交互。本次变更跨越 Renderer、typed preload/Main IPC 和 `@neko/host` 项目状态服务，需要明确 UI 临时状态与持久业务状态的边界。

当前 canonical path 是 `OpenNekoDesktopShellBridge.projects.removeRecent` → Desktop preload/Main sender-bound IPC → `DesktopShellService.removeRecentProject`。业务结果由 `@neko/host` 决定；Desktop 只负责 Electron 边界和产品 UI 组合。

## Goals / Non-Goals

**Goals:**

- 为项目目录提供与资源中心一致的高效多选和批量移除体验。
- 由 `@neko/host` 原子校验并移除整批项目记录及所有窗口引用。
- 保持失效项目可见、可选择、可移除，但不可打开。
- 将单项目和批量项目操作收敛到一个 typed contract 和一条成功路径。

**Non-Goals:**

- 不删除磁盘项目目录、项目文件或生成产物。
- 不增加批量打开、云同步、内部 schema version、迁移或兼容 fallback。
- 不把页面选择状态持久化为项目事实，也不建立跨领域 selection framework。

## Decisions

### Renderer 使用页面局部的 identity selection

`DesktopProjectCatalogSurface` 以 `Set<string>` 语义保存选中 identity 和范围选择 anchor，并根据当前筛选排序结果计算范围与全选。Shell 的 `selectedProjectId` 仍只表示当前活动项目，不再兼任目录多选状态。

选择规则参考资源中心的交互，但在项目页面内实现小型纯函数，因为两者的领域 item、生命周期和包依赖方向不同；`apps/neko-desktop` 不得导入资源包内部实现。纯 selection 函数可独立测试，React 仅投影结果。

替代方案是提取跨包 selection manager。当前只有两个表现相似但 owner 和 item lifecycle 不同的消费者，抽取公共状态框架会增加不必要依赖，因此不采用；出现第三个相同契约的真实消费者时再评估 `@neko/ui` primitive。

### 唯一 removeRecent contract 接受非空 identity 集合

package-owned contract 改为 `removeRecent(projectIds: readonly string[])`，request 只包含 `projectIds`。创建器和解析器拒绝空数组、空 identity、重复 identity 和额外字段。单行移除按钮也发送 `[projectId]`，不保留旧 `projectId` payload、alias 或 fallback。

生产者是 `@neko/host/desktop-shell-contract`；消费者是 Desktop preload、Main `DesktopAppHost` 和 Renderer bridge。runtime boundary 是 renderer sandbox 到 Electron Main 的 sender-bound IPC。被替换路径是单 identity request 与 `DesktopShellService.removeRecentProject(windowId, projectId, ...)`。

### Host 先完整校验，再一次 commit

`DesktopShellService` 在 mutation queue 内先解析每个项目来自持久目录或显式保留的失效记录，并在任何写操作前确认整批 identity 都存在。随后通过一个批量 port 撤销 workspace registry 登记；本地 adapter 在 metadata store 的 `state-write` 事务内先确认全部 workspace 存在，再删除整批记录。registry 成功后，服务一次 commit 新的项目集合和所有窗口投影。

Desktop service 不吞掉失败，也不把部分结果报告为成功。项目状态 repository 和 workspace metadata 各自使用单事务边界；不增加补偿、双写或 fallback 路径。

### Application 层只保留 Electron 与展示职责

`apps/neko-desktop` 保留 request sender 绑定、preload bridge、确认对话框、键盘/鼠标事件和临时 UI selection。这些逻辑依赖 Electron window identity 或 React DOM 交互，不是可下沉的 host-neutral 项目业务规则。项目存在性、原子删除、跨窗口清理由 `@neko/host` 公开 service 决定。

用户数据影响仅限最近项目/工作区登记和窗口引用；项目目录与文件不被访问或删除。无需迁移：这是预发布 typed IPC 的原子替换，旧 payload 必须 fail-visible。

## Risks / Trade-offs

- [两个本地持久 authority 无法组成一个跨 store 事务] → 先原子更新 workspace metadata，再单次提交 Shell state；失败保持可见且不报告成功，不使用补偿或双写隐藏错误。
- [筛选或项目刷新后 selection 指向不可见/不存在项目] → 每次项目集合变化时将 selection 约束到仍存在的 identity；批量工具栏只对有效 selection 计数。
- [键盘删除误触] → 输入控件内不处理目录快捷键，批量移除必须经过明确确认，并在文案中声明不删除磁盘文件。
- [窄窗口批量工具栏拥挤] → 使用可换行布局和固定图标按钮尺寸，通过真实 Electron 窄窗口截图验收。

## Migration Plan

1. 更新 package-owned request、bridge 和 Host service，删除单 identity 成功路径并补严格 contract/原子行为测试。
2. 更新 Renderer 调用方和项目目录多选 UI；单项目操作统一传单元素数组。
3. 运行生产者/消费者测试、类型检查、legacy/internal-version 门禁和真实 Electron 验收。
4. 本变更不迁移用户数据库；回滚代码不会修改磁盘项目数据，但已被用户移除的最近项目记录需通过重新打开目录恢复。

## Open Questions

无。
