# 资源库架构：媒体库与素材库

更新日期：2026-08-05

> 当前稳定约束仍是：普通文件通过 **Media Library / 媒体库** 和 `ContentLocator`
> 直接访问，不需要 catalog membership。独立 **Asset Library / 素材库** 仅管理显式导入、
> 安装或发布的版本化素材包，其完整实现由活跃 OpenSpec
> [`establish-manifest-backed-asset-library`](../../openspec/changes/establish-manifest-backed-asset-library/)
> 跟踪；不得据此把尚未完成的云同步描述为当前能力。

本文定义媒体库文件入口、素材包生命周期、工作区 link、搜索投影、显式操作及其与
Project Entity、Content I/O、DocumentAccess、生成结果和 package owner 的边界。跨领域决策见
[`adr-asset-library-sources-and-unified-entity-boundary.md`](adr-asset-library-sources-and-unified-entity-boundary.md)，
路径安全见 [`cache-file-access-and-paths.md`](cache-file-access-and-paths.md)。

## Media Library 职责

媒体库只负责：

- 从 `neko/assets/<libraryName>` 的直接子 link 派生可用库根，并从权威项目引用派生缺失的必需库；
- 按 canonical `ContentLocator` 浏览、搜索、打开和诊断文件；
- 维护可重建的文件树、recent-use、technical metadata 和 availability projection；
- 显式 add、relink、remove link；
- 在用户选择可写目标后，通过授权 Content I/O 复制或删除文件。

媒体库不负责：

- 角色、场景、物品、地点或风格身份；
- 生成结果、文档 entry、package 或外部同步 provider 的生命周期；
- cache、thumbnail/proxy materialization、Renderer URL 或 runtime token；
- 任意本机路径 registry、通用资源 ID registry 或自动文件 relocation。

## Asset Library 目标职责

素材库不是普通文件入口，也不是退休 `AssetEntity/library.json` catalog 的改名版本。它只负责：

- 通过显式 import、install 或 publish 接受可复用素材；文件发现不产生素材身份；
- 以稳定 `assetId`、不可变 revision、digest、typed manifest 和 package-relative member
  管理素材包；
- 管理依赖闭包、安装、更新、卸载、发布、许可/来源和完整性诊断；
- 以本地已验证素材包作为离线运行 authority，通过云端 repository 复制不可变 revision；
- 作为 Entity Asset 的通用发布与分发 owner，但不拥有可变 Project Entity 事实。

素材库不得扫描或上传工作区、Media Library link target 或 `neko/entities.json`。工作区文件、
linked file 和 provider 已同步到本地目录的文件仍走原 `ContentLocator`；只有用户明确发布为
素材时，才复制进 package 或声明精确的素材依赖。

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

Explicit import/install/publish
                  |
                  v
AssetManifest: assetId + immutable revision + digest + dependencies
                  |
                  +----> verified local package (offline authority)
                  +----> Asset Library projection
                  +----> optional cloud repository replication
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

link 不可用时，媒体库显示 safe diagnostic 与 relink 操作。不得尝试同名目录、其他设置变量或最近 target 作为回退。

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

项目 Resource Browser 固定提供 `files`、`media`、`assets` 和 `entities` 四个 owner-preserving
facet。`assets` 结果始终保留精确 Asset identity，不因选择、预览或搜索而复制成 Project Entity；
`entities` 结果保留 Project Entity 或 candidate identity。facet 切换只是 Resource Browser 展示状态，
不得创建第二个 Workbench/Inspector tab strip。

全局资源中心由 Assets-owned `AssetCenterSession` 独立拥有 catalog、filter、selection 和 revision。
在统一 Desktop Workbench 中，Asset Management Root 始终位于 Main；选择可预览内容后，Assets
application service 通过 Host port 授权 exact `ContentLocator` 并创建短生命周期 PreviewSession，
Preview Root 只进入可选 Secondary Main。Desktop 不拥有 selection，不从扩展名推断 preview kind，
renderer 不接收 raw path。scene switch、renderer reload、Window teardown 或 selection replacement
必须释放旧 Preview handle，同时保留 Assets session facts。项目 Workspace 的右侧 Resources manager
继续使用自己的 workspace-scoped state，不得复用全局资源中心 session。

Asset Management 与 authorized Preview 使用两个独立、无单项 tab strip 的共享 Workbench panel shell，
并由共享 resize primitive 组合。Preview viewer 只能来自 canonical `@neko/preview-webview` presentation
和 viewer registry；Asset Center 与 Workspace Preview 都必须使用 content-only chrome，不在 Workbench
panel shell 内重复 descriptor header。Preview 内容背景保持透明并继承所在 shell 的主题；Desktop 和
Assets management 均不得实现第二套 viewer 或复制 Preview 主题。

普通删除按钮只执行“从素材库移除记录”：它更新用户级 SQLite 中的 mutable membership state，
不得移动源文件到系统废纸篓，也不得卸载 immutable revision、删除 blob 或修改项目引用。首次升级时可将
现有 flat managed files 原子登记为 membership；初始化完成后，文件扫描不得把已移除记录自动恢复。
真正的 uninstall 和无引用字节回收必须是独立、显式且可报告 blocker 的操作。

### 素材云同步（目标）

素材云同步复制的是 manifest-backed immutable package revision，不是文件夹双向同步：

- pull 先在 installed namespace 之外 staging，验证 manifest、digest、大小策略和精确依赖闭包，
  再 atomic commit；取消、中断或校验失败不得暴露部分素材；
- publish 先冻结本地 package，上传缺失的 content-addressed blob，再以 expected remote head
  compare-and-set 提交 manifest；并发变化必须报告 conflict，不能 last-write-wins；
- remote head、cursor、checkpoint 和 transfer projection 可放用户级 SQLite 并可重建；credential
  只放系统 keychain；已安装 manifest/bytes 才是离线 authority；
- manifest `remote/registry` 只保存 portable、non-secret provenance；运行时 account/repository
  binding 留在本机同步状态，source URI 不得充当隐式下载 resolver；
- remote tombstone 只影响远端发现，不自动卸载本地 revision，也不删除项目引用或 Project Entity；
- `workspace-media-library-sync` 的便携快照与云素材同步是两种独立流程，不能复用名称或隐式互相触发。

第一云端 provider、认证、包大小和 retention policy 尚未确定；在 OpenSpec 完成真实 provider 与
Electron 验收前，manifest 中现有 `remote/registry` source 只能视为契约预留，不能宣称已支持同步。

## Projection

文件树、搜索、最近使用、技术元数据和 availability 都是可重建 projection，以 locator 和 fingerprint 为键。文件事件是低延迟提示，有界 reconciliation 才保证完整性。

发现文件只更新 projection：

- 不创建 Creative Entity；
- 不创建 representation binding；
- 不分配 Asset ID；
- 不写 `library.json`；
- 不把同步 provider 或 link target 写入项目事实。

Search 只返回 canonical locator。绝对路径、变量路径、cache path 或陈旧 fingerprint 不构成可接受结果。

## 内容读取与表现

媒体库不实现第二套 reader 或 cache manager：

| 资源                    | 读取 owner                                               |
| ----------------------- | -------------------------------------------------------- |
| workspace / linked file | shared Host `ContentReadService`                         |
| document entry          | DocumentAccess owner adapter                             |
| generated output        | generated-output owner identity + digest                 |
| package resource        | package owner manifest/trust adapter                     |
| thumbnail/proxy/preview | `ContentRepresentationService`；cache 仅是 Host 内部实现 |

公共或持久契约不得包含绝对 source path、link target、cache path、materialization 状态、Renderer URL、runtime token 或 provider-private error。

## 显式操作

| 用户意图             | Operation                         | 所有权结果                                                         |
| -------------------- | --------------------------------- | ------------------------------------------------------------------ |
| 添加共享目录         | add directory library             | 创建全局 alias 与 workspace link，不复制库内容                     |
| 修复同步后缺失连接   | plan / confirm / apply recovery   | exact-name 验证后只创建或替换 workspace link                       |
| 重新定位已有库       | relink                            | 更新全局 alias 并替换 workspace link，不改 target 内容             |
| 移除库               | remove link                       | 只删除 link                                                        |
| 创建可独立移动的项目 | portable snapshot                 | 复制被引用字节到新项目并重写 staged 项目事实                       |
| 整理已有文件         | copy to selected writable library | 复制真实字节，保留 source identity                                 |
| 删除库内文件         | authorized delete                 | 明确修改 external target，需用户确认与 fingerprint precondition    |
| 保留生成结果         | retain generated                  | generated-output owner 负责 revision/digest/lineage                |
| 导入可复用素材包     | Asset import/install              | Asset Library 负责 manifest、revision、digest、dependency 与 trust |
| 关联创作身份         | bind/rebind                       | Creative Entity owner 只更新 binding fact                          |

link 存在不等于目标可写。复制与删除必须明确选择 library、目标路径、conflict policy 和用户意图。删除文件不会删除 Creative Entity；删除 binding 不会删除文件。

## 与 Project Entity 的关系

Project Entity 是 character、scene、object、location 和 style 在项目内唯一的可变语义身份
authority。`EntityRepresentationBinding` 直接保存 workspace、document-entry、generated-output
或精确 package-resource reference。

文件移动或 fingerprint 不匹配时，binding 变为 orphaned。Search 可以给出候选，但只有显式 rebind 可以修改 confirmed binding；不得通过旁路 catalog、fingerprint registry 或文件名猜测自动迁移。

Entity Asset 是特殊的 `identity` 素材包：它保存冻结的语义快照和 package-owned representation，
复用素材库 revision、dependency 和云分发。安装 Entity Asset 不自动创建或更新 Project Entity；
实例化后生成独立 Project Entity ID 并记录 origin revision，后续更新必须由 Entity owner 做
three-way diff 与显式 apply。完整目标由
[`manage-project-entities-as-publishable-assets`](../../openspec/changes/manage-project-entities-as-publishable-assets/)
跟踪。

Entity owner 已提供 instantiate、publish、diff 和 apply-update 的 typed intent/service contract，
Resource Browser 也能按 capability 投影这些操作；但在 manifest-backed package runtime、精确 revision
reader、publication lifecycle 和 remote provider 接入前，生产 Inspector 必须隐藏这些 capability 并
显示 owner-qualified blocker。当前 flat global Asset 文件不能作为兼容 provider，也不能让这些操作
返回成功。

## 存储归属

| 数据                                                         | Canonical owner / persistence | 不迁入 SQLite 的原因                                                        |
| ------------------------------------------------------------ | ----------------------------- | --------------------------------------------------------------------------- |
| 项目与全局 Media Library target mapping                      | OS symlink/junction           | SQLite target row 会成为第二 resolver 并产生机器相关陈旧路径                |
| `neko/project.json`                                          | Workspace identity owner      | 是可同步的稳定项目身份与最小元数据，不是通用设置容器                        |
| 项目 JSON/NKC/OTIO                                           | Owning project codec          | 是可审阅、可同步的权威项目事实                                              |
| JSONL journal 与日志                                         | Journal/logger owner          | append-only recovery 与 DB 故障诊断必须保持文件语义                         |
| Media 与 retained artifact bytes                             | File/artifact owner           | 大型字节和生命周期不属于关系 metadata                                       |
| Credential、mount secret                                     | SecretStorage/system keychain | 普通 SQLite 不具备对应安全与信任边界                                        |
| Requirement freshness、probe cache、snapshot task/checkpoint | 用户级 `~/.neko/neko.db`      | 可重建 projection 与最小跨重启状态；不得包含 target、绝对路径或 media bytes |
| 已安装 Asset manifest 与 package bytes                       | Asset Library managed storage | 用户可离线使用的素材内容，不是可删除重建的 metadata                         |
| Asset Library mutable membership / removed state             | 用户级 `~/.neko/neko.db`      | 有价值的用户选择；普通移除只更新记录，文件扫描不得重建                      |
| remote head、cursor、transfer checkpoint、Asset search rows  | 用户级 `~/.neko/neko.db`      | 可重建同步/查询状态；不得包含 credential 或充当 installed package authority |

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
- 只有显式 import/install/publish 才创建 Asset identity；文件 discovery 与 provider-synced directory 不创建素材。
- 已安装素材离线可用；云端失败、remote tombstone 或 projection 重建不删除本地 package 和项目事实。
- link target 不出现在项目事实、Agent payload、Webview state 或 safe diagnostic。
- projection 可删除重建，且不会创建 Entity facts。
- copy/delete 命中 shared Host Content I/O 和授权 writer；package resource 无 owner adapter 时 fail-visible。
- 路径测试证明只有 canonical locator handler 参与成功路径。
- open/metadata rebuild 不改 link、target 或项目事实；add/relink 不复制整库。
- recovery 只能经 plan/confirm/apply；package/export 只按权威 locator 经 ContentReadService
  解引用被请求字节。
