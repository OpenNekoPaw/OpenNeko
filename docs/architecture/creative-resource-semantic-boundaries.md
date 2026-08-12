# 资源、实体、角色与世界边界

更新日期：2026-08-12

本文定义文件、媒体库、素材、Project Entity、Character 与 World 的跨领域边界。实施入口是
[`simplify-resource-entity-character-world-boundaries`](../../openspec/changes/simplify-resource-entity-character-world-boundaries/)；
在该 change 完成前，本文是目标约束，不表示所有路径已在产品中可用。当前实现差距见
[`2026-08-12-resource-entity-character-world-gap.md`](../status/2026-08-12-resource-entity-character-world-gap.md)。

## 用户概念与内部 owner

用户主要面对三个概念：**资源、角色、世界**。文件、媒体库连接、素材包与项目元素作为资源来源或
筛选条件出现，不要求用户先理解六套平级管理对象。

内部仍保留不同 owner，因为它们的身份、修改和删除语义不同：

| 概念           | 作用                               | 唯一 owner                        | 不是                                  |
| -------------- | ---------------------------------- | --------------------------------- | ------------------------------------- |
| File / Content | 定位和读取字节或文档 entry         | Content 与 Host 授权 adapter      | catalog、语义身份                     |
| Media Library  | 连接外部目录并产生可重建投影       | Assets domain 的 Media connection | Asset、Entity                         |
| Asset          | 显式导入、安装或发布的可复用包     | Asset Library                     | 普通文件、角色定义                    |
| Project Entity | 项目内“这是谁/是什么”的语义锚点    | Entity domain                     | Character/World 基类、使用量 registry |
| Character      | 角色创作、版本、故事线、记忆与互动 | Chara                             | Entity 的扩展字段                     |
| World          | 世界创作、版本、运行、存档与分支   | World                             | 场景文件或 Entity 的扩展字段          |
| usage/search   | 发现、最近使用、出现位置和可用性   | Search / local metadata           | 删除或引用安全的 authority            |

“资源”只统一展示，不统一持久化 authority。禁止建立通用 Resource/CreativeObject 超类、通用可变
catalog 或跨领域删除 service。

## 核心关系

```text
workspace/document/generated/package content
                 |
                 v
      owner-qualified resource reference
                 |
                 +----> ProjectEntity representation binding
                 +----> Character representation / voice reference
                 +----> World resource reference

Project composition
  ProjectEntity ---- exact association ----> CharacterProject
       ^                                         |
       |                                         v
  project semantics                       CharacterVersion
                                                 |
                                                 v
                                    Dialogue / Room / AgentSession

WorldProject -> WorldVersion -> WorldRun -> WorldSave/branch
                      |
                      +---- exact CharacterVersion actor binding
                      +---- optional ProjectEntity object association
```

Entity 更抽象，但不是继承层级。它允许文档、Canvas、角色与世界使用同一个项目语义锚点；Character
和 World 仍是可以独立存在、独立发布并拥有专门生命周期的聚合。

## Project Entity 的最小职责

Project Entity 只保存：

- 稳定 `entityId`、所属项目与 semantic kind；
- canonical/display name 与 aliases；
- active/deprecated 状态和显式 replacement identity；
- 用户确认的项目 representation bindings；
- owner 所需的创建、更新时间。

Entity 不保存 Character/World 定义、任意 facts bag、provider/model、角色记忆、故事线、运行状态、
使用次数、最近使用、出现位置、包发布 provenance 或互动会话。

candidate、mention、occurrence、availability 和 inferred relationship 是投影。AI、文件名和 Search 只
能提供候选证据；确认、合并、rebind 和 deprecate 必须由用户显式触发。

## Entity 与 Character

Standalone Character 不需要 Entity。项目内 Character 通过 Project owner 保存精确关联：

```ts
interface ProjectEntityCharacterAssociation {
  readonly entityId: string;
  readonly characterProjectId: string;
}
```

该记录位于精确 `ContentProjectComposition` 内，由外层 `contentProjectId` 确定所属项目，不在每条关联中
复制项目身份。

首阶段约束：

- 一个项目内 Character 精确关联一个本项目 Character Entity；
- 一个 Character Entity 可以不具备角色互动能力，最多关联一个 CharacterProject；
- 同一 standalone CharacterVersion 可被多个项目作为外部依赖引用，每个项目拥有自己的 Entity 关联；
- CharacterProject 不保存项目 `entityId`，避免把可复用角色绑死到一个项目；
- 对话启动必须携带精确 CharacterVersion，不推断 latest、active 或 current。

Entity 管理只提供命名、生命周期、binding 与引用检查。存在有效关联时，组合层可投影 Chara 提供的
“打开角色”“进入 Studio”“开始互动”，但这些 action 的 contract 与执行生命周期仍归 Chara。

## 创建角色

快速创建不需要先进入 Studio。手动输入、提示词、文件证据、普通 Asset representation 和已确认
Entity context 都是同一个 fresh CharacterProject 创建操作的 seed：

```text
manual / prompt / file evidence / Asset ref / Entity context
  -> Character Creator 或手动创作
  -> 用户确认目标位置和生成内容
  -> fresh CharacterProject draft
```

Studio 是完整创作工作区，用于继续编辑 definition、representation、voice、storyline 和版本关系；
它不拥有第二套角色格式或 repository。

项目内创建组合以下精确步骤：创建 CharacterProject、添加 Project membership、创建或选择
ProjectEntity、写入 association。部分成功必须展示 receipt，并只重试缺失步骤；不得回滚已保存的用户
内容或改用 active/recent 项目。`.neko-character` 仅是 Chara-owned ZIP 导入导出边界，不是快速创建
seed、实时 repository 或内部文件格式。

## 资源展示与管理

Resource Browser 提供一个 Resources 体验，并可按 Project Files、Shared Media、Installed Assets、
Project Elements 等来源筛选。结果必须携带 owner、精确 identity、可用性和 owner 声明的操作；选择、
搜索或预览不会转换身份。

管理操作仍按 owner 分离：

| 操作                                           | Owner          |
| ---------------------------------------------- | -------------- |
| 打开、读取、授权写入文件                       | Content / Host |
| add、relink、remove 媒体库连接                 | Media Library  |
| import、install、uninstall 素材包              | Asset Library  |
| confirm、rename、merge、deprecate、bind Entity | Entity         |
| 创建、编辑、发布、导入导出 Character           | Chara          |
| 创建、发布、运行、存档 World                   | World          |

普通素材只使用 Asset 生命周期；角色便携性使用 `.neko-character`；World 便携性由 World 在其依赖闭包
完整时定义。当前 canonical 产品路径不提供 Entity Asset 的 publish、instantiate、provenance 或
three-way update。

## 引用、使用信息与删除

每个消费者保存自己的权威引用，Search/SQLite 只保存可重建的 occurrence、usage count、recent-use、
dependency summary 与 availability projection。

删除、merge、uninstall 或移除版本前，owning application service 必须读取当前 typed reference owners。
使用量为零或投影缺失不能证明“没有引用”；reference reader 覆盖不完整时返回明确 blocker。

Entity 管理可以展示“在哪里使用”，但不成为引用 registry。文件事件或 owner notification 只触发投影
刷新，不能直接改写 Entity、Character、World 或项目事实。

## World 的首个闭环

首个可用 World 范围固定为：

```text
WorldProject -> immutable WorldVersion -> WorldRun -> WorldSave/branch
```

World 保存规则、初始事实、拓扑和 world-local committed state。Actor 引用精确 CharacterVersion；
地点或物体可选关联 ProjectEntity，用于项目内检索和跨文档一致性。World 不复制 Character definition、
故事线或长期记忆，也不把运行状态回写 CharacterVersion。

World Story、Gameplay、Experience 与 Presentation 只有在真实 producer、consumer、persistence 和 UI
路径同时存在后才进入生产 contract；Foundation 或测试 fixture 不代表完整数字世界已经可用。

## 本地数据与错误处理

- 项目事实和领域版本留在各自工作区目录；SQLite 只放用户级选择和可重建投影。
- 文件、Asset 包、Character、World 和 Conversation/Save bytes 不迁入通用 metadata 数据库。
- 被收窄 contract 无法读取的旧 Entity/Entity Asset 数据必须原样保留，并在对应记录展示 diagnostic；
  不在普通启动中迁移、丢弃或伪造默认值。
- 单条 Entity、binding、association 或 projection 失效只影响该项；其他项目、角色和世界保持可用。
- Desktop 只做路径/发送者授权、typed IPC 和可见 Root 组合，领域策略留在 owning package。

## 页面边界

| 页面                         | 职责                                                                   |
| ---------------------------- | ---------------------------------------------------------------------- |
| Resources                    | 搜索、筛选、预览和调用资源 owner 操作                                  |
| Character Management         | 角色目录、位置、版本状态、导入导出和进入 Studio/Interaction            |
| Character Creator            | 从不同 seed 快速生成同一种 CharacterProject draft                      |
| Character Studio             | 复用创作工作区编辑角色、素材、故事线、验证与版本图                     |
| Character Interaction        | 对话/Room Workbench；Interaction、Main、Manager、Timeline 等可见 slots |
| Entity Inspector             | 项目语义身份、aliases、bindings、候选证据与引用诊断                    |
| World Library / Studio / Run | 世界目录、创作、版本、运行、存档与分支                                 |

页面不是新的 durable Session owner。切换管理、创作或互动场景只改变 Window presentation；隐藏 Root
卸载，后台 Agent/World runtime 由其精确 identity 独立存续。
