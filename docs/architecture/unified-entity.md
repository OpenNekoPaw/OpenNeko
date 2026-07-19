# 统一实体架构

更新日期：2026-07-18

本文定义 OpenNeko 中统一实体、候选实体、实体素材绑定、待补素材需求、视觉草案、展示投影和搜索投影的横切设计。统一实体服务所有创作领域，但不属于任一 `docs/domains/<creative-goal>/`。

## 设计目标

- 为角色、场景、物品、地点、风格等创作概念提供稳定身份。
- 让 Story、Canvas、Agent、Assets、Inspector、Search 等消费者共享同一实体语义，而不读彼此私有状态。
- 区分用户确认事实、自动候选、素材表现、展示投影和搜索索引。

## 核心原则

- 统一实体回答“这是谁/是什么”；素材库回答“有哪些文件和技术表现”。
- Entity ID 是持久引用锚点，展示名、别名、路径和素材可以变化。
- 用户确认事实高于 AI、Importer、Matcher、Search 的自动推断。
- 候选、建议、草案和语义证据不能静默覆盖 confirmed entity。
- 自动抽取的 mention、match 和 candidate cluster 是用户级 SQLite projection，不是项目事实；只有显式用户决策才进入项目文件。
- 源文档正文、page/chapter/paragraph text 和文档二进制不进入 SQLite；projection 只保存 fingerprint、locator/range、content hash、mention/occurrence/candidate/match 与 freshness。
- 实体不拥有素材文件；实体通过 `EntityAssetBinding` 选择素材表现。
- Search、Inspector、Agent mention 都是投影，不是实体事实源。
- 删除素材不删除实体；实体废弃不删除历史引用。

## 核心模型

```text
CreativeEntity
  id, kind, canonicalName, displayName, aliases, status, metadata
        |
        v
EntityAssetBinding
  role, assetRef, status, availability, default, source, confidence
        |
        v
Asset / ResourceRef
  files, variants, thumbnails, provenance, capabilities
        |
        v
RepresentationResolver
  portrait / reference / live2d / live3d / voice / motion / style
```

角色 Alice 不是一张图片或一个模型文件。Alice 是稳定实体；Alice 的立绘、Live2D、VRM、声音、动作和参考图是不同素材表现。

## 信息模型

| 数据                                   | 设计含义                                                                     | 写入边界                                          |
| -------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------- |
| `CreativeEntity`                       | 稳定身份、类型、canonical name、display name、aliases、status、metadata      | `neko-entity`                                     |
| `CreativeEntityCandidate`              | 从 Story、Canvas、Agent、Importer、Document 等来源发现的候选实体             | provider/adapters 汇总，确认后进入实体事实        |
| `EntityAssetBinding`                   | 实体与素材表现的关系、role、默认项、status、availability、source、confidence | `neko-entity`                                     |
| `EntityAssetRequirement`               | 某实体缺少 portrait/live2d/live3d/voice 等表现的需求                         | 领域或 Agent 提出，实体层统一展示                 |
| `VisualIdentityDraft`                  | AI 形象草案、候选图、提取的视觉事实建议                                      | Agent/Canvas/Story 输入，用户确认后转为事实或绑定 |
| `CreativeEntityOccurrenceProjection`   | 实体在剧本、画布、素材、文档、生成物中的出现点                               | provider 派生                                     |
| `CreativeEntityRelationshipProjection` | 实体之间或实体与素材/片段之间的关系                                          | provider 派生，强弱关系分开                       |
| `CreativeEntityChangeEvent`            | 实体事实或投影变化的刷新信号                                                 | `neko-entity`                                     |

## 实体类型与状态

| Kind        | 说明                                |
| ----------- | ----------------------------------- |
| `character` | 人物、角色、Avatar、NPC             |
| `scene`     | 剧情场景、镜头组、空间叙事单元      |
| `object`    | 道具、物件、可交互对象              |
| `location`  | 地点、环境、室内外空间              |
| `style`     | 视觉风格、世界观风格、色彩/材质风格 |

| 状态         | 含义                           | 规则                                     |
| ------------ | ------------------------------ | ---------------------------------------- |
| `candidate`  | 系统或用户正在整理的候选身份   | 可以合并、拒绝、确认，不作为最终语义事实 |
| `confirmed`  | 用户或确定性来源确认的稳定身份 | 改名不改 ID，绑定和引用以 ID 为准        |
| `deprecated` | 不再活跃但保留历史引用的身份   | 不应默认出现在创建流，但可用于历史解析   |

实体 ID 一旦进入持久引用，不应随展示名变化。重命名更新 `canonicalName`、`displayName` 或 aliases；Canvas、Story、Agent durable payload 仍引用 entity ID。合并实体时保留 surviving ID，旧 ID 只能作为 redirect、alias 或历史诊断存在。

## 事实存储

| 数据                | 建议位置                                                           | Git | 说明                                                            |
| ------------------- | ------------------------------------------------------------------ | --- | --------------------------------------------------------------- |
| 人物实体            | `characters.json`                                                  | 是  | 兼容既有人物事实源                                              |
| 非人物实体          | `neko/entities/*.json`                                             | 是  | scene、location、object、style                                  |
| 自动候选 projection | 用户级 `~/.neko/neko.db`                                           | 否  | 可重建的 mention、match、聚类与 review classification           |
| 显式候选决策        | `neko/entities/candidates.json` 或后续收敛的 project decision fact | 是  | 用户保存审阅、拒绝、dismiss 或 merge 决策；自动 analyzer 不写入 |
| 实体素材绑定        | `neko/entity-bindings.json`                                        | 是  | 当前确认态，由 Git 管版本                                       |
| 待补素材需求        | `neko/entity-asset-requirements.json`                              | 是  | 缺少表现时的结构化需求                                          |
| 视觉身份草案        | `neko/visual-identity-drafts.json`                                 | 是  | AI 形象草案和视觉事实建议                                       |
| 出现点/关系图       | 用户级 `~/.neko/neko.db` projection                                | 否  | 派生 read model，可重建                                         |

人物的衣着、形象、位置、伤势、情绪、阵营以及 Memory/Belief 不作为 occurrence 的固定事实。它们需要在未来由带时间、视角和 provenance 的 evidence 动态总结，并允许闪回、误解和悬疑叙事中的冲突 evidence 并存。

实体 metadata 只保存语义或领域中立属性，例如年龄段、风格、物种、世界观标签、叙事关系摘要。素材文件路径、缩略图路径、Webview URI、Engine token、模型 provider raw response 不应写入实体 metadata。

## 生命周期

```text
Observation
  Story / Canvas / Agent / Importer / Document
        |
        v
SQLite mention / match / candidate cluster
        |
        +---- deterministic exact link ----> occurrence projection
        |
        v
Suggested / ambiguous review exception
        |
        v
Explicit confirm / reject / merge / dismiss
        |
        v
CreativeEntity or project candidate-decision fact
        |
        v
Requirement / Binding / Visual draft
        |
        v
Inspector / Search / Agent projection
```

生命周期约束：

- 自动发现先写可重建 candidate projection；只有显式保存审阅或用户决策才写 project candidate fact。
- `confirmCandidate` 必须保留 provenance，且项目事实保存成功后再刷新 SQLite projection。
- `rename` 不改变 entity ID；旧名称可选择进入 aliases。
- `merge` 保留 surviving entity ID，并重定向或标记历史引用。
- `deprecate` 保留历史引用，不删除事实。
- `bind` 和 `set-default-binding` 更新绑定层，不改写素材库文件结构。
- `mark-binding-orphaned` 表示素材引用不可用，不表示实体失效。

## 绑定与表现解析

`EntityAssetBinding` 是实体和素材库之间的稳定关系：

| 字段                  | 语义                                                                       |
| --------------------- | -------------------------------------------------------------------------- |
| `entityId/entityKind` | 绑定属于哪个实体                                                           |
| `assetRef`            | 指向项目素材、共享库或外部来源的稳定引用                                   |
| `role`                | `portrait`, `reference`, `live2d`, `live3d`, `voice`, `motion`, `style` 等 |
| `status`              | `suggested`, `confirmed`, `rejected`                                       |
| `availability`        | `active`, `orphaned`, `archived`                                           |
| `source`              | `user`, `importer`, `story`, `canvas`, `agent`, `matcher`                  |
| `confidence`          | 自动建议的置信度，不替代用户确认                                           |

表现解析器按 target 选择合适素材表现：

| Target   | 默认回退                                    |
| -------- | ------------------------------------------- |
| `canvas` | `portrait -> reference -> live2d -> live3d` |
| `agent`  | `reference -> portrait -> live2d -> live3d` |
| `cut`    | `video -> live2d -> live3d -> portrait`     |

解析器只接受当前 `canvas | agent | cut` target。`puppet-bone` 仅作为历史绑定诊断角色保留，不进入默认表现回退；缺少请求表现时返回 `missing-representation` 和可解释建议。

## 视觉草案与 AI 建议

AI 生成结果是候选事实，不是用户确认事实。

```text
character candidate / confirmed character
  -> visual prompt
  -> generated assets
  -> user selects draft
  -> extracted visual facts become suggestions
  -> accepted suggestions update entity metadata or bindings
```

设计规则：

- `VisualIdentityDraft` 保存 prompt、生成资产 ID、选中资产、视觉事实建议和状态。
- `VisualFactSuggestion` 的 accepted 状态只表示用户是否接受该建议。
- AI 提取的“黑发、红裙、冷淡表情”等先进入草案，不直接覆盖 confirmed metadata。
- 生成图要成为项目素材，必须提升为 generated asset source，再通过 binding 与实体连接。

## 展示投影

UI 中的“实体卡”是多源投影，不是单一事实文件的原样展示。

| 展示信息         | 来源                                                                          |
| ---------------- | ----------------------------------------------------------------------------- |
| 名称、别名、状态 | `CreativeEntity`                                                              |
| 主缩略图或头像   | 默认 `portrait/reference/live2d/live3d` binding 解析出的 `ResourceVariantRef` |
| 可用表现         | `EntityAssetBinding.role` 与 Asset capability                                 |
| 缺失项           | `EntityAssetRequirement`                                                      |
| 绑定状态         | `availability: active/orphaned/archived`                                      |
| 出现点           | occurrence projection                                                         |
| 搜索 freshness   | Project Search partition freshness                                            |
| 来源徽标         | `CreativeEntitySourceMetadata`、binding source、asset provenance              |

展示约束：

- UI 可以展示 projected URI，但持久 UI state 只能保存 entity ID、assetRef、ResourceRef 或 source ref。
- `orphaned` binding 应显示为可修复状态，不应静默隐藏。
- `stale` 搜索或缓存结果应以 freshness 告知用户，而不是被当作 confirmed fact。
- Inspector、Agent mention、asset picker 和 entity picker 可以使用不同投影，但必须回到同一 entity/ref 语义。

## 搜索与索引

统一实体向 Project Search 提供 `creative-entities` partition：

| 搜索项                 | 来源                           |
| ---------------------- | ------------------------------ |
| confirmed entity       | `CreativeEntity`               |
| entity candidate       | `CreativeEntityCandidate`      |
| occurrence             | Story/Canvas/Document provider |
| relationship           | relationship projection        |
| missing representation | `EntityAssetRequirement`       |

搜索规则：

- confirmed entity 优先于 candidate。
- 同一 entity 由 Entity provider 与其他搜索投影同时返回时，用 stable entity ID 去重并优先 canonical Entity。
- `canonicalName`、aliases 和 `searchText` 用于匹配，不作为事实写回。
- Search 只能返回 projection、suggestion 和 navigation data，不直接修改实体或绑定事实。
- Entity 查询可以返回相关 occurrence；occurrence、mention 或 source locator 也可以反查 confirmed Entity、Candidate 或 ambiguity。可见上下文通过 locator 回读源文档并校验 fingerprint，不从 SQLite 读取复制正文。

### Agent Entity 引用

Agent `@` 搜索沿用 Project Search projection，只把稳定 Entity identity、kind、label、summary 和导航元数据送入 Webview；Webview 不保存完整 `CreativeEntity` 项目事实。用户选中 Entity 后，Extension 在 turn 发送边界使用受信任的 conversation/workspace identity，通过 Entity facade 读取 canonical confirmed Entity，并转换为严格的 resolved Entity context。

Agent runtime 只接受 resolved Entity context，向模型提供 entity ID、kind、canonical/display name、aliases、status 和 metadata。Entity 已删除、kind 不匹配、workspace 无法唯一解析或 facade 返回 diagnostic 时，请求在 provider dispatch 前失败；不得退回搜索 summary、当前 active workspace 或旧 snapshot 继续成功。

## 文本实体发现与自动候选

工作区和已配置素材库目录中的文本文件可能由 Finder、Git、同步工具或外部编辑器直接修改，不能假设所有变化都经过 Importer。Host 应将文件事件作为低延迟提示，并通过激活、焦点恢复、根目录配置变化、显式刷新和有界周期 reconciliation 保证最终发现完整性。

发现、分析、导入和确认是不同操作：

```text
workspace / configured media-library creative document
  -> semantic source discovery + fingerprint
  -> bounded transient text unit / entity mention
  -> exact link or aggregated candidate projection
  -> compact locator/hash relation in SQLite
  -> explicit user decision
  -> Entity fact / candidate-decision fact
```

- 发现文件不得自动注册 `AssetEntity`、确认 Entity 或创建 binding。
- stable entity ref 或 kind-compatible 的唯一 canonical name/alias 可以自动链接；同名歧义不得自动选择。
- 新候选按 `kind + normalized name` 聚类，累计来源和 occurrence；默认 review 只展示高价值建议和歧义，不按 mention 生成审批项。
- 一期支持 Fountain/NKS/Story、Markdown/TXT、PDF/EPUB/DOCX；JSON/YAML 只有被 owning domain 的已注册创作 schema adapter 识别时才进入分析，普通配置文件不扫描字符串字段。
- PDF 按 page、EPUB 按 chapter、DOCX 按 section/paragraph 通过 `DocumentAccessService` 有界读取；扫描 PDF 返回 `ocr-required`，DRM fail-visible，内嵌媒体只形成 `ResourceRef`。
- transient segment text 在分析批次结束后释放；SQLite 只保存 compact evidence。旧 `MediaTextSegment.text` cache 通过 allowlisted cache cleanup 清理并从仍可访问的 source 重建。
- 第一期不使用 embedding、TurboVec 或向量最近邻确认身份；未来向量检索只能提供 recall evidence。
- VS Code 可以提供 LSP 风格 diagnostics/navigation adapter，但 Entity authority、source freshness 和 SQLite projection 仍由共享 host-neutral service 拥有。

## 与素材库的关系

统一实体不解析素材文件，不拥有缩略图，也不拥有外部包导入或安装路径。它只保存 identity、binding 和 requirement。

```text
CreativeEntity
  -> EntityAssetBinding(assetRef, role)
  -> AssetLibrary resolves asset
  -> ResourceCache projects preview
```

当素材被删除或移动，实体不删除；相关 binding 变为 `orphaned` 或 unresolved。修复可以重新绑定、重新导入、恢复素材或忽略历史引用。

## 约束与反模式

| 反模式                         | 风险                           | 正确边界                                |
| ------------------------------ | ------------------------------ | --------------------------------------- |
| 以文件名作为实体身份           | 同名、改名、移动路径都会断链   | stable entity ID + aliases + provenance |
| AI 自动覆盖 confirmed metadata | 用户语义事实被弱推断污染       | AI 输出进入 candidate/draft/suggestion  |
| Asset 删除时删除 entity        | 素材生命周期和身份生命周期混淆 | binding 标记 orphaned，entity 保留      |
| 多包各自维护实体 JSON          | identity 分裂、搜索去重困难    | 统一走 `neko-entity` facade/provider    |
| Search 直接写实体事实          | read model 变成隐形写入者      | Search 只返回 projection 和 suggestion  |
| 把缩略图路径写入实体 metadata  | 缓存失效导致实体损坏           | 通过 binding 和 ResourceRef 投影        |

## 吸收的稳定主题

本设计吸收以下历史主题的稳定部分：

- unified entity / character index
- creative entity and asset composition 中的实体、绑定、需求、视觉草案部分
- entity facade / Inspector projection
- Story、Canvas、Agent 的实体引用边界
- project cache search service 中的 creative-entities partition
