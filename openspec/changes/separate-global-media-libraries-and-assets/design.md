## Context

Desktop Home 当前用一个 `DesktopHomeAssetFacet` 同时投影媒体库和资产。查询把
`~/.neko/assets` 的直接子目录当成媒体库，把其中的文件又当成资产；v4 mutation 还会把用户
选择的外部目录复制进该根目录，并在移除时把整份副本移入废纸篓。这与产品领域边界相反：

- Media Library 是外部文件位置的连接和目录树管理；
- Asset Library 是 OpenNeko 拥有的创作素材、元数据和分发共享边界。

仓库已有 workspace-linked Media Library 的 OS link canonical path，证明目录连接可以由
symlink/junction 表达而无需保存绝对路径 registry。Desktop 全局连接需要相同的安全属性，但
生命周期属于用户级 Home，而不是项目 `neko/assets/<libraryName>`。

五层分析：

| 层 | 决策 |
| --- | --- |
| 职责 | Media Library owner 管连接与外部目录文件；Asset Library owner 管全局创作素材；Home 只组合两个投影。 |
| 依赖 | Renderer 只发 typed intent；Main 验证 identity；Node adapter 独占 link、目录选择和文件系统副作用。 |
| 接口 | 查询使用独立 `mediaLibraries` / `assets` bridge；媒体库 ID 包含类型和安全名称，不携带绝对路径。 |
| 扩展 | 当前 `filesystem` adapter 覆盖本地、挂载 NAS 与云盘同步目录；真正远程 provider 以后实现同一连接 port。 |
| 测试 | 断言不复制源目录、移除只 unlink、资产查询不包含媒体库文件，并 poison v4 mutation。 |

## Goals / Non-Goals

**Goals:**

- 使用目录连接表达本地、已挂载 NAS 和云盘同步目录。
- 在 Home 中把媒体库和资产库呈现为两个独立功能，而不是一个混合 facet。
- 媒体库按“连接根 → 文件夹树 → 文件”管理，添加/移除连接不改变目标内容。
- 资产库只读取 `~/.neko/assets` 拥有的素材，不聚合媒体库文件。
- 保持 Webview 不接收物理 target、绝对路径或凭据。
- 删除 v4 复制、staging 和 trash-library canonical path。

**Non-Goals:**

- 不实现 WebDAV、S3、Google Drive 等远程 provider、认证、同步或冲突解决。
- 不在本次建立完整资产发布市场、团队 ACL、版本服务或远程分发后端。
- 不自动删除、重分类或迁移上一版已经复制到 `~/.neko/assets` 的用户数据。
- 不改变项目内 `neko/assets/<libraryName>` workspace link 语义。

## Decisions

### 1. 用户级媒体库用独立 link 目录表达

新增全局 storage root `~/.neko/media-libraries`。连接按位置类型分组：

```text
~/.neko/media-libraries/
  local/<libraryName> -> /real/local/path
  nas/<libraryName> -> /Volumes/team-share/path
  cloud/<libraryName> -> /real/cloud-sync/path
```

目录选择器返回真实可访问目录，Node adapter 创建 symlink；Windows 使用 directory junction。
link target 是唯一映射事实，不另建包含绝对路径的 JSON registry。位置类型只表达用户意图和
UI 诊断，不改变文件读取算法。

备选的 JSON registry 会持久化绝对路径并形成第二个 resolver；复制目录则改变所有权并与资产
库混合，因此均不采用。

### 2. Media Library 和 Asset Library 使用独立查询

Home contract v5 提供：

- `mediaLibraries.search/add/remove/reveal`
- `assets.search`

媒体库搜索遍历已连接目录并返回两类安全投影：

- connection：名称、位置类型、availability；
- file/directory：相对连接根的 locator、层级和媒体类型。

资产查询只遍历 `~/.neko/assets`，返回 `asset:` identity。它不会读取
`~/.neko/media-libraries`，媒体库 discovery 也不会创建资产成员关系。

不保留 `facet` 参数，因为同一个 endpoint 上切换 facet 会继续暗示两个结果来自同一数据源。

### 3. 添加和移除只修改连接

添加媒体库时 Renderer 先选择 `local`、`nas` 或 `cloud`，Main 再打开原生目录选择器。Node
adapter 验证目标是物理目录，并在同类型目录下创建安全名称 link；同 identity 冲突必须显式
失败。

移除操作只 `unlink` 该受管 link。外部目标的目录、文件、时间戳和权限必须保持不变。定位操作
解析 link 后交给系统文件管理器。broken link 仍显示为 unavailable，并允许移除或重新配置。

### 4. 文件管理保留外部目标语义

媒体库文件按真实目录树投影。未来的新建目录、移动、重命名、导入和删除必须是独立 mutation，
显式携带连接 identity 与库内相对路径，并提醒用户它会修改外部目标。本次先建立连接、树浏览
和搜索 canonical path，不把“移除连接”复用成“删除目录”。

### 5. Asset Library 是新的独立 bounded context

`~/.neko/assets` 继续作为 Desktop 当前全局资产物理根，但不再承担媒体库连接 registry。当前
版本先提供拥有素材的搜索、排序与浏览；分发、共享、版本和授权以后进入
`creative-asset-library-management` owner，不回退到已退役的 `AssetEntity/library.json`。

该边界允许以后引入 asset manifest/package，而不改变 Media Library locator 或外部目录。

### 6. v5 直接替换 v4

v4 `assetsAddLibrary/assetsRemoveLibrary/assetsRevealLibrary` channel 和 parser 被删除。v5 使用
独立 media-library channel，旧 payload/version 必须 fail-visible。旧实现中的 copy helper、
staging prefix 和 trash adapter 一并删除，不允许旧路径继续成功。

## Risks / Trade-offs

- [NAS 或云盘同步目录暂时离线] → 保留 link 并投影 unavailable；不回退到同名资产目录。
- [移除 link 时误删目标] → Node adapter 必须 `lstat` 受管入口并只执行 `unlink`；回归测试保存目标内容并 poison trash/copy。
- [外部目录文件操作具有破坏性] → 每种 mutation 使用独立确认和路径边界；本次不把连接移除当文件删除。
- [目录规模大] → 保持有界搜索和结果 limit；树浏览按目录增量读取，不建立资产 catalog。
- [上一版复制产生重复数据] → 不静默删除用户数据；复制内容留在资产库，用户显式决定是否保留。
- [云 URL 无 provider] → 仅接受宿主已挂载/同步目录；非文件系统 URL 返回明确“不支持的 provider”诊断。

## Migration Plan

1. 新增 v5 contract 和独立存储 root；先用测试 poison v4 复制/废纸篓路径。
2. 把 Node adapter 改为创建/枚举/移除受管 link，接入 Runtime、AppHost、IPC 和 preload。
3. 拆分 Home Media Library / Asset Library UI 与查询状态。
4. 删除 copy helper、staging 目录语义和 trash-library adapter。
5. 保留 `~/.neko/assets` 的所有现有字节，不自动把其子目录转成媒体库连接。

回滚只回退应用代码和 v5 bridge；不得删除媒体库目标、连接目标或资产数据。由于产品尚未发布，
不保留 v4 runtime compatibility。

## Open Questions

无阻塞问题。真正的远程云 provider 和完整资产分发/共享流程需要独立 OpenSpec。
