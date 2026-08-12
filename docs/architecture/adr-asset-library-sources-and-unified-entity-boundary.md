# ADR: 媒体库、素材库与统一实体边界

状态：Accepted 基线；Entity Asset 扩展已被后续设计取代

更新日期：2026-08-12

范围：Media Library、Creative Entity、Content I/O、Search、Agent、Canvas、Cut、Tools 与 Electron Desktop。

## 决策

当前 Accepted 基线保留两个彼此独立的模型：Media Library 是普通文件的直接入口；Project
Entity 是 character、scene、object、location 和 style 在项目内唯一的可变语义身份 authority。
Asset Library 作为第三个模型，只管理用户显式导入、安装或发布的普通版本化素材包。后续
[`simplify-resource-entity-character-world-boundaries`](../../openspec/changes/simplify-resource-entity-character-world-boundaries/)
取代了本 ADR 的 Entity Asset 扩展：Project Entity 保持最小项目语义锚点，Character 与 World
分别拥有便携性和发布语义。该收敛完成前不得把 Asset cloud 或 Entity Asset 描述为已交付能力。

| Owner                            | 拥有                                                                                            | 不拥有                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Media Library                    | linked roots、文件 projection、add/relink/remove、显式 copy/delete                              | semantic identity、cache、generated/package lifecycle                                   |
| Asset Library（目标）            | 显式 managed package、stable ID、revision/digest、dependency、install/publish/cloud replication | 任意文件 discovery、Media link target、Project Entity mutation、generic path resolution |
| Project Entity                   | identity、alias、status、binding、orphan/rebind                                                 | 文件字节、Character/World facts、usage、package lifecycle、generated output             |
| ContentReadService               | locator 授权 stat/read                                                                          | membership、cache path、UI projection                                                   |
| ContentRepresentationService     | thumbnail/proxy/preview 等派生表现                                                              | source identity、Entity fact                                                            |
| Document/generated/package owner | entry、revision/digest、manifest/trust、生命周期                                                | Media Library membership                                                                |
| Search                           | 可重建 locator/fingerprint projection                                                           | Entity 或 binding 写入                                                                  |

## 文件与 link

`neko/assets/<libraryName>` 的 symlink/junction 是项目内 library name 到 target 的映射。项目只保存
workspace-relative locator；绝对 target、credential、同步状态和本机 mount 信息留在 Desktop Host。
普通 workspace file 与 linked file 使用同一个 ContentRead path。

add/relink/remove 只管理 link。copy/delete 会修改外部 target，必须携带显式目标、授权、conflict
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

## Asset 云分发

云端仅复制显式 managed Asset revision。已安装且验证通过的本地 package 是离线 authority；remote
catalog/head/cursor/checkpoint 是可重建状态，credential 属于系统 keychain。下载必须 staging、验证
完整 dependency closure 后 atomic install；发布必须在 blob 完整后以 expected-head CAS 提交；remote
tombstone 不得自动卸载本地 revision 或修改项目事实。

Media Library 继续是普通文件唯一直接入口。Asset sync 不扫描 workspace、linked directory 或
`neko/entities.json`，也不把 provider-synchronized local directory 变成 Asset catalog。

Canvas 不建立自己的媒体库或素材副本 registry。未链接的全局 library 不能把绝对路径写入 `.nkc`；
用户必须先 link library、复制文件到明确目标，或使用已授权的项目 import。

## Projection 与 cache

Media Library tree、Search、recent-use、technical metadata、availability、OCR/ASR/vision evidence 都是
可重建 projection，以 canonical locator/fingerprint 为键。Discovery 不创建 Entity fact。
thumbnail、proxy、archive extraction 和其他 cache 是 Host/representation owner 的内部派生物。

## 验证

- 任意授权媒体文件无需额外 catalog membership 即可读取、预览和引用；
- 只有显式 import/install/publish 才创建素材身份；
- Asset 云同步不接管普通文件路径解析，且远端删除不破坏本地/项目数据；
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
- [`simplify-resource-entity-character-world-boundaries`](../../openspec/changes/simplify-resource-entity-character-world-boundaries/)
