# 素材库架构

更新日期：2026-07-15

本文定义 OpenNeko 中素材库、素材实体、变体、文件、导入来源、媒体库、市场安装结果、素材搜索投影和素材与统一实体绑定的横切设计。统一实体身份设计见 [`unified-entity.md`](unified-entity.md)；缓存、文件读写和路径变量见 [`cache-file-access-and-paths.md`](cache-file-access-and-paths.md)。

## 设计目标

- 为图片、音频、视频、文档、模型、Puppet、材质、shader、preset、voice pack 等素材提供统一库存和查询入口。
- 区分素材事实、素材技术元数据、派生缩略图/代理、市场 manifest、实体绑定。
- 让视频、音频、模型、2D、互动领域可以消费同一素材库，而不直接读取彼此私有目录。

## 核心原则

- 素材库回答“有哪些文件、变体、来源、权限和技术表现”，不回答“这个角色是谁”。
- 素材事实保存 source、metadata、license/provenance、variant/file 结构，不保存 Webview URI 或 runtime token。
- 缩略图、proxy、probe metadata、embedding、OCR/ASR sidecar 是派生数据，允许删除和重建。
- 市场安装结果不自动成为项目创作事实；领域项目或实体绑定必须显式引用。
- 素材可以关联实体，但不拥有实体身份。实体重命名不应自动改写素材 metadata。
- 删除素材不删除实体；取消实体绑定不删除素材文件。
- 素材导入、注册、更新和删除应通过素材库 facade 或 registry，不让消费者写 `library.json`。

## 核心模型

```text
AssetLibrary
  AssetEntity
    category, tags, metadata, source, ownership
        |
        v
  AssetVariant
    attributes, role, status
        |
        v
  AssetFile
    purpose, mediaType, path/source, metadata, fingerprint
        |
        v
  Derived resources
    thumbnail, preview, proxy, embeddings, probe metadata
        |
        v
  Consumers
    Entity binding, Search, Agent, Canvas, Engine, Domains
```

实体 Alice 可以绑定到多个素材表现；素材库只知道这些素材的文件、变体和能力，不成为 Alice 这个身份的事实源。

## 素材类型

| 类型                     | 示例                                              | 典型消费者                |
| ------------------------ | ------------------------------------------------- | ------------------------- |
| image / sequence         | reference、concept art、texture、storyboard frame | 2D、Video、Model、Agent   |
| audio                    | voice sample、sfx、music、recording               | Audio、Video、Interactive |
| video                    | clip、proxy、reference、export                    | Video、Agent、Preview     |
| document                 | pdf、docx、markdown、script reference             | Agent、Story、Preview     |
| model                    | glb、gltf、vrm、fbx、mmd                          | Model、Interactive、Live  |
| puppet                   | nkp、moc3、motion、expression、physics            | 2D、Interactive、Live     |
| material / HDR / LUT     | texture、shader input、lookdev asset              | Model、Video              |
| shader / effect / preset | market or local install target                    | Engine、Video、Model      |
| skill / provider card    | market capability source                          | Agent                     |

不同素材类型通过 manifest、handler 或 provider 暴露能力；领域包消费能力，不直接猜文件格式。

## 事实存储

| 数据              | 建议位置                                           | Git       | 说明                                    |
| ----------------- | -------------------------------------------------- | --------- | --------------------------------------- |
| 素材库事实        | `neko/assets/library.json`                         | 是        | AssetEntity、Variant、File、标签、来源  |
| 媒体库配置        | `neko/settings.json` + `.neko/settings.local.json` | 部分      | 团队共享变量 + 本机路径覆盖             |
| 市场安装记录      | global/project market install record               | 视 scope  | package、version、trust、install target |
| Generated-output 索引 | local metadata + `neko/generated/<kind>/` source | source 由项目决定 | 与 AssetLibrary identity 分离的生成结果 |
| 缩略图/代理/probe | `.neko/.cache/`                                    | 否        | 可重建派生层                            |
| 语义索引          | `.neko/.cache/` 或 Search provider                 | 否        | OCR、ASR、embedding、vision evidence    |

素材库事实应保存相对路径、`${VAR}/path`、source ref、fingerprint、provenance 和 license。绝对路径只允许作为本机配置或导入来源诊断。

## Asset / Variant / File

| 层           | 含义                         | 例子                                         |
| ------------ | ---------------------------- | -------------------------------------------- |
| AssetEntity  | 一个可被搜索和引用的素材集合 | `alice-live2d-default`, `forest-night-bg`    |
| AssetVariant | 同一素材集合的某种表现或版本 | front view、happy expression、night lighting |
| AssetFile    | 具体文件或文件角色           | main、thumbnail、texture、source、preview    |

设计规则：

- `AssetEntity` 的 category 是素材分类，不等于统一实体 kind。
- `AssetVariant` 保存组合维度，例如 view、expression、outfit、lighting、timeOfDay。
- `AssetFile` 保存 path/source、purpose、mediaType、metadata、fingerprint。
- `thumbnail` 可以是 file purpose，也可以是 ResourceCache variant；持久事实不保存 Webview URI。
- 多文件表现包应记录文件角色，例如 model、texture、physics、expression、motion、voice、calibration。

## 导入与注册

```text
local file / media library / generated output / market package / remote source
  -> validate source and trust
  -> PathResolver contract
  -> AssetEntity / Variant / File
  -> optional thumbnail/probe prewarm
  -> ProjectSearch asset-library refresh
```

导入策略：

| 来源               | 处理                                                              |
| ------------------ | ----------------------------------------------------------------- |
| workspace file     | 保存 workspace-relative path                                      |
| media library file | 保存 `${VAR}/path`，变量来自 media library settings               |
| external file      | 复制到项目/媒体库，或注册为 local-link 并提示可移植性             |
| generated output   | 可保持 generated-output identity；需要素材库能力时显式 promote 为独立 AssetEntity |
| market package     | 校验 manifest、signature、trust、entitlement，再写安装记录        |
| remote URL         | 保存 remote source、checksum/provenance，必要时 materialize cache |

导入不等于绑定实体。文件名和路径可以产生绑定建议，但 confirmed binding 必须走统一实体层。

### Generated output 的提升边界

Creator-visible generated output 是 revision/digest 绑定、保存在 `neko/generated/<kind>/` 的工作区资源，不是 runtime scratch，也不是 `AssetEntity`。Agent task result、普通 Canvas Inbox node 和 Webview render URI 都不能据此推断素材库 membership。

```text
generated output + revision + digest + provenance
  -> AssetLibrary/AssetStore promotion facade
  -> AssetEntity + Variant + File ownership
  -> stable Asset identity/source ref
  -> optional Asset-backed Canvas/领域项目 authoring
```

- 单项与批量提升使用稳定 request/candidate identity，并返回逐项结果；重放不得重复创建 AssetEntity。
- 部分成功保留已创建的 Asset，失败项保持可重试并携带诊断；不尝试跨 Asset 与 Canvas 文件写入做虚假全局回滚。
- Asset 保存成功而 Board revision 冲突时，Asset 继续有效；重试必须显式绑定预期 target，不能改投活动 Canvas。
- `neko/generated/<kind>/` 是 generated-output 的 canonical source root，但不是 AssetStore root。Promotion 根据 AssetStore ingest policy 创建或注册独立 Asset source，不移动、删除或改写原 generated source。
- Workspace Board 可以直接持久化 generated-output `ResourceRef`；Asset promotion 是可选整理动作，不是恢复或显示前置条件。
- Canvas 删除引用不等于 Asset 删除；AssetEntity/file 删除继续走素材库自己的引用检查与确认策略。

## 素材技术元数据

素材库可以保存轻量、稳定、可审阅的技术元数据；昂贵或易失效分析放入缓存或搜索 sidecar。

| 数据                               | 位置                         | 说明                                      |
| ---------------------------------- | ---------------------------- | ----------------------------------------- |
| 文件大小、MIME、基础尺寸           | 素材事实或轻量 metadata      | 便于列表和过滤                            |
| duration、fps、sample rate         | 可缓存，可投影到素材事实摘要 | Engine probe 权威                         |
| thumbnail、proxy、preview          | Resource cache               | 可删除重建                                |
| OCR、ASR、embedding、vision tags   | Search/semantic cache        | provider/version/fingerprint 管 freshness |
| license、sourceUrl、market package | 素材事实                     | provenance 和合规                         |

Engine 是媒体 probing、解码、转码、导出和 ML 推理权威；素材库记录结果摘要和 source ref，不复制 Engine 计算逻辑。

## 媒体库与路径变量

媒体库允许项目引用 workspace 外部的大型共享素材。

| 配置               | 位置                        | 说明                      |
| ------------------ | --------------------------- | ------------------------- |
| media library name | `neko/settings.json`        | 团队共享显示名            |
| variable           | `neko/settings.json`        | `${VAR}` 形式进入素材路径 |
| original path      | `neko/settings.json`        | 团队约定路径              |
| local override     | `.neko/settings.local.json` | 本机真实路径              |
| accessible status  | runtime projection          | 当前机器是否可访问        |

素材库可以显示 offline、missing、remapped 状态，但不能把本机 override 写回项目事实。文件重定位应产生 remap 或修复建议，而不是静默修改所有路径。

### 媒体库路径映射

媒体库路径有三种不同身份，不能混用：

| 身份 | 示例 | 生命周期 | 可写入项目事实 |
| --- | --- | --- | --- |
| Durable ref | `${TEAM_FOOTAGE}/shots/a001.mov` | 跨机器、跨会话 | 是 |
| Runtime root | `/Volumes/team-footage` 或本机 override | 当前机器 | 否 |
| Webview projection | `webview.asWebviewUri(...)` 结果 | 当前 Webview 会话 | 否 |

映射链路为：

```text
AssetFile.path / media library source
  -> ${VAR}/relative/path
  -> PathResolver + ResolvedMediaLibrary
  -> runtime absolute path
  -> LocalResourceAccessService root authorization
  -> Webview projected URI or Engine descriptor
```

规则：

- `AssetFile.path`、素材搜索 `source`、领域项目引用和 Agent durable payload 只能保存 `${VAR}/path`、workspace-relative path、asset id、`ResourceRef` 或 source ref。
- `.neko/settings.local.json` 的 local override 只参与本机解析，不回写 `neko/settings.json`、`neko/assets/library.json` 或领域项目文件。
- `ResolvedMediaLibrary.accessible=false` 时，素材可以继续出现在库和搜索中，但必须标记 offline/unresolved，不能投影为可展示资源或作为 processor 输入直接执行。
- `LocalResourceAccessService` 只授权 enabled 且 accessible 的 resolved roots；Webview 不扫描媒体库目录，也不保存 projected URI。
- Agent 和 external processor 使用 `allowedInputRoots=["mediaLibrary"]` 时，只表示可读取已解析且已授权的媒体库 source，不表示可以遍历所有本机路径。
- Processor 输出默认不写回媒体库；需要长期保存到媒体库时必须走显式 Create Asset / Promote / Link 流程，并写入 `${VAR}/path` 或 AssetEntity。

### 与 Agent 和外部处理器的关系

Agent 可以把媒体库素材作为上下文、参考图、视频片段或处理器输入，但必须保留来源映射：

| 场景 | 输入 | 输出 |
| --- | --- | --- |
| Agent 读取媒体库图片 | `${VAR}/image.png` 或 asset/file ref | bounded context、`ResourceRef`、diagnostic |
| Canvas/Storyboard 引用媒体库图 | asset/file ref 或 `ResourceRef` | Canvas/storyboard 保存 source ref，不保存本机路径 |
| External Processor 消费媒体库文件 | Host 解析后的 runtime absolute input | 输出到 `.neko/.cache/resources` 或显式 promoted asset |
| Search 展示媒体库文件 | `media-library` projection + `visualResource` | projected URI 仅用于当前 Webview |

媒体库不是任意外部路径白名单。只有被设置声明、变量化、可解析、可访问并被当前 workflow/policy 授权的文件，才可作为 Agent 或 processor 输入。

## 市场与安装结果

Marketplace 提供 manifest、package、version、signature、trust、entitlement 和 install target。素材库消费安装结果，但不负责发布、签名、计费或 registry 搜索。

| Market asset         | 素材库关系                                       |
| -------------------- | ------------------------------------------------ |
| media/reference pack | 可注册为 AssetEntity 或 shared source            |
| identity package     | 可提供多种表现，但实体确认仍归 `neko-entity`     |
| model/material/HDR   | 可进入 model/media asset category                |
| puppet/voice pack    | 可作为角色表现素材                               |
| shader/effect/LUT    | 可作为 Engine artifact 或 preset                 |
| skill/provider card  | 不进入普通媒体素材库，归 Agent/Market capability |

市场安装结果不自动成为项目事实；领域格式、实体绑定或用户选择必须显式引用它。

## 搜索与展示投影

素材库向 Project Search 提供 `asset-library` 和部分 `media-library` projection。

| 搜索字段        | 来源                                                     |
| --------------- | -------------------------------------------------------- |
| label / aliases | AssetEntity name、tags、metadata                         |
| kind            | asset/media/document/generated-asset                     |
| source          | asset ID、file path、projectRelativePath、market package |
| visualResource  | thumbnail ResourceVariantRef                             |
| freshness       | asset facts、cache thumbnail、probe metadata 状态        |
| navigationData  | 打开素材详情、定位文件、显示绑定                         |

排序应优先 confirmed project assets、当前项目、exact match、最近使用和可访问素材。offline/missing/remapped 素材可以出现，但必须携带状态，不应伪装为可直接使用。

## 与统一实体的关系

统一实体通过 `EntityAssetBinding.assetRef` 引用素材表现。

```text
CreativeEntity
  -> EntityAssetBinding(role, assetRef)
  -> AssetLibrary resolves asset/variant/files
  -> ResourceCache projects preview
```

边界规则：

- 素材库可以提出 representation hint 或 binding suggestion。
- 素材库不能确认某素材“就是某角色”的身份事实。
- 实体重命名不自动改写素材 metadata；可以返回 sync suggestion。
- 素材删除、移动或缺失时，绑定变为 orphaned/unresolved，实体保留。

## 与缓存和文件访问的关系

素材库保存 source 和 metadata；缓存文档负责读取、投影和派生。

- 缩略图、proxy、preview variant 通过 `ResourceRef` 和 cache service 获取。
- Webview 展示素材必须经过 Host 投影。
- 导出或打包素材时，默认从 source ref 读取，而不是复制 thumbnail/proxy。
- 文件可访问性变化更新 projection 和 diagnostics，不直接删除素材事实。

## 约束与反模式

| 反模式                            | 风险                   | 正确边界                                         |
| --------------------------------- | ---------------------- | ------------------------------------------------ |
| 把角色身份写成素材 category       | 身份和文件分类混淆     | 用 `CreativeEntity` + binding                    |
| 直接把 Webview URI 写入 AssetFile | 会话外失效             | 保存 source path/ref，展示时投影                 |
| 素材库直接修改 entity facts       | 跨包隐式写入           | 返回 binding suggestion 或 sync suggestion       |
| 删除 AssetEntity 时删除源文件     | 破坏用户素材库         | 删除/归档事实与删除文件分开                      |
| market install 自动改项目         | 用户意图不明确         | 安装结果与项目引用分离                           |
| 所有文件导入都复制进项目          | 大型媒体和共享库不可控 | 支持 media library 和 local-link，但标注可移植性 |
| 缩略图失败导致导入失败            | 派生层影响事实层       | 导入成功，thumbnail status 失败                  |

## 吸收的稳定主题

本设计吸收以下历史主题的稳定部分：

- AssetLibrary / asset knowledge graph
- Asset Federation 中的素材自治、send-to 和来源语义
- creative entity and asset composition 中的素材表现部分
- marketplace install target contributions
- media library settings and PathResolver
- project cache search service 中的 asset-library/media-library partition
