# ADR: 媒体库与统一实体边界

状态：Accepted

更新日期：2026-08-01

范围：Media Library、Creative Entity、Content I/O、Search、Agent、Canvas、Cut、Tools 与 Electron Desktop。

## 决策

OpenNeko 只保留两个产品模型：Media Library 是用户可见文件资源入口；Creative Entity 是 character、
scene、object、location 和 style 的语义身份 authority。Content I/O、document、generated output、
package 与 derived representation 保持各自 owner，不形成第三种 library/catalog。

| Owner | 拥有 | 不拥有 |
| --- | --- | --- |
| Media Library | linked roots、文件 projection、add/relink/remove、显式 copy/delete | semantic identity、cache、generated/package lifecycle |
| Creative Entity | identity、alias、status、semantic metadata、binding、orphan/rebind | 文件字节、link、package、generated output |
| ContentReadService | locator 授权 stat/read | membership、cache path、UI projection |
| ContentRepresentationService | thumbnail/proxy/preview 等派生表现 | source identity、Entity fact |
| Document/generated/package owner | entry、revision/digest、manifest/trust、生命周期 | Media Library membership |
| Search | 可重建 locator/fingerprint projection | Entity 或 binding 写入 |

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

Canvas 不建立自己的媒体库或素材副本 registry。未链接的全局 library 不能把绝对路径写入 `.nkc`；
用户必须先 link library、复制文件到明确目标，或使用已授权的项目 import。

## Projection 与 cache

Media Library tree、Search、recent-use、technical metadata、availability、OCR/ASR/vision evidence 都是
可重建 projection，以 canonical locator/fingerprint 为键。Discovery 不创建 Entity fact。
thumbnail、proxy、archive extraction 和其他 cache 是 Host/representation owner 的内部派生物。

## 验证

- 任意授权媒体文件无需额外 catalog membership 即可读取、预览和引用；
- link target 不进入项目事实、Agent payload、Renderer state 或 safe diagnostic；
- projection 删除重建不创建 Entity facts；
- copy/delete 命中 Desktop Content I/O 与授权 writer；
- rebind 需要显式 target 和 fingerprint/revision；
- Windows junction、UNC/NAS、大型 snapshot、取消和 staging cleanup 使用目标平台 fixture。

相关边界见 [`asset-library.md`](asset-library.md)、[`unified-entity.md`](unified-entity.md)、
[`cache-file-access-and-paths.md`](cache-file-access-and-paths.md) 和
[`application-composition.md`](application-composition.md)。
