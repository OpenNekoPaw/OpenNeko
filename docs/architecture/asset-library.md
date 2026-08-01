# 媒体库架构

更新日期：2026-08-01

> 文件名 `asset-library.md` 仅为保持既有文档链接稳定。产品与架构名称统一为 **Media Library / 媒体库**；不存在独立的 Asset Library、Asset Source 或文件 membership catalog。

本文定义媒体库文件入口、工作区 link、搜索投影、显式文件操作及其与 Creative Entity、Content I/O、DocumentAccess、生成结果和 package owner 的边界。跨领域决策见 [`adr-asset-library-sources-and-unified-entity-boundary.md`](adr-asset-library-sources-and-unified-entity-boundary.md)，路径安全见 [`cache-file-access-and-paths.md`](cache-file-access-and-paths.md)。

## 职责

媒体库只负责：

- 从 `neko/assets/<libraryName>` 的直接子 link 派生可用库根，并从权威项目引用派生缺失的必需库；
- 按 canonical `ContentLocator` 浏览、搜索、打开和诊断文件；
- 维护可重建的文件树、recent-use、technical metadata 和 availability projection；
- 显式 add、relink、remove link；
- 在用户选择可写目标后，通过授权 Content I/O 复制或删除文件。

媒体库不负责：

- 角色、场景、物品、地点或风格身份；
- 生成结果、文档 entry、package 或外部同步 provider 的生命周期；
- cache、thumbnail/proxy materialization、Webview URI 或 Engine token；
- 任意本机路径 registry、通用资源 ID registry 或自动文件 relocation。

## Canonical 模型

```text
Project: neko/assets/<libraryName>                    OS symlink/junction
                  |
                  v
Machine-global: ~/.neko/media-libraries/<kind>/<name> OS symlink/junction
                  |
                  v
Physical local/NAS/synchronized directory

workspace-file ContentLocator: neko/assets/<libraryName>/...
                  |
                  +----> ContentReadService / ContentRepresentationService
                  +----> Project Media facet / search / recent projection
                  +----> EntityRepresentationBinding (explicit user decision)
```

link 文件名就是媒体库名称，两个 OS link 分别拥有项目连接与机器全局连接；它们是名称到
物理 target 的唯一映射事实。项目设置、环境变量、SQLite、JSON 和 runtime service 都不得
复制 target。新的 Desktop add/relink 指向机器全局 alias，因此一次全局 relink 可以修复所有
参与项目；已有 direct-to-physical link 继续可读，只能经显式确认转换。

普通 workspace 文件与 linked 文件使用相同的 `workspace-file` locator。PathResolver 只处理 portable path normalization；它不知道 library ID、target setting、cache 或同步 provider。

## Link 与安全边界

- `libraryName` 必须是 portable single segment，并避开 `library.json` 等退休 catalog 保留名。
- `neko/assets` 与其父目录不能是 symlink；仅允许 direct child 作为受管 library link。
- Host guard 校验最终 realpath 仍位于该 direct link target 内，拒绝 nested-link escape、loop、broken link 和 unmanaged symlink。
- 项目只 Git-ignore link 路径，不提交 target string，也不宽泛忽略媒体内容。
- 移动工作区不会破坏相对 link target；绝对 link target 的有效性由 OS 决定。应用不维护第二份修复映射。

link 不可用时，媒体库显示 safe diagnostic 与 relink 操作。不得尝试同名目录、旧设置变量或历史 target 作为回退。

## 同步、恢复与便携快照

普通 Git 或文件夹同步只传输项目事实中的 portable `ContentLocator`，不传输本机 link 或
external Media Library 字节。项目打开时，Desktop 从 Canvas、Cut、Entity representation
等 owning codec 的权威引用重建必需库，不读取 `library.json`、target registry 或缓存
membership。

项目媒体 facet 区分：

- `available`、`required-unlinked`、`global-connection-missing`；
- `target-unavailable`、`content-incomplete`、`entry-conflict`；
- `unreferenced-linked`。

恢复使用不可变的 revisioned plan：只接受 exact-name 全局连接或用户明确选择的目录，验证
全部被引用 descendant，经确认后才创建或替换项目 link。打开项目、刷新 projection 或重建
SQLite metadata 都不得修改 link、项目事实或 target。

需要把项目交给另一台机器且不依赖 relink 时，用户显式创建独立便携快照。Desktop 在 sibling
staging 中只收集权威引用的 linked bytes，校验 fingerprint，重写 staged owning documents，
完整验证后一次 atomic rename 发布。source workspace 与 external library 全程只读；它不是
普通同步、add/relink 或项目 Media facet 的隐式步骤。

全局资源中心与项目资源管理器是独立 surface：前者管理机器级连接和 owned Asset，后者只浏览
当前项目、投影缺失需求并提交恢复 intent。两者不得共享 selection、filter、layout 或 active
state；便携快照进度属于项目生命周期 surface。

## Projection

文件树、搜索、最近使用、技术元数据和 availability 都是可重建 projection，以 locator 和 fingerprint 为键。文件事件是低延迟提示，有界 reconciliation 才保证完整性。

发现文件只更新 projection：

- 不创建 Creative Entity；
- 不创建 representation binding；
- 不分配 Asset ID；
- 不写 `library.json`；
- 不把同步 provider 或 link target 写入项目事实。

Search 返回 canonical locator。legacy Asset partition、绝对路径、变量路径、cache path 或陈旧 fingerprint 只能被丢弃并重建，不能被修补成新的 authority。

## 内容读取与表现

媒体库不实现第二套 reader 或 cache manager：

| 资源 | 读取 owner |
| --- | --- |
| workspace / linked file | shared Host `ContentReadService` |
| document entry | DocumentAccess owner adapter |
| generated output | generated-output owner identity + digest |
| package resource | package owner manifest/trust adapter |
| thumbnail/proxy/preview | `ContentRepresentationService`；cache 仅是 Host 内部实现 |

公共或持久契约不得包含绝对 source path、link target、cache path、materialization 状态、Webview URL、Engine token 或 provider-private error。

## 显式操作

| 用户意图 | Operation | 所有权结果 |
| --- | --- | --- |
| 添加共享目录 | add directory library | 创建全局 alias 与 workspace link，不复制库内容 |
| 修复同步后缺失连接 | plan / confirm / apply recovery | exact-name 验证后只创建或替换 workspace link |
| 重新定位已有库 | relink | 更新全局 alias 并替换 workspace link，不改 target 内容 |
| 移除库 | remove link | 只删除 link |
| 创建可独立移动的项目 | portable snapshot | 复制被引用字节到新项目并重写 staged 项目事实 |
| 整理已有文件 | copy to selected writable library | 复制真实字节，保留 source identity |
| 删除库内文件 | authorized delete | 明确修改 external target，需用户确认与 fingerprint precondition |
| 保留生成结果 | retain generated | generated-output owner 负责 revision/digest/lineage |
| 导入 package | package import/install | package owner 负责 manifest、trust 与成员角色 |
| 关联创作身份 | bind/rebind | Creative Entity owner 只更新 binding fact |

link 存在不等于目标可写。复制与删除必须明确选择 library、目标路径、conflict policy 和用户意图。删除文件不会删除 Creative Entity；删除 binding 不会删除文件。

## 与 Creative Entity 的关系

Creative Entity 是 character、scene、object、location 和 style 的唯一语义身份 authority。`EntityRepresentationBinding` 直接保存 workspace、document-entry、generated-output 或 package-resource locator。

文件移动或 fingerprint 不匹配时，binding 变为 orphaned。Search 可以给出候选，但只有显式 rebind 可以修改 confirmed binding；不得通过旧 catalog、fingerprint registry 或文件名猜测自动迁移。

## Legacy Asset catalog

以下路径已退休，正常 runtime 不得读取或返回成功：

- `AssetEntity -> AssetVariant -> AssetFile`；
- `neko/assets/library.json`；
- `project://assets/<id>`；
- Asset Source registry、import/promote membership；
- Asset-specific Extension API、commands、search partition 与 Agent capability。

遗留数据只进入显式 inspection/migration/recovery。迁移先创建 content-addressed archive、校验 revision/digest，再把可确定记录转换为 locator 或 binding；歧义和无 owner metadata 保留在 unresolved report。archive 绝不是正常读取的回退源。

## 存储归属

| 数据 | Canonical owner / persistence | 不迁入 SQLite 的原因 |
| --- | --- | --- |
| 项目与全局 Media Library target mapping | OS symlink/junction | SQLite target row 会成为第二 resolver 并产生机器相关陈旧路径 |
| `.neko/workspace.json` | Workspace identity owner | 是轻量 checkout recovery descriptor，不是通用本地 metadata |
| 项目 JSON/NKC/OTIO | Owning project codec | 是可审阅、可同步的权威项目事实 |
| JSONL journal 与日志 | Journal/logger owner | append-only recovery 与 DB 故障诊断必须保持文件语义 |
| Media 与 retained artifact bytes | File/artifact owner | 大型字节和生命周期不属于关系 metadata |
| Credential、mount secret | SecretStorage/system keychain | 普通 SQLite 不具备对应安全与信任边界 |
| Requirement freshness、probe cache、snapshot task/checkpoint | 用户级 `~/.neko/neko.db` | 可重建 projection 与最小跨重启状态；不得包含 target、绝对路径或 media bytes |

## 已知限制与发布风险

- 权威 reference reader 未覆盖的项目 document kind 必须返回 `coverage-incomplete`，不能声明
  linked-ready 或 portable-snapshot-ready。
- Git、文件同步工具和不同 OS 对 symlink/junction 的处理仍不一致；产品文案只能承诺同步
  portable references，不能承诺同步 linked bytes。
- macOS/Unix symlink 可在本机验收；Windows directory junction 与真实 UNC/NAS target 必须在
  Windows host 单独验证。缺少该证据时，Windows 网络媒体库属于 release blocker。
- 大型便携快照需要在写入前验证 destination conflict 与可用空间；中途取消、fingerprint
  变化或 publish conflict 只能清理 staging，不能产生部分成功 destination。

## 验证不变量

- 任何媒体文件无需 catalog membership 即可读取、预览和引用。
- link target 不出现在项目事实、Agent payload、Webview state 或 safe diagnostic。
- projection 可删除重建，且不会创建 Entity facts。
- copy/delete 命中 shared Host Content I/O 和授权 writer；package resource 无 owner adapter 时 fail-visible。
- legacy catalog handler 被 poison，不能参与成功路径。
- open/metadata rebuild 不改 link、target 或项目事实；add/relink 不复制整库。
- recovery 只能经 plan/confirm/apply；package/export 只按权威 locator 经 ContentReadService
  解引用被请求字节。
