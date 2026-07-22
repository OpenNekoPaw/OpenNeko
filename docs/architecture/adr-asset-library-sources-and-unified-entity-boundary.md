# ADR: 媒体库与统一实体边界

- 状态：Accepted
- 日期：2026-07-22
- 范围：Media Library、Creative Entity、Content I/O、Search、Agent、Canvas、Cut、Tools、TUI 与 VS Code
- 实施：[`retain-media-library-and-unified-entity`](../../openspec/changes/retain-media-library-and-unified-entity/)

## 决策

OpenNeko 只保留两个产品/领域模型：

1. **Media Library / 媒体库**是唯一用户可见的文件资源入口。
2. **Creative Entity / 统一实体**是 character、scene、object、location 和 style 的唯一语义身份 authority。

Content I/O、DocumentAccess、generated-output、package import/trust、semantic representation 与 derived cache 保持各自 owner；它们不是第三种 library。

## 背景

旧实现同时存在 workspace-linked Media Library、`AssetEntity -> AssetVariant -> AssetFile` catalog 与 Creative Entity。已可通过 workspace path 读取的文件仍需 import/promote、写 `library.json`、再通过 `project://assets/<id>` 使用，造成重复的身份、搜索、删除、availability 与迁移语义。

Asset catalog 还保存角色/场景分类、名称、别名和 metadata，与 Creative Entity 形成第二套语义 authority。把它重命名为“素材库”不会消除重复事实源。

## 责任边界

| Owner | 拥有 | 不拥有 |
| --- | --- | --- |
| Media Library | linked roots、文件 projection、add/relink/remove、显式 copy/delete | semantic identity、target registry、cache、generated/package lifecycle |
| Creative Entity | identity、alias、status、semantic metadata、binding、orphan/rebind | 文件字节、link、package、generated output |
| ContentReadService | locator 的授权 stat/read | 业务 membership、cache path、UI projection |
| ContentRepresentationService | thumbnail/proxy/preview 等语义表现 | source identity、Entity fact |
| Document/generated/package owner | entry、revision/digest、manifest/trust 与生命周期 | Media Library membership |
| Search | rebuildable locator/fingerprint projection | Entity 或 binding 写入 |

## 文件与 link

`neko/assets/<libraryName>` 的 direct symlink/junction 是 library name 到 target 的唯一映射事实。项目只保存 `neko/assets/<libraryName>/...` workspace-relative locator，不定义媒体库环境变量、source record、library ID 或 target registry。

普通 workspace file 与 linked file 走同一个 ContentRead handler。云同步目录只有在 provider 已同步到本地并被用户 link 后才可读取；credentials 与 sync lifecycle 仍归 provider。

## Entity representation

`EntityRepresentationBinding` 直接引用 closed `ContentLocator` union：

- `workspace-file`；
- `document-entry`；
- `generated-output`；
- `package-resource`。

binding 不包含 Asset ID、cache/materialized path、runtime token、Webview URL 或 link target。普通路径移动后 binding 必须 orphaned，并通过显式 rebind 修复；不建立通用 `resourceId -> locator` registry，也不自动按 fingerprint 改写 confirmed fact。

真实多文件资源使用 package-owned manifest 描述成员角色与 capability。package 不拥有 Creative Entity identity，也不恢复通用 Asset hierarchy。

## 用户操作

旧 save/import/promote-to-Asset 操作被拆成真实意图：

- retain generated output；
- copy bytes to selected writable Media Library；
- import/install package through package owner；
- bind/rebind representation to Creative Entity。

remove library 只删 link。copy/delete 会修改 external target，因此必须有显式目标、授权、conflict policy 与 fingerprint precondition。

## 搜索与 cache

Media Library tree、Search、recent-use、technical metadata、availability、OCR/ASR/vision evidence 都是可重建 projection，以 canonical locator/fingerprint 为键。Discovery 不写 Entity fact。

cache、proxy、thumbnail 与 archive extraction 是 Host/representation owner 的内部派生物。功能包请求语义表现，不保存 cache root、materialization status 或 runtime URI。

## Legacy 迁移

`library.json`、Asset binding、Asset URI、旧 Canvas/Cut 数据和 Asset search data 只能由显式 inspection/migration/rejection/recovery 读取。迁移必须：

1. 记录输入 digest 与 project revision；
2. 创建 immutable content-addressed archive；
3. 分类为 locator、existing Entity association、需确认 Entity proposal、owner provenance、rebuildable projection 或 unresolved metadata；
4. dry-run 后显式确认并 atomic apply；
5. 让正常 runtime 的旧 handler fail-closed。

archive 不进入正常读取，不创建替代 catalog，不双读/双写。

## 被否决方案

- **把 Asset Library 重命名为 Media Library**：保留重复 catalog 与 membership。
- **Asset Source registry**：复制 OS link mapping，并混合位置、同步、provenance 与 trust。
- **通用资源 ID registry**：重新引入 rename/reconciliation authority。
- **让 Media Library 读取所有 owner 私有格式**：绕过 Document/generated/package trust 与生命周期。
- **把旧 metadata 塞入 Creative Entity**：污染语义事实且掩盖数据丢失。

## 后果

- 文件可以直接读取、预览、搜索和引用，路径泄露面更小。
- 普通文件移动会使 binding orphaned，这是避免新 registry 的明确取舍。
- package、generated output 与 document entry 仍需 owner adapter；缺失时 fail-visible。
- 旧数据必须先 inspection/migration，不能被正常 runtime 兼容读取。
