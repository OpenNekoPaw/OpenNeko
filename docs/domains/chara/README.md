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
- [`architecture.md`](architecture.md)：角色创作、剧情运行、日常陪伴、记忆 owner、生命周期与显著性边界；

当前不支持 CharacterProject/CharacterVersion 持久格式、发布、NarrativeSave/World runtime、
UserCharacterRelationship、持久 CharacterRun 恢复、Companion Activity 或独立 Chara
Webview。这些能力需要后续独立 OpenSpec 和真实 Desktop 组合，不能由 Agent transcript、
Entity、Canvas Storyline、Webview state 或空 adapter 代替。
