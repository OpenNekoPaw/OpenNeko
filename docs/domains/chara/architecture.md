# Chara 领域架构

## 当前状态

`@neko/chara` 是 Character Dialogue、Embody、角色证据、Profile Assembly、角色 purpose
operation 和未来角色运行编排的语义 owner。当前 package 只保留 host-neutral
core/application/testing，没有 Desktop Host adapter 或 manifest consumer；Electron Character
routes 在 P1.6 composition 完成前保持 unsupported。

“package 已存在”只表示第一阶段 owner 已收敛，不表示 CharacterProject、剧情模式、日常模式
或角色会话已经成为 Desktop 产品能力。

## Owner 与事实模型

```text
CharacterProject
  -> publish immutable CharacterVersion
       -> NarrativeCharacterBinding -> NarrativeCharacterRun
       -> CompanionBinding -> UserCharacterRelationship -> CompanionRun
```

- `CharacterProject` 拥有草稿、候选、角色 canon 创作、测试、审阅和发布。
- `CharacterVersion` 拥有不可变的角色 canon、知识边界、角色策略和稳定表现绑定。
- `NarrativeCharacterRun` 拥有剧情角色的活动编排；剧情事实和记忆由
  NarrativeSave/WorldSave 拥有。
- `UserCharacterRelationship` 拥有本地用户与发布角色的跨会话关系记忆、版本绑定历史和
  retention/privacy policy。
- `CompanionRun` 拥有一次日常互动或陪伴活动的短期上下文、候选记忆和运行资源。
- Agent transcript、UI tab、Canvas Storyline 和 Memory index 都不是上述事实的 owner。

`@neko/entity` 只提供通用 Entity identity、alias、occurrence、可重建 relationship
projection、representation 和稳定 ref。Content/Assets、Renderer、Voice、Media、Game、
Device 和其他 Activity owner 继续拥有各自事实与执行实现。

## 分层与依赖

```text
@neko/chara/core
  -> shared stable refs / domain values

@neko/chara/application
  -> chara/core
  -> package-local AgentSession / memory / environment / activity consumer ports

adapters/agent|world|activity
  -> @neko/chara/application
  -> public owning-domain contracts

apps/neko-desktop
  -> public Chara entry
  -> concrete Agent / Entity / Content / World / Activity adapters
```

Core/Application 不导入 Electron、React、Agent runtime implementation 或其他领域的 Host
implementation。Chara 只能消费 Agent contract，不创建 `RoleplayAgent`、
`CharacterAgentExecutor` 或第二套 Tool/Task/Session loop。Agent core/platform/Webview
不反向依赖 Chara；Desktop 未完成 Chara composition 时必须保持 capability unavailable。

## 角色创作与运行生命周期

运行必须绑定冻结的 CharacterVersion。Character Studio 可以为创作调试生成带 identity 和
source revision 的 authoring-test snapshot，但它不能进入 Home 角色库、正式剧情或日常陪伴。
CharacterProject draft 更新不得静默改变已启动运行。

产品文案可以使用“剧情模式 / 日常模式”，领域 contract 固定为
`narrative / companion`。Runtime kind 在创建时确定，不能在活动 CharacterRun 上切换；
切换体验必须创建新的 run、policy snapshot、memory binding 和 AgentSession mapping。

每个 active CharacterRun 至多映射一个 primary AgentSession。Companion relationship 可以
顺序创建多个 run/session，但不能通过共享 responder、active tab 或会话参数切换模拟并发实例。

## 剧情运行

剧情运行固定路径为：

```text
WorldVersion / accepted NarrativeDefinition
  -> WorldRun / NarrativeRun
  -> NarrativeSave
  -> branch + checkpoint/timepoint
  -> WorldActorInstance
  -> NarrativeCharacterRun
  -> primary AgentSession
```

当前架构由 World 拥有规则、事件、branch、save 和 replay。Chara 通过窄
Narrative/Environment port 消费授权状态，不创建第二套 Storyline/save engine；Canvas
Storyline 仍只是内容路线与播放投影。

剧情记忆必须先由 save owner 按 save、branch ancestry、checkpoint/timepoint、actor
knowledge scope 和 event revision 过滤，再交给 Memory infrastructure 排序、压缩或语义召回。
其他分支、未来事件、未感知事件和另一个 save 的用户互动不得进入当前角色上下文。剧情用户
互动属于 save event history，不自动进入日常关系或 CharacterVersion。

World/Narrative runtime 未实现时，剧情运行必须返回 unavailable diagnostic。

## 日常陪伴

日常陪伴只允许发布的 CharacterVersion，并以 Chara-owned `UserCharacterRelationship`
作为 durable owner：

```text
UserCharacterRelationship
  -> current CharacterVersion ref
  -> accepted relationship memory
  -> version binding history
  -> retention / privacy policy
  -> CompanionRun -> primary AgentSession
```

日常上下文由五个独立投影组合：

1. CharacterVersion 初始角色信息；
2. 已授权的 RelationshipMemory view；
3. 带 source/freshness 的 RealityContext snapshot；
4. 当前 Media/Game 等 Activity context；
5. 当前 effective capability snapshot。

现实背景、模型常识、Tool output 和 Activity state 不是长期记忆。用户消息、工具结果和活动
事件只能产生带 source、sensitivity、retention class 和 revision 的 memory candidate；最终
由 relationship owner 接受、拒绝、更正或删除。凭据、私密文件、临时 URL、完整外部 payload
和 live handle 不得进入关系记忆。

## 版本升级

- 剧情 save 默认固定启动时的 CharacterVersion。升级必须显式创建兼容的新 save revision
  或 branch，不改写旧 event 和 replay。
- 日常陪伴通过新的 relationship binding revision 切换 CharacterVersion，并明确把现有记忆
  分类为 retained、quarantined 或 discarded。
- “向新版本追加记忆”表示继续绑定选中的关系记忆，不表示修改发布版本。
- 只有独立的角色设计 insight 经过 CharacterProject 审阅并发布新版本，才能改变角色 canon。

## Agent 与 Activity

剧情和日常运行都复用 Pi/AgentSession 的 turn、Tool Call、Approval、取消、transcript、
compaction 和 event canonical path。`ICapabilityPurposeTextRuntime` 只适用于无会话、无工具的
profile extraction/evaluation 等 bounded operation，不能承载多轮 CharacterRun。

陪玩、观影和其他活动由 owning domain 执行：

```text
CompanionRun
  -> primary AgentSession
  -> typed Tool Call / Activity request
  -> Media / Preview / Game / Device owner
  -> ActivitySessionRef + authorized observation
  -> relationship memory candidate
```

Chara 不拥有媒体播放、游戏状态、设备 handle、任意输入控制或外部应用状态，只保存稳定
Activity ref、参与策略和经筛选的记忆候选。

剧情有效能力使用 Host permission、workspace trust、CharacterVersion policy、World binding
policy 与 NarrativeRun scope 的交集；日常有效能力使用 Host permission、workspace trust、
CharacterVersion policy、relationship policy 与 Activity scope 的交集。任何层只能收窄授权。

## 记忆所有权

| 事实或派生能力                      | 唯一 owner                           |
| ----------------------------------- | ------------------------------------ |
| 角色 canon、知识边界和记忆策略      | CharacterProject / CharacterVersion  |
| 剧情事件、关系、分支和用户互动      | NarrativeSave / WorldSave            |
| 日常跨会话长期互动记忆              | UserCharacterRelationship            |
| 当前短期上下文与未提交候选          | NarrativeCharacterRun / CompanionRun |
| embedding、压缩、索引和召回排序     | 可重建 Memory infrastructure         |
| transcript、Tool Call 与 compaction | AgentSession                         |

同一 CharacterVersion 的剧情和日常运行默认完全隔离记忆。未来跨模式导入必须通过独立、
显式、带 source/target identity 的 review transaction，不能由共享版本、语义相似或 active
selection 自动触发。

## 项目证据链路

第一阶段角色证据语义继续沿以下 canonical path 装配，未来实现必须改用 Desktop-safe
ContentLocator/Content port，不能恢复旧 VS Code file adapter：

1. Entity 通过稳定 `CreativeEntityRef` 提供 canonical name、display name 和 aliases，不负责角色问题检索或 prompt 组装。
2. Chara 分别以非空角色名称和别名调用 Project Search，并按稳定 Search item ID 去重。当前回合问题和内部 Entity ID 不得进入 `story-symbols` 查询。
3. Search 只返回项目内场景或角色 locator；其全局 token 匹配语义不因角色场景而改变，也不负责索引完整对白正文。
4. Desktop 注入的 Content/file port 校验 locator 的项目边界和受支持扩展名，并读取场景正文。
5. Chara Core 按当前回合问题、角色身份、来源权威性、新鲜度和预算排序、去重并裁剪正文。
6. Character session 只把最终 evidence bundle 注入当前 responder system prompt，不把证据写入 transcript 或持久 profile source。

Profile Assembly 与 Character Dialogue/Embody 的单轮证据加载复用同一组 Chara application
ports。不得恢复 Dashboard evidence reader、宽泛 workspace 搜索、Agent memory 或模型常识
fallback。Search 成功但没有角色场景是合法空证据；Entity/Search 等必需依赖失败必须终止
当前启动或回合，并且不得调用 responder。

角色模型选择与证据检索是两条独立契约。角色用途使用全局 `character.dialogue` / `character.profile` 精确绑定；Chara 不复制 Agent 会话级模型切换状态，也不在绑定或证据失败时回退 Agent/default model。

## 错误与演进边界

- 缺失 CharacterVersion、workspace、Entity identity、required evidence、save/branch/checkpoint、
  relationship revision、Activity owner、permission 或非法 run/session 必须返回明确 diagnostic。
- 不得回退 active run、另一运行模式、旧版本、普通 Agent conversation 或 empty-memory success。
- 旧 Entity Character runtime 和 Agent-owned controller 已删除，不提供 compatibility re-export。
- 跨包 `Npc*` DTO 与 Agent Webview 角色投影暂时保留在共享 contract/Chat shell；Chara 是语义 owner，后续迁移必须单独设计 wire/persistence 兼容。
- 现有 `character-memory.json`、路径型 ref 和 `Npc*` DTO 不自动成为新关系/存档格式；后续
  contract OpenSpec 必须明确迁移、重建、拒绝或有意忽略策略。
- CharacterProject/Version、NarrativeSave/World、UserCharacterRelationship、持久恢复、
  Companion Activity 和独立 Webview 未实现时必须 fail-visible。
