# 资源库架构：媒体库与全局资源中心

本文定义当前 Media Library、全局 Asset 文件记录、项目受管链接和资源浏览/预览边界。路径安全见
[`content-access-and-paths.md`](content-access-and-paths.md)，跨领域 owner 模型见
[`creative-resource-semantic-boundaries.md`](creative-resource-semantic-boundaries.md)。

普通项目文件通过 Workspace authority 的 canonical `ContentLocator` 访问，不需要 catalog membership。
Media Library 用于授权和复用外部目录；全局 Asset 区用于保存用户显式导入的文件及其可管理记录。两者都不
创建 Project Entity、Character 或 World 身份。

## Media Library 职责

Media Library 是可选专业能力，不是创建或打开项目的前置条件。它负责：

- 管理机器级外部目录 connection，以及项目级 target-free binding；
- 从项目权威 `ContentLocator` 引用派生所需 library，并检查 binding、connection 与受管 Workspace 链接；
- 按 owner-qualified `ContentLocator` 浏览、搜索、打开和诊断文件；
- 维护可重建的文件树、recent-use、technical metadata 和 availability projection；
- 显式 bind、rebind、remove 项目授权，并维护 `neko/assets/<libraryName>` 受管链接投影；
- 经授权 Content I/O 在用户选择的可写目标中复制或删除文件。

Media Library 不拥有语义身份、生成结果、文档 entry、外部同步 provider、cache、Renderer URL 或运行时
token，也不得把物理 target、connection identity 或 `.neko` path 写入项目事实。

## 全局 Asset 文件记录

全局 Asset 区只接收用户显式导入的文件。导入会将文件复制到产品管理的全局目录，并建立稳定 membership
记录；文件发现本身不创建记录。记录保存展示名、受管目录内的相对 source、媒体类型、大小、时间和状态，
不承担素材包 manifest、依赖解析、版本选择、安装或发布语义。

普通“移除”只将 exact membership 标为 removed，不删除底层字节，也不修改项目引用。重新显式导入同一
受管文件可恢复该 membership。移动操作必须同时原子更新受管文件位置与 membership；失败时不得留下只
移动文件或只修改记录的部分成功状态。

项目需要使用全局 Asset 文件时，由 Assets owner 校验 active membership 和受管根目录，再显式复制到
Workspace。项目事实随后只引用 Workspace 内的 canonical locator，不持久化全局目录路径或 membership
作为内容身份。

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

Explicit Asset file import
                  |
                  +----> managed global file bytes
                  +----> SQLite membership record
                  +----> Asset Center projection
```

项目事实只保存逻辑 library name、relative descendant 与可选 fingerprint。项目 binding 只保存本机已确认的
connection identity；全局 connection owner 解析 target，并要求同名受管 Workspace 链接精确指向该
target。普通项目文件和外部媒体都使用 `ContentLocator.file.authority = workspace`；文件内部内容使用可选
selector。

## Link 与安全边界

- `libraryName` 必须是 portable single segment，`relativePath` 必须 normalized 且禁止 dot segment。
- 项目 codec 拒绝 `.neko`、`neko/assets`、absolute path、file URL、connection identity、cache/runtime path。
- Host 校验 exact project binding、global connection 和受管链接，再要求最终 realpath 位于 target 内；
  nested-link escape、loop、unavailable target、mismatch 和 unmanaged symlink 必须失败。
- 产品 sync/package 在遍历前跳过受管链接且不得 follow；Git local exclude 只是附加保护。
- binding、connection 或 link 不可用时只显示 safe diagnostic 与显式 relink，不尝试同名目录、active
  Workspace、cache 或最近 target。

`.neko` binding 是非 authoritative 的本机授权物化，丢失时默认初始化为空。只有当前项目事实需要同名库，
且现存受管链接精确匹配唯一已登记 connection 时，才可从这些当前 authority 确定性重新物化 target-free
binding；受管链接只作为 exact-match 准入证据，不成为 target 或项目事实 authority。无法唯一匹配时必须
保持未关联并由用户显式处理。

## 同步、恢复与便携快照

普通 Git 或产品文件夹同步只传输项目事实中的 portable locator，不传输本机 binding、受管链接或 external
Media Library 字节。项目打开时，Desktop 从 Canvas、Cut、Entity representation 等 owning codec 的权威
引用重建所需库；本机授权缺失只影响依赖该库的资源。

恢复使用不可变 plan，只接受用户明确选择的已登记 connection。验证全部被引用 descendant，经确认后才
创建或替换 binding 与受管链接。打开项目、刷新 projection 或重建 SQLite metadata 不得修改项目事实或
target。

用户显式创建便携快照时，Desktop 在 sibling staging 中收集权威引用的字节，校验 fingerprint，重写 staged
owning documents，完整验证后一次 atomic rename 发布。source Workspace 与 external library 全程只读。

## 产品 Surface 与生命周期

全局资源中心与 Workspace Project Browser 是独立 surface：前者管理机器级 Media Library connection 和
全局 Asset 文件记录，后者组合当前项目的文件、外部媒体和已物化 Asset。两者不得共享 selection、filter、
layout 或 active state。

全局资源中心由 Assets-owned `AssetCenterSession` 拥有 catalog、filter、selection 和 presentation snapshot。
选择可预览内容后，Assets application service 通过 Host port 授权 exact `ContentLocator`，创建短生命周期
PreviewSession。Desktop 不从扩展名推断 viewer，不保存 selection authority，Renderer 不接收 raw path。
scene switch、renderer reload、Window teardown 或 selection replacement 必须释放被替换的 Preview handle。

Asset Center 与 Workspace Preview 共用 canonical `@neko/preview-webview` viewer registry 和 content-only
chrome；Desktop 与 Assets management 不实现第二套 viewer 或复制 Preview 主题。

## Projection 与内容读取

文件树、搜索、最近使用、技术元数据和 availability 都是可重建 projection，以 owner identity、locator 和
fingerprint 为键。文件事件只是低延迟提示，有界 reconciliation 才保证完整性。发现文件不得创建 Entity、
representation binding 或全局 Asset membership。

| 资源                    | 读取 owner                                                                  |
| ----------------------- | --------------------------------------------------------------------------- |
| Workspace file          | shared Host `ContentReadService` Workspace handler                          |
| Media Library file      | binding + global connection + managed-link handler                          |
| document entry          | DocumentAccess owner adapter                                                |
| generated output        | generated-output owner identity + digest                                    |
| 全局 Asset 文件         | Assets membership + managed-root resolver；进入项目后使用 Workspace locator |
| thumbnail/proxy/preview | `ContentRepresentationService`；cache 仅是 Host 内部实现                    |

公共或持久契约不得包含绝对 source path、link target、cache path、materialization 状态、Renderer URL、
runtime token 或 provider-private error。

## 显式操作

| 用户意图              | Operation                       | 所有权结果                                            |
| --------------------- | ------------------------------- | ----------------------------------------------------- |
| 导入普通项目文件      | import project files            | 复制到项目目录，项目副本进入普通同步与打包            |
| 关联全局媒体库        | link global library             | 创建 target-free 项目 binding 与受管链接投影          |
| 添加目录为媒体库      | add directory library           | 先登记全局 connection，再创建项目 binding 与受管链接  |
| 修复缺失连接          | plan / confirm / apply recovery | 验证后创建或替换 binding 与受管链接                   |
| 移除项目授权          | remove binding                  | 删除 binding 与链接，不删除 connection、target 或引用 |
| 创建便携项目          | portable snapshot               | 收集被引用字节并重写 staged 项目事实                  |
| 导入全局 Asset 文件   | import global asset             | 复制到受管全局目录并创建 membership                   |
| 移除全局 Asset 记录   | remove membership               | 保留字节，仅更新 exact membership 状态                |
| 将全局 Asset 用于项目 | materialize to Workspace        | 校验 membership 后复制，项目使用 Workspace locator    |
| 关联创作身份          | bind/rebind                     | Project Entity owner 只更新 binding fact              |

link 存在不表示目标可写。外部复制与删除必须明确选择 library、目标路径、conflict policy 和用户意图。
删除资源不会删除 Project Entity；删除 binding 不会删除文件。

## 与 Project Entity 的关系

Project Entity 是 character、scene、object、location 和 style 在项目内唯一的可变语义身份 authority。
`EntityRepresentationBinding` 保存 owner-qualified durable locator。文件移动或 fingerprint 不匹配时，
binding 变为 orphaned；Search 可以提供候选，但只有显式 rebind 可以修改 confirmed binding。

Media Library 和全局 Asset 文件记录都不推断、创建或改写 Entity、Character、World 或其版本事实。

## 存储归属

| 数据                                | Canonical owner / persistence                          |
| ----------------------------------- | ------------------------------------------------------ |
| 项目 Media Library binding          | 项目 `.neko` 的 Assets-owned 非 authoritative 本机物化 |
| 受管 Workspace link                 | `neko/assets/<libraryName>`，由 binding 派生           |
| 全局 Media Library connection       | `~/.neko/media-libraries`                              |
| 项目 JSON/NKC/OTIO                  | owning project codec                                   |
| Media 与 retained artifact bytes    | file/artifact owner                                    |
| Credential、mount secret            | SecretStorage/system keychain                          |
| requirement/probe/search projection | 用户级 `~/.neko/neko.db`                               |
| 全局 Asset 文件 bytes               | Assets-managed global root                             |
| 全局 Asset membership               | 用户级 `~/.neko/neko.db`                               |

## 失败与验证不变量

- 任何普通项目或 Media Library 文件无需 Asset membership 即可读取、预览和引用。
- 全局 Asset membership 只由显式导入创建；文件发现不创建记录。
- `.neko` path、connection identity 和 physical target 不进入项目事实、Agent payload、Webview state 或
  sync/package output。
- projection 可删除重建，且不会创建 Entity facts 或恢复用户已移除的 membership。
- 一个无效 connection、membership 或 preview 只影响 exact 记录/请求，sibling 资源仍可用。
- copy/delete 命中 shared Host Content I/O 与授权 writer；owner adapter 缺失时 fail-visible。
- open/metadata rebuild 不改 binding、target、membership 或项目事实。
- recovery 只能经 plan/confirm/apply；便携快照只按权威 locator 解引用被请求字节。
