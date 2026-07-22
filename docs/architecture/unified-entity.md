# 统一实体架构

更新日期：2026-07-22

本文定义 Creative Entity 的身份、候选、representation binding、requirement、视觉草案和搜索投影。媒体文件入口见 [`asset-library.md`](asset-library.md)，跨领域决策见 [`adr-asset-library-sources-and-unified-entity-boundary.md`](adr-asset-library-sources-and-unified-entity-boundary.md)。

## 核心原则

- Creative Entity 回答“这是谁/是什么”；Media Library 回答“哪些文件可访问”。
- character、scene、object、location 和 style 只有一个 semantic identity authority。
- Entity ID 是持久锚点；名称、alias、路径和表现可以变化。
- 用户确认事实高于 AI、Importer、Matcher 与 Search 的推断。
- candidate、suggestion、draft、mention 和 semantic evidence 不能静默覆盖 confirmed Entity。
- Entity 不拥有文件、generated output、document entry、package、thumbnail 或 cache。
- 删除资源不删除 Entity；deprecate Entity 不删除资源或历史引用。

## 核心模型

```text
CreativeEntity
  id, kind, canonicalName, displayName, aliases, status, metadata
        |
        v
EntityRepresentationBinding
  role, representation, status, availability, default, source, confidence
        |
        v
ContentLocator
  workspace-file | document-entry | generated-output | package-resource
        |
        v
ContentReadService / ContentRepresentationService / owner adapter
```

Alice 不是一张图片或一个模型文件。Alice 是稳定实体；立绘、Live2D、声音、动作和参考图是可以独立变化的 representation。

## 数据模型与存储

| 数据 | 语义 | Owner / location |
| --- | --- | --- |
| `CreativeEntity` | 稳定 identity、kind、名称、alias、status、semantic metadata | `neko-entity` project facts |
| `CreativeEntityCandidate` | 自动发现但未经确认的身份候选 | user SQLite projection；显式决策才进入 project fact |
| `EntityRepresentationBinding` | Entity 与 durable representation 的关系 | `neko/entity-representation-bindings.json` |
| `EntityAssetRequirement` | portrait/live2d/voice 等缺失需求；名称暂保留为领域术语 | owning project fact |
| `VisualIdentityDraft` | AI 视觉草案与可审阅建议 | owning project fact |
| occurrence / relationship / availability | 可重建 read model | user SQLite projection |

Entity metadata 只保存语义或领域中立属性。文件路径、thumbnail/cache path、Webview URI、Engine token、provider raw response、license 或任意旧 catalog metadata 不得写入 Entity metadata。

## Identity 生命周期

```text
Observation
  -> mention / match / candidate projection
  -> explicit confirm / reject / merge / dismiss
  -> CreativeEntity fact
  -> requirement / binding / visual draft
  -> Inspector / Search / Agent projection
```

- rename 不改变 Entity ID；旧名称可以进入 aliases。
- merge 保留 surviving ID，并为旧引用提供明确 redirect/diagnostic。
- deprecate 保留历史引用。
- bind、unbind、set-default 与 rebind 只修改 binding fact。
- discovery 与 Search 不得直接创建或确认 Entity/binding。

## Representation binding

`EntityRepresentationBinding.representation` 是 validated `ContentLocator`：

| Kind | 身份与校验 |
| --- | --- |
| `workspace-file` | normalized workspace-relative path + optional fingerprint |
| `document-entry` | stable workspace document source + normalized entry path + optional fingerprint |
| `generated-output` | owner output ID + revision + digest + durable workspace path |
| `package-resource` | package ID + revision + member path + optional digest/manifest path |

binding 还保存 role、status、availability、default、source、confidence 与 timestamps。它不保存 Asset ID、`project://assets/`、absolute/link-target path、cache path 或 runtime token。

Resolver 按 consumer 的候选 role 顺序选 confirmed、active binding。`canvas`、`agent` 与 `cut` 可以有不同 role order，但不得改用另一种 locator resolver。没有可用表现时返回 `missing-representation` 与明确 next action。

### Orphan 与 rebind

普通 workspace path 缺失或 fingerprint 不匹配时，binding 变为 `orphaned`。Search 可以按 fingerprint/name 提供 candidate evidence，但不得自动改写 confirmed binding。用户显式 rebind 后才写入新 locator。

generated/package owner 的 revision、digest 或 manifest 不匹配同样 fail-visible。任何情况都不能回退到旧 Asset catalog、同名路径或 active workspace。

### 生命周期隔离

- unbind 不删除 resource bytes；
- explicit resource delete 不删除 Entity，而使 binding orphaned；
- deprecate Entity 不删除 package、generated output 或 Media Library link；
- package owner 解析真实多文件成员，Entity 只保存 package reference。

## 候选与视觉草案

AI 与文本分析只产生候选证据：

```text
source locator
  -> bounded text/image analysis
  -> mention / occurrence / visual suggestion
  -> explicit user decision
  -> Entity fact or representation binding
```

正文、page/chapter/paragraph text 和 document bytes 只在 bounded analysis batch 中存在。SQLite 保存 fingerprint、locator/range、content hash、mention、candidate 与 freshness；需要上下文时通过 ContentRead/DocumentAccess 回读并校验 fingerprint。

扫描 PDF 返回 `ocr-required`，DRM fail-visible。普通 JSON/YAML 不进入文本 analyzer，除非 owning domain 注册了明确 creative schema adapter。

## 展示与搜索

Entity card 是投影，不是单个 JSON 原样展示：

- 名称、alias、status 来自 `CreativeEntity`；
- 主头像与可用表现来自 confirmed binding + representation projection；
- missing requirement、orphan state 与来源证据必须可见；
- occurrence 与 relationship 来自可重建 projection。

UI 可以消费短生命周期 projected URI，但持久状态只保存 Entity ID 或 `ContentLocator`。Search 提供 `creative-entities` partition，并按 stable Entity ID 去重；Search 只返回 projection、suggestion 与 navigation data，不写 Entity facts。

Agent `@` mention 先使用 Search projection，再在 turn boundary 通过 Entity facade 读取 canonical confirmed Entity。删除、kind mismatch、workspace ambiguity 或 facade diagnostic 必须在 provider dispatch 前失败，不得回退搜索摘要或旧 snapshot。

## 与 Media Library 的关系

Media Library discovery 可以提供文件 evidence 或 rebind candidate，但不能确认文件“就是某个角色”。Creative Entity 可以绑定 Media Library locator，但不读取 link target、不拥有 library membership，也不修改文件结构。

```text
Media Library locator
  -> explicit bind/rebind
  -> EntityRepresentationBinding
  -> owner/content port resolves source
  -> ContentRepresentationService projects preview
```

## 反模式

| 反模式 | 正确边界 |
| --- | --- |
| 文件名作为 Entity identity | stable Entity ID + alias + provenance |
| AI 自动覆盖 confirmed metadata | candidate/draft/suggestion + explicit decision |
| 发现媒体文件时自动建 Entity | projection only |
| 通过 Asset ID 间接绑定 | direct `ContentLocator` |
| 自动 relocation confirmed binding | orphan + candidate + explicit rebind |
| 把 cache/thumbnail path 写入 Entity | semantic representation port |
| 删除文件时删除 Entity | orphan binding，Entity 保留 |
