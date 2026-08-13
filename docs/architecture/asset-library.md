# 资源库架构：媒体库与素材库

更新日期：2026-08-13

> 当前稳定约束仍是：普通文件通过 **Media Library / 媒体库** 和 `ContentLocator`
> 直接访问，不需要 catalog membership。独立 **Asset Library / 素材库** 仅管理显式导入
> 或安装的本地版本化素材包，其完整实现由活跃 OpenSpec
> [`establish-manifest-backed-asset-library`](../../openspec/changes/establish-manifest-backed-asset-library/)
> 跟踪；项目本机绑定、同步与便携性的新边界由
> [`separate-project-facts-local-state-and-media-bindings`](../../openspec/changes/separate-project-facts-local-state-and-media-bindings/)
> 负责原子切换；资源展示与 Entity/Character/World 的边界由
> [`simplify-resource-entity-character-world-boundaries`](../../openspec/changes/simplify-resource-entity-character-world-boundaries/)
> 收敛。远程分发、发布、账户与云同步不属于当前 Asset change；未来需要独立 OpenSpec。
> `MediaLibraryContentLocator` 与项目 `.neko` target-free binding 已是唯一产品路径。
> `neko/assets` 旧 link 只允许由用户显式运行产品不可达的离线转换工具处理，启动与普通 reader
> 不读取或重建该路径。

本文定义媒体库文件入口、素材包生命周期、项目本机 binding、搜索投影、显式操作及其与
Project Entity、Content I/O、DocumentAccess、生成结果和 package owner 的边界。跨领域决策见
[`adr-asset-library-sources-and-unified-entity-boundary.md`](adr-asset-library-sources-and-unified-entity-boundary.md)，
路径安全见 [`cache-file-access-and-paths.md`](cache-file-access-and-paths.md)，跨领域 owner 模型见
[`creative-resource-semantic-boundaries.md`](creative-resource-semantic-boundaries.md)。

## Media Library 职责

媒体库只负责：

- 从权威项目 `MediaLibraryContentLocator` 引用派生必需库，并通过项目 `.neko` 本机 binding
  解析用户已授权的全局连接；
- 按 canonical owner-qualified `ContentLocator` 浏览、搜索、打开和诊断文件；
- 维护可重建的文件树、recent-use、technical metadata 和 availability projection；
- 显式 bind、rebind、remove project-local binding；
- 在用户选择可写目标后，通过授权 Content I/O 复制或删除文件。

媒体库不负责：

- 角色、场景、物品、地点或风格身份；
- 生成结果、文档 entry、package 或外部同步 provider 的生命周期；
- cache、thumbnail/proxy materialization、Renderer URL 或 runtime token；
- 将物理 target、全局 connection identity 或 `.neko` path 写入项目事实，以及自动文件 relocation。

## Asset Library 目标职责

素材库不是普通文件入口，也不是退休 `AssetEntity/library.json` catalog 的改名版本。它只负责：

- 通过显式 local import 或 install 接受可复用素材；文件发现不产生素材身份；
- 以稳定 `assetId`、不可变 revision、digest、typed manifest 和 package-relative member
  管理素材包；
- 管理依赖闭包、安装、本地更新、卸载、许可/来源和完整性诊断；
- 以本地已验证素材包作为唯一运行 authority，不读取远程 repository 或账户状态；
- 为普通可复用 representation 提供 package owner；不打包或发布 Project Entity、Character 或 World 事实。

素材库不得扫描或上传工作区、Media Library target 或 `neko/entities.json`。工作区文件、
Media Library file 和 provider 已同步到本地目录的文件仍走原 owner-qualified `ContentLocator`；只有用户明确导入为
素材时，才复制进 package 或声明精确的素材依赖。

## Canonical 模型

```text
Project fact: MediaLibraryContentLocator(libraryName, relativePath)
                  |
                  v
Project local: .neko/media-libraries/<binding>       target-free binding record
                  |
                  v
Machine-global: ~/.neko/media-libraries/<connection> authorized connection
                  |
                  v
Physical local/NAS/synchronized directory

Explicit local import/install
                  |
                  v
AssetManifest: assetId + immutable revision + digest + dependencies
                  |
                  +----> verified local package (authority)
                  +----> Asset Library projection
```

项目事实只保存逻辑 library name、relative descendant 与可选 fingerprint。项目 `.neko` binding
只保存本机已确认的全局 connection identity，不保存物理 target；全局 connection owner 才能在
Desktop Main/Node trust boundary 内解析 target。普通 workspace file 使用 `workspace-file`，外部媒体
使用 `media-library` locator，二者不得通过 path prefix 或 fallback 互相解释。

## Link 与安全边界

- `libraryName` 必须是 portable single segment，`relativePath` 必须 normalized 且禁止 dot segment。
- 项目 codec 拒绝 `.neko`、`neko/assets`、absolute path、file URL、connection identity、cache/runtime path。
- Host guard 通过 exact project binding 与 exact global connection 解析，并校验最终 realpath containment；
  拒绝 nested-link escape、loop、unavailable target 和 unmanaged symlink。
- 产品 sync/package 在遍历前排除根 `.neko`，Git ignore 只是附加保护，不是正确性 authority。
- 项目 `.neko` 删除后初始化为空 binding；不得读取最近 target、同名目录或旧 link 作为恢复路径。

binding 或 connection 不可用时，媒体库显示 safe diagnostic 与显式 rebind 操作。不得尝试同名目录、
其他设置变量、active Workspace、cache 或最近 target 作为回退。

## 同步、恢复与便携快照

普通 Git 或产品文件夹同步只传输项目事实中的 portable `ContentLocator`，不传输项目 `.neko` binding、
external Media Library 字节。项目打开时，Desktop 从 Canvas、Cut、Entity representation
等 owning codec 的权威引用重建必需库，不读取 `library.json`、旧 link、缓存
membership。

项目 Resources 中的媒体来源区分：

- `available`、`required-unlinked`、`global-connection-missing`；
- `target-unavailable`、`content-incomplete`、`binding-invalid`；
- `unreferenced-local-binding`。

恢复使用不可变 plan：只接受 exact-name 全局连接或用户明确选择的目录，验证全部被引用 descendant，
经确认后才创建或替换项目本机 binding。打开项目、刷新 projection 或重建 SQLite metadata 都不得修改
binding、项目事实或 target。

需要把项目交给另一台机器且不依赖 relink 时，用户显式创建独立便携快照。Desktop 在 sibling
staging 中只收集权威引用的 linked bytes，校验 fingerprint，重写 staged owning documents，
完整验证后一次 atomic rename 发布。source workspace 与 external library 全程只读；它不是
普通同步、add/relink 或项目 Resources presentation 的隐式步骤。

全局资源中心与项目资源管理器是独立 surface：前者管理机器级连接和 owned Asset，后者只浏览
当前项目、投影缺失需求并提交恢复 intent。两者不得共享 selection、filter、layout 或 active
state；便携快照进度属于项目生命周期 surface。

项目 Resource Browser 提供一个 Resources presentation，并且只按 Files、Media、Assets 三个
owner-preserving 来源筛选。Project Character、World、其他 Entity 与 candidates 进入独立 Project Content，
不构成第四种资源。来源不是固定的平级业务对象：筛选
只改变 package-owned 展示状态，结果始终保留原 owner 与精确 identity，不因选择、预览、搜索或关联
Character 而复制或转换记录。Resource Browser 不建立第二个可变 catalog、Workbench 或 Inspector
tab strip。

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

### 远程分发边界

当前 Asset Library 只处理本地素材包。canonical contract、runtime、Resources intent 和 Desktop IPC
不得为远程 repository、publish、sync、account、credential、remote head、CAS、tombstone、cursor 或
transfer checkpoint 预留平行路径。现有实验性 `remote` / `registry` shape 不构成可调用 resolver，必须
在本地 manifest 收敛时退出 canonical contract。未来若出现真实分发需求，必须由独立 OpenSpec 定义
provider、authority、用户数据保护、失败语义和真实 Electron 验收。

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
| 添加共享目录         | add directory library             | 创建用户全局 connection；项目授权仍需显式 binding                  |
| 修复同步后缺失连接   | plan / confirm / apply recovery   | exact-name 验证后只创建或替换项目本机 binding                      |
| 重新定位已有库       | relink                            | 更新用户全局 connection，不改项目事实或 target 内容                |
| 移除项目授权         | remove binding                    | 只删除项目 `.neko` 中该 library 的 binding                         |
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

Asset package 只打包普通可复用资源。Project Entity 保持项目本地语义事实；Character portability 使用
Chara-owned `.neko-character`；World portability/publication 由 World 在依赖闭包完整时定义。Entity Asset
publish、instantiate、provenance 和 three-way update 已退出当前 canonical 产品路径。已存在的相关 bytes
必须保留并显示 unsupported diagnostic，不得经普通 Asset import 推断或迁移为其他领域记录。

## 存储归属

| 数据                                                         | Canonical owner / persistence | 不迁入 SQLite 的原因                                                        |
| ------------------------------------------------------------ | ----------------------------- | --------------------------------------------------------------------------- |
| 项目 Media Library binding                                   | 项目 `.neko` 的 Assets owner  | 可删除重建的本机授权；不得进入同步、package 或用户级 SQLite                 |
| 全局 Media Library physical connection                       | `~/.neko/media-libraries`     | 机器/用户级授权；target 不进入项目、Renderer 或 diagnostic                  |
| `neko/project.json`                                          | Workspace identity owner      | 是可同步的稳定项目身份与最小元数据，不是通用设置容器                        |
| 项目 JSON/NKC/OTIO                                           | Owning project codec          | 是可审阅、可同步的权威项目事实                                              |
| JSONL journal 与日志                                         | Journal/logger owner          | append-only recovery 与 DB 故障诊断必须保持文件语义                         |
| Media 与 retained artifact bytes                             | File/artifact owner           | 大型字节和生命周期不属于关系 metadata                                       |
| Credential、mount secret                                     | SecretStorage/system keychain | 普通 SQLite 不具备对应安全与信任边界                                        |
| Requirement freshness、probe cache、snapshot task/checkpoint | 用户级 `~/.neko/neko.db`      | 可重建 projection 与最小跨重启状态；不得包含 target、绝对路径或 media bytes |
| 已安装 Asset manifest 与 package bytes                       | Asset Library managed storage | 用户可离线使用的素材内容，不是可删除重建的 metadata                         |
| Asset Library mutable membership / removed state             | 用户级 `~/.neko/neko.db`      | 有价值的用户选择；普通移除只更新记录，文件扫描不得重建                      |
| Asset manifest/search projection                             | 用户级 `~/.neko/neko.db`      | 可重建本地查询状态；不得充当 installed package authority                    |

## 已知限制与发布风险

- 权威 reference reader 未覆盖的项目 document kind 必须返回 `coverage-incomplete`，不能声明
  linked-ready 或 portable-snapshot-ready。
- 第三方裸目录同步可能复制 `.neko`；产品自有同步与 package 必须强制排除，且 `.neko` binding 不得
  含物理 target 或 credential。产品只能承诺同步 portable references，不能承诺同步 external bytes。
- macOS 与 Windows 的本地目录、可移动磁盘和真实 UNC/NAS target 必须分别验收。缺少对应平台证据时，
  该平台网络媒体库属于 release blocker。
- 大型便携快照需要在写入前验证 destination conflict 与可用空间；中途取消或 fingerprint
  变化只能清理 staging，不能产生部分成功 destination。

## 验证不变量

- 任何媒体文件无需 catalog membership 即可读取、预览和引用。
- 只有显式 local import/install 才创建 Asset identity；文件 discovery 与 provider-synced directory 不创建素材。
- Asset package 不创建、复制或发布 Project Entity、CharacterProject 或 WorldProject identity。
- 已安装素材不依赖网络；projection 重建不删除本地 package 和项目事实。
- `.neko` path、connection identity 和 physical target 不出现在项目事实、Agent payload、Webview state、
  sync/package output 或 safe diagnostic。
- projection 可删除重建，且不会创建 Entity facts。
- copy/delete 命中 shared Host Content I/O 和授权 writer；package resource 无 owner adapter 时 fail-visible。
- 路径测试证明只有 canonical locator handler 参与成功路径。
- open/metadata rebuild 不改 binding、target 或项目事实；bind/rebind 不复制整库。
- recovery 只能经 plan/confirm/apply；package/export 只按权威 locator 经 ContentReadService
  解引用被请求字节。
