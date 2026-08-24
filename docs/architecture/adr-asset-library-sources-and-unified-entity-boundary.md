# ADR: 媒体库、素材库与统一实体边界

状态：Accepted 基线；Entity Asset 扩展已被后续设计取代

更新日期：2026-08-13

范围：Media Library、Creative Entity、Content I/O、Search、Agent、Canvas、Cut、Tools 与 Electron Desktop。

## 决策

当前 Accepted 基线保留两个彼此独立的模型：Media Library 是普通文件的直接入口；Project
Entity 是 character、scene、object、location 和 style 在项目内唯一的可变语义身份 authority。
Asset Library 作为第三个模型，只管理用户显式导入或安装的本地普通版本化素材包。后续
[`unified-entity-representation-bindings`](../../openspec/specs/unified-entity-representation-bindings/spec.md)
取代了本 ADR 的 Entity Asset 扩展：Project Entity 保持最小项目语义锚点，Character 与 World
分别拥有便携性和发布语义。项目 Media Library locator、本机 binding、全局 connection、受管链接投影与同步/打包边界由
[`restore-workspace-linked-media-access`](../../openspec/changes/restore-workspace-linked-media-access/)
恢复为分层的唯一解析链。远程 Asset 分发不属于当前 change，未来需要独立 OpenSpec。

用户展示分为两个边界：Resources 只提供 Files、Media、Assets 三个 owner-preserving source；项目语义和
创作对象进入 Project-owned Project Content，按角色、世界、其他元素、待确认四组展示。Entity 不作为
Resources source 或普通用户的顶层管理对象。关联 Character 的 Entity 只随角色条目携带精确关联 identity，
不在其他元素中重复出现；scene/location Entity 不会被推断为 World。

| Owner                            | 拥有                                                                                | 不拥有                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Media Library                    | logical locator、target-free 项目 binding、受管 link projection、显式 copy/delete   | Entity identity、generated/package lifecycle                                                      |
| Asset Library（目标）            | 显式本地 managed package、stable ID、revision/digest、dependency、install/uninstall | 任意文件 discovery、远程分发、Media link target、Project Entity mutation、generic path resolution |
| Project Entity                   | identity、alias、status、binding、orphan/rebind                                     | 文件字节、Character/World facts、usage、package lifecycle、generated output                       |
| ContentReadService               | locator 授权 stat/read                                                              | membership、cache path、UI projection                                                             |
| ContentRepresentationService     | thumbnail/proxy/preview 等派生表现                                                  | source identity、Entity fact                                                                      |
| Document/generated/package owner | entry、revision/digest、manifest/trust、生命周期                                    | Media Library membership                                                                          |
| Search                           | 可重建 locator/fingerprint projection                                               | Entity 或 binding 写入                                                                            |

## 文件与 binding

项目保存 `MediaLibraryContentLocator(libraryName, relativePath)`；Assets 在项目 `.neko/media-libraries`
保存 target-free binding，并通过用户全局 Media Library connection 解析授权 target。Assets 同时在
`neko/assets/<libraryName>` 维护直接受管软链接（Windows junction），作为 Workspace/Agent 访问投影。
绝对 target、credential、同步状态和本机 mount 信息不得进入项目事实、Renderer 或 diagnostic。
Content handler 必须校验 binding、connection 与 link 三者精确一致后才能读取；不得绕过 link 直读 target。

bind/rebind/remove 管理可删除的项目 binding 与链接投影。copy/delete 会修改外部 target，必须携带显式目标、授权、conflict
policy 与 fingerprint precondition。工作区外普通文件先原子导入 `neko/imports/<kind>/`，再由领域
owner 创建引用。

## Entity representation

`EntityRepresentationBinding` 直接引用 closed `ContentLocator` union：workspace file、document entry、
generated output 或 package resource。Binding 不包含 catalog ID、cache path、runtime URL 或 link target。
文件移动或 fingerprint 不匹配时变为 orphaned；Search 可以建议候选，只有显式 rebind 能修改事实。

本 ADR 曾提议 Entity Asset immutable snapshot、instantiate 与 three-way update；该扩展现已撤回。
普通 representation 使用 Asset package，Character 使用 Chara-owned package，World publication 由
World owner 定义。Project Entity 不再进入通用 package lifecycle。已存在的实验 contract 和用户 bytes
按新 change 做可达性审计与 unsupported diagnostic，不作为兼容成功路径。

## Asset 本地边界

已安装且验证通过的本地 package 是唯一 authority。导入或安装必须在 installed namespace 外 staging，
验证完整 dependency closure 后 atomic commit；失败不得暴露部分 revision。普通移除只删除 membership，
uninstall 和 GC 是独立显式操作，并必须尊重 dependency/project pin。

Media Library 继续是普通文件唯一直接入口。Asset Library 不扫描 workspace、linked directory 或
`neko/entities.json`；provider-synchronized local directory 也只是普通 Media Library 文件。当前 contract
和 runtime 不包含 remote repository、publish、sync、account、credential、remote head、CAS、tombstone
或 checkpoint。未来远程分发只能经独立 OpenSpec 引入。

Canvas 不建立自己的媒体库或素材副本 registry。未绑定的全局 library 不能把绝对路径写入 `.nkc`；
用户必须先确认项目 binding（系统维护对应受管链接投影）、复制文件到明确项目目标，或使用已授权的项目 import。

## Projection 与 cache

Media Library tree、Search、recent-use、technical metadata、availability、OCR/ASR/vision evidence 都是
可重建 projection，以 canonical locator/fingerprint 为键。Discovery 不创建 Entity fact。
thumbnail、proxy、archive extraction 和其他 cache 是 Host/representation owner 的内部派生物。

## 验证

- 任意授权媒体文件无需额外 catalog membership 即可读取、预览和引用；
- 只有显式 local import/install 才创建素材身份；
- Asset runtime 不接管普通文件路径解析，也不依赖远程 provider；
- link target 不进入项目事实、Agent payload、Renderer state 或 safe diagnostic；
- projection 删除重建不创建 Entity facts；
- copy/delete 命中 Desktop Content I/O 与授权 writer；
- rebind 需要显式 target 和 fingerprint/revision；
- Windows junction、UNC/NAS、大型 snapshot、取消和 staging cleanup 使用目标平台 fixture。

相关边界见 [`asset-library.md`](asset-library.md)、[`unified-entity.md`](unified-entity.md)、
[`creative-resource-semantic-boundaries.md`](creative-resource-semantic-boundaries.md)、
[`cache-file-access-and-paths.md`](cache-file-access-and-paths.md) 和
[`application-composition.md`](application-composition.md)。

实施入口：

- [`establish-manifest-backed-asset-library`](../../openspec/changes/establish-manifest-backed-asset-library/)
- [`unified-entity-representation-bindings`](../../openspec/specs/unified-entity-representation-bindings/spec.md)
- [`separate-project-facts-local-state-and-media-bindings`](../../openspec/changes/separate-project-facts-local-state-and-media-bindings/)
- [`restore-workspace-linked-media-access`](../../openspec/changes/restore-workspace-linked-media-access/)
