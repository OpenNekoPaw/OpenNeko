## Context

Desktop Home 已有 purpose-scoped IPC、Project catalog、Pi SkillHost 和 Assets content-tree source，但现有组合把 Home 资产与 Skill 查询都绑定到 `projectId`，并把 Project 与 Conversation 放进同一个“全部创作”页面。目标 ADR 已明确 Home 的媒体库、能力和所有项目属于全局管理 scope；Project Resource Dock、项目 Agent 和 Home 会话 Inbox 是其他 scope。

本次变更影响 Renderer、preload、Main、Agent composition 与共享存储布局。旧 contract 尚未发布，可以破坏性升级并删除 project-scoped Home 查询，不保留双读或 fallback。

## Goals / Non-Goals

**Goals:**

- 资产中心只读取用户级全局媒体/资产 catalog，不遍历任何项目工作区。
- 插件页只读取 personal/builtin Skill 与 Desktop 全局插件投影，不附着项目 runtime。
- 所有项目只消费 Shell Project catalog，并提供搜索、排序、列表/网格视图。
- 三个页面使用统一、可测试的搜索与排序语义。
- 保持项目 Resource Dock、项目 Skill discovery、Agent conversation authority 和 Shell Project catalog 的既有 owner。

**Non-Goals:**

- 新增 Marketplace、外部插件安装/启用、MCP 管理或 Plugin Host。
- 创建全局 Entity catalog，或把项目 Entity/Media 复制到用户级存储。
- 为搜索引入数据库、watcher、cache manager 或新的跨领域 registry。
- 在本次实现资产导入、删除、重命名或项目归档。

## Decisions

### 1. Assets owns one user-global filesystem root

`IGlobalStorageLayout` 增加 `assets`，canonical path 为 `~/.neko/assets`。Desktop 启动组合把该 root 显式注入 Home asset catalog；Main 使用现有 Assets content-tree traversal 与媒体分类读取：

- `libraries` facet 只投影 root 的一级目录，目录名是全局媒体库名；
- `assets` facet 递归投影可识别的媒体/创作文件；
- request 不再携带 `projectId`，result 不再返回项目 identity、绝对路径或 workspace locator。

选择一个固定用户级 root，而不是聚合 Project Media Library，是为了让 Home 资产事实有唯一 owner，并满足“不展示项目内内容”。选择复用 content-tree traversal，而不是建立第二个 Assets index，是为了保持本地产品复杂度与真实规模相称。缺失 root 由 Desktop composition 创建；不可读或扫描失败返回 typed diagnostic，不伪装为空成功。

### 2. Search and sort are explicit query contract

Home asset request 携带 facet、query、`sortBy`、`sortDirection` 与 limit。Main 先在有界扫描中得到候选，再按稳定 secondary key 排序后截断。资产支持 name 与 modified time；Skill/插件和 Project catalog 数据量较小，Renderer 对完整 owner projection 做 name/source/status 或 name/updated time 排序。

排序选项由各 catalog 的真实字段定义，不增加无来源的“热门”“相关度”或使用次数。

### 3. Global Skill discovery is AppHost-owned, not a synthetic workspace

`DesktopAgentAppHostComposition` 增加 `readGlobalSkillCatalog()`，直接通过同一 `createNodePiSkillHost` canonical implementation 发现 personal 与 builtin roots。它不创建临时 Project、不 attach workspace，也不包含 project Skill。项目 Agent 的 project > personal > builtin discovery 顺序保持不变。

Global Skill policy 只投影当前可用记录；Home 继续删除 locator、fingerprint、physical path 和 raw diagnostic message。缺失 builtin root 继续 fail-visible。

### 4. Plugins projects Desktop global capabilities as plugin records

Home plugins result 把 Shell `domains` projection 映射为明确的 global builtin plugin records；UI 页签为 Skills / Plugins。外部 Plugin Host 仍显示 unavailable notice，且不提供安装、启用或 Marketplace 操作。这样用户看到的是全局能力 catalog，不再把某个项目当作插件 owner，同时不伪造尚不存在的外部插件运行时。

### 5. All Projects is a pure Shell catalog presentation

原“全部创作”页面替换为“所有项目”，只消费 `projection.catalog.projects`。Conversation summary 保留在开始页/会话入口，不进入项目 catalog。搜索按 display name，排序按 updated time 或 name；列表/网格仅是 Renderer presentation state，不复制项目事实或持久化第二份 catalog。

点击项目继续调用现有 open/focus operation，同一 Project owner 不重复创建。

### 6. Contract version 3 poisons the old path

Home management schema 升级到 version 3：

- asset/plugin request 删除 `projectId`；
- asset facet 收敛为 `libraries | assets`；
- plugin result 删除 `projectId` 和 project Skill source；
- preload 与 Main 只接受 version 3。

旧 version 2 payload 必须解析失败。这样开发和验收无法通过旧 project-scoped path 获得成功结果。

### 7. Component reuse stays local to the shared management surface

复用现有 `home-search-field`、segmented control、management card、Project row、theme 与 i18n runtime；新增的排序 select、view toggle 和 Project grid 是同一 Home management surface 的变体，不建立 package-local design system，也不把 Electron-only业务组件提升到 `@neko/ui`。

## Risks / Trade-offs

- [首次递归扫描较慢] → 使用显式 scan limit、排除隐藏运行目录，并保持无缓存 read-through；后续规模证明确有需要时再由 Assets owner引入索引。
- [固定 `~/.neko/assets` 尚无导入 UI] → 空状态明确展示全局 root 语义；导入/管理操作另立 Assets change，当前不回退显示项目文件。
- [把内置 domain capability 称为插件可能高估外部扩展能力] → 记录标记为 builtin，并持续显示外部 Plugin Host unavailable。
- [旧截图中的项目 Skill 不再出现] → 这是有意 scope 修正；项目 Skill 仍在对应项目 Agent 中发现和执行。

## Migration Plan

1. 升级共享 contract 与存储布局，先让 version 2 payload 测试失败。
2. 实现 global asset/Skill producers，并迁移 Main/preload。
3. 迁移三个 Renderer surface，删除 Project selector 与 Conversation list。
4. 运行 producer/consumer、Renderer、typecheck/build 和 Electron runtime 验证。

预发布回滚只需整体回退该 change；不迁移或删除用户数据。新建的 `~/.neko/assets` 空目录可安全保留，任何用户放入的文件都属于有价值数据，绝不自动清理。

## Open Questions

无。资产导入/删除和外部插件管理明确留给后续独立变更。
