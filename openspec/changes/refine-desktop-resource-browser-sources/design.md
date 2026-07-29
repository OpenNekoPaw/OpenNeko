## Context

Assets 已提供 browser-safe Resource Browser Root、controller、presenter 和 contract，Desktop
也通过 fixed preload/Main bridge 复用这些入口。但数据 source 仍在
`apps/neko-desktop` 内直接递归遍历工作区，并把同一 helper 同时用于 Files 和 Media。
现有 contract 只支持三个扁平 facet 和扁平 item；没有目录/library root identity、children
分页、view mode、library management 或 sectioned search。

媒体库的 canonical authority 已由 accepted ADR 固定为
`neko/assets/<libraryName>` direct links；Creative Entity authority 已由
`@neko/entity` 和 representation binding service 固定。旧 Asset catalog 已退休，不能因为
Desktop 需要“素材库”界面而恢复 membership、Asset ID 或 `library.json`。

本变更跨 Assets、Entity、Desktop Main/preload/renderer 和 Content I/O，属于 L4
Desktop 创作入口改动。所有 renderer projection 必须保持 locator/Entity identity，不得携带
workspace absolute path、link target、Host handle 或 VS Code 对象。

## Goals / Non-Goals

**Goals:**

- 让 Resource Dock 成为一级侧边栏控制的独立 project-scoped panel，Main/Chat 只消费资源。
- 让 Directory 按真实工作区层级提供 tree/grid 和显式 children 查询。
- 让 Media Library 只枚举 direct linked roots，并支持 add/relink/remove、availability、
  tree/grid 和搜索。
- 让 Entity 与 Agent mention 共用 confirmed Entity/binding 查询，并明确投影 candidate
  diagnostic，而不是把 candidate 当 confirmed Entity。
- 让三类资源搜索使用 owner 提供的可取消 projection，并提供 sectioned All 结果。
- 把 Desktop 本地目录扫描移到 `neko-assets` 的 host-neutral source/service，保留一个
  canonical projection path。

**Non-Goals:**

- 恢复 AssetEntity/AssetVariant/AssetFile、`library.json`、Asset Source registry 或全局
  Asset membership。
- 在 Phase 1 自动扫描用户 Home、自动创建全局资源或自动确认 Entity。
- 在 Resource Browser 内实现 Preview、Canvas、Cut、document、generated-output 或 package
  reader/editor。
- 把现有 VS Code TreeView provider 直接导入 Electron，或让 host-neutral core 依赖 VS Code。
- 本轮实现跨项目 Home Global Media/Character Library；只冻结其显式 add/publish 边界。

## Decisions

### 1. Resource Dock 独立于一级侧边栏、Main 和 Chat

一级侧边栏仅保存显隐入口；Resource Dock 保存 project-scoped presentation、width、
active facet、view mode 和 selection。Phase 1 固定在右侧，不增加 move-left/right 按钮。
窄窗口由 Shell 变为 overlay。Chat 的 `@` 和 Main 的 open/drop 使用稳定 resource identity，
但不修改 Resource Browser source state。

相比把资源嵌入 Main，这可避免 Preview/Canvas/Cut 切换时丢失浏览状态；相比把全部内容放入
一级侧边栏，这保留了 icon rail 的导航职责和可调整宽度。

### 2. Resource Browser contract v4 表达层级、库根和分区搜索

contract 增加：

- `directory | media | entities | all` facet；
- `tree | grid` view mode；
- `workspace-root | library-root | directory | content | entity | entity-candidate` item role；
- stable `parentId`、`expandable`、safe locator/entity ref、availability 和 capability；
- snapshot/search/children/library-management request，全部携带 Resource Browser identity、
  request identity 和 expected revision。

tree children 由 Host 按需读取；grid 只显示当前 container children。搜索结果是扁平、
sectioned projection，包含来源和导航 parent identity。Renderer 不传 workspace root 或
absolute path。

### 3. Assets 拥有 host-neutral Directory/Media projection source

把 portable traversal、exclusion、linked-root enumeration、media detection、result
dedupe 和 search projection 放到 `neko-assets/resource-browser` 下的 Node/Host-neutral
service。该 service 只依赖窄文件、link、metadata/search ports；Desktop 负责把
`NekoHostPorts` 和 workspace grant 注入。

现有依赖 VS Code 的 `MediaLibrarySearchService`/TreeProvider 不进入 Electron。可复用的
index/search 规则提取为 host-neutral core，VS Code 和 Desktop 分别适配 watcher、
metadata repository 和 lifecycle。Desktop-local recursive source 被删除，防止第二事实源。

### 4. Directory 与 Media Library 使用不同 root policy

Directory root 是授权工作区，默认隐藏 `.git`、`.neko` cache、dependencies 和 build
output，并可通过显式 setting 显示隐藏项。它可以展示普通 workspace 文件，但不把其归入
Media Library。

Media Library root 只来自 `listWorkspaceLinkedMediaLibraries()`；每个 root 投影 safe name、
workspace path、availability 和 management capabilities。内容 locator 必须保持
`neko/assets/<libraryName>/...`。broken root 仍显示 root diagnostic，但不遍历 target。

### 5. Library management 是明确、revisioned 的 Host operation

add 先选择目录和可编辑 library name；relink 绑定现有 library identity；remove 需要显式
确认，只删除 link。operation 成功后 owner 增加 source generation、重建 projection 并发布
连续 event。取消保持 revision 不变；冲突、断链或授权失败 fail-visible。

不保存 target registry，也不把 absolute selection 回传 renderer。

### 6. Entity projection复用统一 authority

Resource Browser confirmed list 和 Agent mention 通过同一个 project-scoped
`CreativeEntityRegistry` reader，并组合 `EntityRepresentationBindingService`。
confirmed Entity 默认展示 canonical/display name、aliases、kind、status、metadata summary、
active representation 和 binding availability。

semantic candidates/ambiguities 通过独立只读 query port 投影为 candidate rows，默认与
confirmed 分组，不能携带 confirmed `entityRef`。自动 discovery 只更新 derived evidence；
promote/merge/dismiss 属于 Entity owner 的显式 operation，不由浏览器列表点击隐式执行。

### 7. 搜索由 owner 执行并按来源分组

默认搜索当前 facet；用户选择 All 时并行查询 Directory、Media Library 和 Entity，并返回
三个 section。Directory 匹配 relative path；Media 匹配 library/name/path/type/metadata；
Entity 匹配 canonical/display/alias/kind/status，candidate 匹配 evidence label。

查询携带 limit/cursor/request identity；新查询取消或忽略旧结果。大目录优先使用可重建
index，缺失 index 时使用有界扫描并返回 continuation，禁止 renderer 或文件事件回调执行
无界遍历。

### 8. 自动发现不等于事实晋升

工作区 Directory projection 和已链接媒体内容在启动、显式 refresh、文件 hint 与有界
reconciliation 后自动更新。新增创作文档可以进入 semantic candidate projection，但不得
创建 confirmed Entity、binding 或全局资源。

跨项目/全局资源必须通过 Home owner 的显式 add/link/publish change 单独实现；本变更只
保证 Desktop 不自动扫描 Home 或复制 project fact。

### 9. Resource Dock 不提供固定底部操作栏

Resource Dock 只在顶部提供来源管理、刷新、搜索、视图和 facet 控件。内容项单击按其
canonical capability 直接进入 Preview、Canvas 或 Cut，拖拽通过 `ContentLocator` 交给
Canvas/Cut owner；不在面板底部重复提供预览、删除、打开 Canvas、打开 Cut、Reveal 等
固定按钮。

Media Library 的 relink/remove 是 library-root scoped operation，只在对应根条目 hover 或
keyboard focus 时以内联 icon action 出现。这样管理动作仍与真实 owner identity 绑定，同时
避免空选中状态下出现一排不可用按钮，也不把 Main/Chat 的显示模式控制混入 Resource Dock。

### 10. Tree 与 Grid 使用不同的目录交互模型

list presentation 是真正的递归 tree：根节点始终保留，目录 disclosure 只切换该分支，
按需 children 合并后插入父节点下方，并以 `tree` / `treeitem` / `group` 语义表达层级。
展开状态继续由 project-scoped display state 保存。

grid presentation 是 current-container browser：激活目录进入该容器，breadcrumbs 用于返回
祖先或 workspace/library roots。两种 presentation 共享同一 `ResourceBrowserItem`
identity、children request 和 owner projection，不复制 source，也不把 list 点击解释为
grid navigation。

### 11. Tree 使用紧凑的单行信息层级

Directory list presentation 采用桌面文件浏览器式的紧凑单行 tree row：每一层统一保留
disclosure 槽位，目录使用 folder icon，文件使用类型 icon，支持缩略图的媒体使用小尺寸
thumbnail。文件名是主信息并允许视觉截断，但必须保留完整的 accessible name 和 hover
title。

tree row 不显示无意义的根级 `"."`、重复 kind 或第二行占位信息；路径等描述只在搜索结果、
grid 或确实帮助区分资源的上下文中展示。选中态使用低对比度整行背景，不改变
`ResourceBrowserItem`、ContentLocator、children source 或 activation contract。

## Risks / Trade-offs

- [contract v4 影响 Assets Root 与 Desktop bridge] → 同时迁移 producer/consumer，poison v3
  请求并增加路径断言，不保留 dual-read。
- [现有 VS Code service 依赖 vscode] → 只提取稳定 traversal/search core，VS Code adapter
  保持 package-local，不让 Electron import VS Code。
- [大工作区 tree/search 成本] → children lazy-load、分页/continuation、index 优先和取消；
  不在 initial snapshot 递归全树。
- [Entity candidate owner 尚未在 Desktop composition 中启动] → confirmed 路径先完整接入；
  candidate port 缺失时显示明确 unavailable diagnostic，不伪装为空成功。
- [linked target 写操作影响外部数据] → add/relink/remove/copy/delete 分离，remove 只删 link，
  copy/delete 保留明确确认和 fingerprint precondition。
- [Resource Browser 与 Agent 再次漂移] → 两者共用 confirmed query service，并用同 fixture
  断言结果 identity、status 和 binding 一致。

## Migration Plan

1. 冻结 v4 contract、item roles、view state、search sections 和 management requests。
2. 在 Assets 提取 host-neutral Directory/Media source，增加 producer tests。
3. 迁移 Desktop Main/preload/renderer 到 v4；poison v3 和 Desktop-local scan。
4. 接入 confirmed Entity/binding shared reader，再接 candidate diagnostic/query port。
5. 完成 tree/grid、library management、facet/All search UI 与 i18n。
6. 运行 Assets/Desktop/Agent producer-consumer tests、typecheck、architecture gates、
   Electron package 和 isolated Electron fixture。

预发布 rollback 通过还原整个 v4 change 完成；不保留 v3 fallback。现有 workspace links、
Entity facts、bindings 和用户文件不迁移、不删除。

## Open Questions

- Home 全局 Media/Character Library 的持久 owner、发布版本和跨项目引用仍由后续独立
  OpenSpec 决定；本变更不假设一个全局 target registry。
- semantic candidate query 在 Desktop Phase 1 若尚无完整 composition，是否先只提供
  unavailable diagnostic，还是连同 reconciliation runtime 一次接入，将以实现审计结果决定。
