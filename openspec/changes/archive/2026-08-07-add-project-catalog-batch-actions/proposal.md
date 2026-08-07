## Why

项目目录目前只能逐条移除记录，无法高效整理大量有效或失效项目。资源中心已经建立了多选和批量操作交互，项目目录需要提供一致的本地管理能力，同时明确批量移除只修改最近项目记录、不删除磁盘数据。

## What Changes

- 为项目目录增加单选、修饰键切换、范围选择、全选当前筛选结果和清空选择。
- 在存在选择时显示批量操作栏，支持一次确认后批量移除最近项目记录。
- 允许选择和移除失效项目；失效项目仍保持可见且禁止打开。
- **BREAKING** 将项目移除 contract 从单个 `projectId` 收敛为唯一的非空 `projectIds` 批量请求，不保留旧 payload 或 fallback。
- Host 以原子语义校验并移除整批记录，同时清理所有窗口中的相关项目 Tab/View；任一 identity 无效时不产生部分成功。

## Capabilities

### New Capabilities

- `project-catalog-batch-management`: 定义项目目录选择模型、批量移除交互、Host 原子操作和失效项目约束。

### Modified Capabilities

无。

## Impact

- 业务 ownership：`@neko/host` 拥有项目目录记录、批量移除规则、跨窗口状态清理和原子失败语义。
- Desktop 应用角色：`apps/neko-desktop` Main/preload 仅解析和转发 package-owned typed IPC；Renderer 仅拥有当前页面的临时选择投影、确认交互和可访问 UI。
- 受影响公开契约：`OpenNekoDesktopShellBridge.projects.removeRecent` 及对应 request 从单 identity 调整为 identity 集合。
- 用户数据：只移除本地最近项目/工作区登记及应用窗口引用，不删除项目目录或项目文件；不引入云同步、数据版本或迁移路径。
