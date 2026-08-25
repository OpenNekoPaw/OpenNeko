# 资源库架构：媒体库与素材库

更新日期：2026-08-14

> 当前稳定约束仍是：普通文件通过 **Media Library / 媒体库** 和 `ContentLocator`
> 直接访问，不需要 catalog membership。独立 **Asset Library / 素材库** 仅管理显式导入
> 或安装的本地版本化素材包，其完整实现由活跃 OpenSpec
> [`establish-manifest-backed-asset-library`](../../openspec/changes/establish-manifest-backed-asset-library/)
> 跟踪；项目本机绑定、同步与便携性的稳定边界见
> [`cache-file-access-and-paths.md`](cache-file-access-and-paths.md)；资源展示与 Entity/Character/World 的稳定边界见
> [`unified-entity-representation-bindings`](../../openspec/specs/unified-entity-representation-bindings/spec.md)
> 与 [`workspace-project-browser`](../../openspec/specs/workspace-project-browser/spec.md)。
> 远程分发、发布、账户与云同步不属于当前 Asset change；未来需要独立 OpenSpec。
> 项目媒体继续使用 Workspace authority 的 canonical `ContentLocator`、target-free `.neko/media-libraries` binding 与
> 用户全局 Media Library connection。`neko/assets/<libraryName>` 下的受管软链接（Windows 使用
> directory junction）是由该授权链派生的 Workspace 访问投影，供 Agent 等仅能访问工作区的消费者
> 使用；它不是媒体身份、项目 binding 或全局登记的替代品。

本文定义媒体库文件入口、素材包生命周期、项目受管链接、搜索投影、显式操作及其与
Project Entity、Content I/O、DocumentAccess、生成结果和 package owner 的边界。路径安全见
[`cache-file-access-and-paths.md`](cache-file-access-and-paths.md)，跨领域 owner 模型见
[`creative-resource-semantic-boundaries.md`](creative-resource-semantic-boundaries.md)。

Media Library 是可选的专业能力，不是创建或打开项目的前置条件。项目文件始终是文档和普通导入的默认
路径；只有用户明确需要保留大型外部目录、复用既有媒体档案或跨项目共享普通文件时，才注册并关联全局
Media Library。Character、World、Entity 等语义复用属于对应领域或 Asset package，不以普通媒体目录代替。

## Media Library 职责

媒体库只负责：

- 从权威项目 `ContentLocator` 引用派生必需库，并检查 target-free binding、全局 connection
  与同名受管 Workspace 链接是否一致；
- 按 canonical owner-qualified `ContentLocator` 浏览、搜索、打开和诊断文件；
- 维护可重建的文件树、recent-use、technical metadata 和 availability projection；
- 显式 bind、rebind、remove project-local binding，并维护其受管 Workspace 链接投影；
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
Project fact: Workspace authority ContentLocator(file.path)
                  |
                  v
Project local: .neko/media-libraries/<binding>       target-free authorization
                  |
                  v
Machine-global: ~/.neko/media-libraries/<connection> authorized connection
                  |
                  v
Workspace access: neko/assets/<libraryName>          managed symlink / junction
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

项目事实只保存逻辑 library name、relative descendant 与可选 fingerprint。项目 `.neko` binding 只保存
本机已确认的全局 connection identity，不保存物理 target；全局 connection owner 解析 target，并要求
同名受管 Workspace 链接精确指向该 target。普通项目文件和外部媒体都使用
`ContentLocator.file.authority = workspace`；文件内部内容使用可选 selector。只有 Agent handoff
才能使用受控 `neko/assets/...` Workspace 投影，不能把物理 target 写入项目事实。

## Link 与安全边界

- `libraryName` 必须是 portable single segment，`relativePath` 必须 normalized 且禁止 dot segment。
- 项目 codec 接受规范化 `media-library` locator，拒绝 `.neko`、`neko/assets`、absolute path、file URL、
  connection identity、cache/runtime path。
- Host 先校验 exact project binding 与 exact global connection，再校验 `neko/assets/` 直接受管链接精确
  指向该 connection target，并要求最终 realpath 位于 target 内；拒绝 nested-link escape、loop、
  unavailable target、mismatch 和 unmanaged symlink。
- 产品 sync/package 在遍历前跳过受管链接且不得 follow；Git exact local exclude 只是附加保护。
- `.neko` 丢失后初始化为空 binding；只有现存受管链接精确匹配一个已登记全局 connection 且项目事实
  需要同名库时，才允许重建 target-free binding。无法唯一匹配时要求用户显式关联。

binding、connection 或 link 不可用时，媒体库显示 safe diagnostic 与显式 relink 操作。不得尝试同名目录、
其他设置变量、active Workspace、cache 或最近 target 作为回退。

## 同步、恢复与便携快照

普通 Git 或产品文件夹同步只传输项目事实中的 portable `ContentLocator`，不传输 `.neko`
binding、软链接或 external Media Library 字节。项目打开时，Desktop 从 Canvas、Cut、Entity
representation 等 owning codec 的权威引用重建必需库；本机授权缺失只影响依赖该库的资源。

Project Browser 的 Resources 视图中，外部媒体来源区分：

- `available`、`required-unlinked`、`connection-missing`、`target-unavailable`；
- `content-incomplete`、`binding-invalid`、`entry-conflict`、`unreferenced-local-binding`。

恢复使用不可变 plan：只接受用户明确选择的已登记全局 connection；新目录必须先登记到全局 Media
Library。验证全部被引用 descendant，经确认后才创建或替换 binding 与同名链接投影。打开项目、刷新
projection 或重建 SQLite metadata 不得修改项目事实或 target。

需要把项目交给另一台机器且不依赖 relink 时，用户显式创建独立便携快照。Desktop 在 sibling
staging 中只收集权威引用的 linked bytes，校验 fingerprint，重写 staged owning documents，
完整验证后一次 atomic rename 发布。source workspace 与 external library 全程只读；它不是
普通同步、add/relink 或项目 Resources presentation 的隐式步骤。

全局资源中心与 Workspace Project Browser 是独立 surface：前者管理机器级连接和 owned Asset，后者
组合当前项目的 Resources 与 Project Content。两者不得共享 selection、filter、layout 或 active state；
便携快照进度属于项目生命周期 surface。

项目 Resource Browser 提供一个 Resources presentation，并且只按“项目文件、外部媒体、素材”三个
owner-preserving 来源筛选。普通“导入文件”固定复制到当前项目目录；外部媒体只提供“关联全局媒体库”
和“将目录添加到全局媒体库”两项明确操作，不让用户选择 binding、复制或链接策略。Project Character、World、
其他 Entity 与 candidates 进入同一 Project Browser 下的独立 Project Content 视图，不构成第四种资源。来源不是固定的平级业务对象：筛选
只改变 package-owned 展示状态，结果始终保留原 owner 与精确 identity，不因选择、预览、搜索或关联
Character 而复制或转换记录。Resource Browser 不建立第二个可变 catalog、Workbench 或 Inspector
tab strip。

全局资源中心由 Assets-owned `AssetCenterSession` 独立拥有 catalog、filter、selection 和 revision。
在统一 Desktop Workbench 中，Asset Management Root 始终位于 Main；选择可预览内容后，Assets
application service 通过 Host port 授权 exact `ContentLocator` 并创建短生命周期 PreviewSession，
Preview Root 只进入可选 Secondary Main。Desktop 不拥有 selection，不从扩展名推断 preview kind，
renderer 不接收 raw path。scene switch、renderer reload、Window teardown 或 selection replacement
必须释放旧 Preview handle，同时保留 Assets session facts。项目 Workspace 的右侧 Project Browser
继续使用自己的 workspace-scoped presentation state，不得复用全局资源中心 session。

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
| workspace file          | shared Host `ContentReadService` Workspace handler       |
| Media Library file      | binding + global connection + managed-link handler       |
| document entry          | DocumentAccess owner adapter                             |
| generated output        | generated-output owner identity + digest                 |
| package resource        | package owner manifest/trust adapter                     |
| thumbnail/proxy/preview | `ContentRepresentationService`；cache 仅是 Host 内部实现 |

公共或持久契约不得包含绝对 source path、link target、cache path、materialization 状态、Renderer URL、runtime token 或 provider-private error。

## 显式操作

| 用户意图             | Operation                         | 所有权结果                                                         |
| -------------------- | --------------------------------- | ------------------------------------------------------------------ |
| 导入普通文件         | import project files              | 复制到项目文件；源路径不持久化，项目副本参与普通同步与打包         |
| 关联全局媒体库       | link global library               | 创建 target-free 项目 binding 与受管链接投影                       |
| 添加目录为媒体库     | add directory library             | 先登记全局 connection，再创建项目 binding 与受管链接               |
| 修复同步后缺失连接   | plan / confirm / apply recovery   | 验证后创建或替换 binding 与对应链接投影                            |
| 重新定位已有库       | relink                            | 更新明确授权关系并重建链接投影，不改项目事实或 target 内容         |
| 移除项目授权         | remove binding                    | 删除项目 binding 与链接投影，不删除全局 connection、target 或引用  |
| 创建可独立移动的项目 | portable snapshot                 | 复制被引用字节到新项目并重写 staged 项目事实                       |
| 整理已有文件         | copy to selected writable library | 复制真实字节，保留 source identity                                 |
| 删除库内文件         | authorized delete                 | 明确修改 external target，需用户确认与 fingerprint precondition    |
| 保留生成结果         | retain generated                  | Generation owner 负责 output identity/revision/digest/lineage      |
| 导入可复用素材包     | Asset import/install              | Asset Library 负责 manifest、revision、digest、dependency 与 trust |
| 关联创作身份         | bind/rebind                       | Creative Entity owner 只更新 binding fact                          |

link 存在不等于目标可写。复制与删除必须明确选择 library、目标路径、conflict policy 和用户意图。删除文件不会删除 Creative Entity；删除 binding 不会删除文件。

## 与 Project Entity 的关系

Project Entity 是 character、scene、object、location 和 style 在项目内唯一的可变语义身份
authority。`EntityRepresentationBinding` 保存 canonical `ContentLocator`；文件内部内容使用 selector，
Generation output identity/provenance 与 package owner identity 由各自领域记录旁置。项目媒体链接通过其
授权后的 Workspace 文件地址引用；不得把物理 target、cache path 或 runtime projection 写回 binding。

文件移动或 fingerprint 不匹配时，binding 变为 orphaned。Search 可以给出候选，但只有显式 rebind 可以修改 confirmed binding；不得通过旁路 catalog、fingerprint registry 或文件名猜测自动迁移。

Asset package 只打包普通可复用资源。Project Entity 保持项目本地语义事实；Character portability 使用
Chara-owned `.neko-character`；World portability/publication 由 World 在依赖闭包完整时定义。Entity Asset
publish、instantiate、provenance 和 three-way update 已退出当前 canonical 产品路径。已存在的相关 bytes
必须保留并显示 unsupported diagnostic，不得经普通 Asset import 推断或迁移为其他领域记录。

## 存储归属

| 数据                                                         | Canonical owner / persistence | 不迁入 SQLite 的原因                                                        |
| ------------------------------------------------------------ | ----------------------------- | --------------------------------------------------------------------------- |
| 项目 Media Library binding                                   | 项目 `.neko` 的 Assets owner  | target-free、可删除重建的本机授权；不得同步或打包                           |
| 项目 Media Library managed link                              | `neko/assets/<libraryName>`   | binding 派生的访问投影；产品 sync/package 必须跳过且不得 follow             |
| 全局 Media Library physical connection                       | `~/.neko/media-libraries`     | 用户全局授权与 target owner；target 不进入项目、Renderer 或 Agent           |
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
- 第三方工具可能复制或跟随软链接；产品自有 sync/package 必须按入口强制跳过且不得 follow。产品只能承诺
  同步 portable Media Library references，不能承诺同步 external bytes。
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
- open/metadata rebuild 不改 binding、target 或项目事实；bind/rebind 不复制整库。受管链接仅在明确关联
  或可证明的本地初始化中按 binding 重建。
- recovery 只能经 plan/confirm/apply；package/export 只按权威 locator 经 ContentReadService
  解引用被请求字节。
