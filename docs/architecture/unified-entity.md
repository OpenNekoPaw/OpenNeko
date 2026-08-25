# 统一实体架构

本文定义 Project Entity 的最小语义身份、候选、representation binding 和搜索投影。文件与素材入口见
[`asset-library.md`](asset-library.md)，完整跨领域关系见
[`creative-resource-semantic-boundaries.md`](creative-resource-semantic-boundaries.md)。

## 核心原则

- Project Entity 回答项目内“这是谁/是什么”，不回答“角色如何运行”或“世界当前发生了什么”。
- character、scene、object、location 和 style 在一个项目内只有一个 semantic identity authority。
- Entity ID 是持久锚点；名称、alias、路径和表现可以变化。
- 用户确认事实高于 AI、Importer、Matcher 与 Search 推断。
- candidate、suggestion、draft、mention 与 semantic evidence 不能静默覆盖 confirmed Entity。
- Entity 不拥有文件、全局 Asset 记录、Character、World、thumbnail、cache、usage 或 interaction lifecycle。
- 删除资源不删除 Entity；deprecate Entity 不删除资源、角色、世界或历史引用。

Entity 是跨文档语义锚点，不是 Character/World 的基类。全局 Character/World 可以没有 Entity；
项目组合通过精确 identity 关联它们。

## 最小模型

```text
ProjectEntity
  entityId, projectId, kind
  canonicalName, displayName, aliases
  status, replacementEntityId?
  createdAt, updatedAt
        |
        v
EntityRepresentationBinding
  role, durable resource ref, status, default, source, confidence
        |
        v
ContentReadService / ContentRepresentationService / owner adapter
```

Entity contract 不提供任意 facts bag。Character/World 定义、provider/model、运行状态、记忆、故事线、
使用次数、出现位置、包来源和 publication revision 都属于其他 owner 或可重建投影。

## 数据归属

| 数据                                             | 语义                                      | Owner / persistence            |
| ------------------------------------------------ | ----------------------------------------- | ------------------------------ |
| `ProjectEntity`                                  | 项目 identity、kind、名称、alias、status  | 项目 canonical Entity document |
| `CreativeEntityCandidate`                        | 自动发现但未经确认的候选                  | user SQLite projection         |
| `EntityRepresentationBinding`                    | Entity 与 durable resource ref 的确认关系 | 项目 canonical Entity document |
| `VisualIdentityDraft` / requirement              | 可审阅建议或创作需求                      | owning authoring workflow      |
| occurrence / relationship / availability / usage | 可重建 read model                         | Search / local metadata        |
| Entity/Character association                     | 项目语义身份与角色的精确组合              | Project per-record fact owner  |

SQLite 不保存 Entity authoritative payload。无法通过当前 contract 校验的记录原样保留，并在对应项目
显示 record-local diagnostic；普通启动不得改写、丢弃或伪造默认值。

## Identity 生命周期

```text
Observation
  -> mention / match / candidate projection
  -> explicit confirm / reject / merge / dismiss
  -> ProjectEntity fact
  -> requirement / binding / visual draft
  -> Inspector / Search / Agent projection
```

- rename 不改变 Entity ID；旧名称可以进入 aliases。
- merge 保留 surviving ID，并要求全部 typed reference owners 参与；覆盖不全时操作被阻止。
- deprecate 保留历史引用。
- bind、unbind、set-default 与 rebind 只修改 binding fact。
- discovery 与 Search 不得直接创建或确认 Entity/binding。

## Representation binding

binding 保存 owner-qualified durable resource ref，而不是任意路径：

| Kind             | 身份与校验                                                                    |
| ---------------- | ----------------------------------------------------------------------------- |
| workspace file   | normalized workspace-relative locator + optional fingerprint                  |
| document entry   | stable document source + normalized entry identity + optional fingerprint     |
| generated output | output owner identity + revision/digest + durable locator                     |

availability 与 attention 是可重建投影。公共或持久 Entity contract 不包含 absolute/link-target path、
cache path、provider URL、Renderer URI 或 runtime token。

workspace path 缺失或 fingerprint 不匹配时，binding 变为 orphaned。Search 可以提供候选 evidence，只有
显式 rebind 才能修改 confirmed binding；禁止按同名文件、旁路 catalog 或 active workspace 自动修复。

unbind 不删除 bytes；资源删除只让 binding orphaned；deprecate Entity 不修改 Media link、全局 Asset 记录、
Character 或 World。

## 候选、发现与展示

AI 与内容分析只产生候选证据：

```text
source locator
  -> bounded text/image analysis
  -> mention / occurrence / visual suggestion
  -> explicit user decision
  -> Entity fact or representation binding
```

正文和 document bytes 只存在于 bounded analysis batch；SQLite 只保存 locator/range、fingerprint、hash、
candidate 与 freshness。需要上下文时通过 Content/Document owner 回读并重新校验。

Entity card 是 read-only composition：名称和 status 来自 Entity；头像和可用表现来自 confirmed binding；
occurrence、relationship、usage 和 availability 来自投影。Search 按稳定 Entity ID 去重，不写 Entity facts。

Agent `@` mention 可以先查 Search，provider dispatch 前必须通过 Entity facade 重读 canonical record。缺失、
kind mismatch、workspace ambiguity 或 invalid record 必须 fail-visible，不能回退搜索摘要或缓存 snapshot。

## 与 Character 和 World 的关系

Project owner 记录 exact Entity/Character association，只保存 `projectId + entityId + characterProjectId`。
CharacterProject 不保存项目 Entity identity。有效关联可让组合层展示 Chara-owned action，但 Entity 不拥有
Dialogue、Room、Embody、Conversation、AgentSession 或 CharacterVersion 选择。

World 可将 world-local location/object 与 ProjectEntity 关联用于检索，但 World definition、actor binding、
run/save/branch 仍归 World；Character actor 必须引用精确 CharacterVersion。

## 与资源和 Asset 的关系

Media Library discovery 可以提供 evidence 或 rebind candidate，但不能确认文件“就是某个角色”。全局
Asset membership 只管理用户显式导入的文件记录；Project Entity 绑定其进入 Workspace 后的 durable
locator，不拥有 membership 或文件生命周期。

Character 可移植包由 Chara 拥有；World 可移植与发布由 World 拥有；ProjectEntity 只保持项目本地可变
事实，不拥有其他领域的发布、实例化或更新协议。

## Entity Inspector

Inspector 只提供：

- candidate confirm/reject/dismiss；
- rename、alias、merge、deprecate；
- bind/unbind/rebind/set-default；
- occurrence、usage、availability 与引用 blocker 的只读展示；
- 有有效关联时，由 Chara/World 等 owner 提供的精确 navigation/action projection。

Desktop 只注入 Workspace、local metadata 与 typed package ports，不解释 Entity 语义。缺少 association、
CharacterVersion、完整 reference reader 或资源 adapter 时，操作必须被禁用并展示 owner-qualified blocker。

## 反模式

| 反模式                                   | 正确边界                                     |
| ---------------------------------------- | -------------------------------------------- |
| 文件名作为 Entity identity               | stable Entity ID + alias + explicit evidence |
| AI 自动覆盖 confirmed metadata           | candidate/draft + explicit decision          |
| 发现文件时自动建 Entity/Character        | projection only；显式创建                    |
| 把 Character/World 字段放进 Entity facts | 对应 owning aggregate + exact association    |
| 把使用次数放进 Entity                    | Search/local-metadata projection             |
| Entity 启动 Dialogue/Room                | Chara-owned exact handoff                    |
| 全局 Asset 记录复制角色或世界事实         | Chara/World-owned portability                |
| 自动 relocation confirmed binding        | orphan + candidate + explicit rebind         |
| 删除文件时删除 Entity                    | orphan binding，Entity 保留                  |
