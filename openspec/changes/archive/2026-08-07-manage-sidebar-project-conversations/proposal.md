## Why

项目目录删除目前只移除 Project 登记，关联 Agent 会话随后被侧边栏重新投影为“工作区不可用”组，导致用户看到已删除项目仍残留。侧边栏也只支持逐条会话操作，缺少项目级折叠、打开、新建会话和完整清理能力，失效诊断的位置与普通条目不一致。

## What Changes

- 将项目目录和侧边栏的项目删除统一为“删除 Project 登记及其关联会话”，明确不删除磁盘项目目录或文件。
- **BREAKING** 将 `projects.removeRecent(projectIds)` 收敛为语义明确的 `projects.delete(projectIds)`；不保留旧命令、payload alias 或 fallback。
- 在 package-owned Host 编排中先原子移除 Project catalog/Window 引用，再按 authoritative Project conversation group 删除精确会话；失败保持可见且不报告成功。
- 将侧边栏 Project、失效 Workspace、个人助手、角色和聊天室会话统一为可折叠组；Project 组提供打开项目、新建会话和删除项目及会话操作。
- 将 Project、Workspace 和 Conversation 的 item-local 不可用诊断统一放在条目右侧，完整 diagnostic 通过可访问标签和 tooltip 保留。
- 保持失效数据可见和可手动清理；不可用项目/会话仍禁止打开，不回退到 active Project 或其他会话。

## Capabilities

### New Capabilities

- `desktop-sidebar-project-management`: 定义侧边栏项目/会话分组、折叠、项目级操作和右侧 item-local 诊断布局。

### Modified Capabilities

- `project-catalog-batch-management`: 项目删除同时清理其 authoritative sidebar conversation group，但仍不得删除磁盘项目文件。

## Impact

- `@neko/host` 拥有严格 Project 删除 contract、Project/Conversation group 解析、Project state commit 顺序和跨领域删除编排规则。
- `@neko/agent-runtime` 的既有全局精确 conversation delete 入口继续拥有 Pi runtime/transcript 清理；不修改 Agent prompt、run、queue、provider 或 transcript projection。
- `apps/neko-desktop` Main/preload 只保留 sender-bound IPC delegation 和 concrete Agent delete port；Renderer 只拥有折叠状态、确认交互和展示。
- 受影响公开契约为 `OpenNekoDesktopShellBridge.projects`；旧 `removeRecent` API 被删除。
- 用户数据影响：删除关联会话和本地 Project/Workspace 登记，但不删除 Project 目录、文件、媒体或生成产物；无需 schema version 或数据迁移。
