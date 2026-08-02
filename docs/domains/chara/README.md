# Chara 领域

Chara 是 Character 创作、发布版本、运行绑定和角色语义的 owner。当前第一阶段
host-neutral kernel 位于 `packages/neko-chara`，已从 Entity 和旧 Agent 宿主实现收回
Character Dialogue、Embody、角色证据、Profile Assembly 和角色 purpose operation，但没有
Desktop manifest consumer、Host adapter 或可用产品入口。

目标领域模型区分：

```text
CharacterProject
  -> CharacterVersion
       -> narrative run：剧情角色，记忆由 NarrativeSave/WorldSave 的分支和时间点决定
       -> companion run：日常陪伴，记忆由 UserCharacterRelationship 跨会话持有
```

产品可以使用“剧情模式 / 日常模式”文案；领域契约使用 `narrative / companion`。两种运行
拥有不同 durable owner、版本升级和 capability policy，不能在同一活动 session 上切换，也
不能默认互相召回记忆。

角色互动产品由两个正交维度组合，而不是建立四套平行会话 runtime：

| 角色数量 | `dialogue`             | `play`                       |
| -------- | ---------------------- | ---------------------------- |
| 单角色   | 单角色对话             | 单角色代打、陪玩、观战或指导 |
| 多角色   | 多角色聊天室或场景排演 | 多角色聊天室 + 游戏 Activity |

每个 agent-controlled character 拥有独立 CharacterRun 和 primary AgentSession；多人房间只
共享 revisioned room timeline，不共享 responder、transcript、模型配置或可变记忆。产品中的
Play 通过内部 Play-use、Game/Activity 与受控 Computer Use 实现，Chara 不拥有游戏状态、
窗口/设备 handle 或输入注入。
`Embody Character` 仍是“用户扮演角色、Agent 提供只读反馈”的创作验证流程，不等同于
Play。

技术上，LLM 负责角色表达、规则理解、长期策略、协作、记忆查询和上下文编排；VLA 或等价
低延迟 control policy 负责实时游戏的短时视觉—语言—动作闭环。角色记忆、Agent transcript、
游戏状态、游戏经验和当前 turn context 分属不同 owner。新游戏优先通过通用 observation/action
profile、规则/教程检索、用户示范、有限试玩、结果验证和 in-context experience 快速适应，
而不是为每款游戏重新训练模型或增加专用角色 Agent。

对话记忆使用三个互斥 scope，但 `workspace` 不是第三种角色运行模式：

```text
workspace conversation -> Workspace Memory，不进入角色记忆
narrative conversation -> NarrativeSave/WorldSave revisioned event
companion conversation -> transcript evidence -> accepted relationship memory
```

时间、空间和叙事密度只用于聚合、摘要粒度、冗余控制和召回多样性；新颖性、重复度、
连接性、情感强度、用户明确重视和事件后果形成可解释的显著性证据。Scope、分支、时间点、
角色认知、权限、敏感性和删除状态的硬过滤始终先于密度、显著性、关键词或 embedding 排序。
Chara 必须保留显著性依据，但不持久化单一 `importance` 分数；密度只是可选的可重建优化，
首版不要求核密度估计、叙事图指标或其他连续分布模型。

阅读路径：

- [`architecture.md`](architecture.md)：owner、依赖、生命周期与错误边界；
- [`../../architecture/package-boundaries.md`](../../architecture/package-boundaries.md)：跨包约束；
- [`../../architecture/adr-agent-runtime-single-authority-and-simplification-boundary.md`](../../architecture/adr-agent-runtime-single-authority-and-simplification-boundary.md)：Agent 收敛顺序；
- [`../../../openspec/changes/define-character-chatroom-play-use/`](../../../openspec/changes/define-character-chatroom-play-use/)：尚未实施的聊天室与 Play-use 规格、设计和任务；

当前不支持 CharacterProject/CharacterVersion 持久格式、发布、NarrativeSave/World runtime、
UserCharacterRelationship、持久 CharacterRun 恢复、Companion Activity 或独立 Chara
Webview，也不支持多角色 room、Game Activity、Play-use Host port 或游戏控制。这些能力需要
后续真实 Desktop 组合与运行态资格验证，不能由 Agent transcript、Entity、Canvas Storyline、
Webview state、普通 Character Dialogue 或空 adapter 代替。
