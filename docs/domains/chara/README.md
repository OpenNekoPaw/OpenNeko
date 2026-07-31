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

阅读路径：

- [`architecture.md`](architecture.md)：owner、依赖、生命周期与错误边界；
- [`../../architecture/package-boundaries.md`](../../architecture/package-boundaries.md)：跨包约束；
- [`../../architecture/adr-agent-runtime-single-authority-and-simplification-boundary.md`](../../architecture/adr-agent-runtime-single-authority-and-simplification-boundary.md)：Agent 收敛顺序；
- [`../../../openspec/changes/define-character-authoring-and-runtime-mode-boundaries/`](../../../openspec/changes/define-character-authoring-and-runtime-mode-boundaries/)：角色创作、剧情运行、日常陪伴和记忆 owner 的目标设计；
- [`../../../openspec/changes/extract-neko-chara-domain-package/`](../../../openspec/changes/extract-neko-chara-domain-package/)：第一阶段 package owner 迁移的历史实施设计。

当前不支持 CharacterProject/CharacterVersion 持久格式、发布、NarrativeSave/World runtime、
UserCharacterRelationship、持久 CharacterRun 恢复、Companion Activity 或独立 Chara
Webview。这些能力需要后续独立 OpenSpec 和真实 Desktop 组合，不能由 Agent transcript、
Entity、Canvas Storyline、Webview state 或空 adapter 代替。
