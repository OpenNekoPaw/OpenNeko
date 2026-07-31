## Why

现有 Character 设计只区分 `CharacterProject -> CharacterVersion -> CharacterRun`，并把运行记忆概括为 CharacterRun candidate 或 WorldSave experience，无法表达剧情角色在分支、时间点和存档中的因果记忆，也无法表达日常陪伴中跨会话、属于用户与角色关系的长期记忆。继续复用单一 CharacterRun 和统一 promotion 路径会导致剧情记忆跨分支泄漏、日常记忆污染发布版本，或把陪玩、观影等活动状态错误交给 Chara。

## What Changes

- 区分角色创作定义与角色运行实例：`CharacterProject`/`CharacterVersion` 只拥有可发布角色 canon、策略和稳定表现绑定，运行状态通过显式 binding 创建。
- 将角色运行划分为互不切换的剧情运行 `narrative` 与日常陪伴运行 `companion`，使用判别身份、独立生命周期和不同 durable owner，不在活动 session 上切换 mode。
- 剧情运行绑定冻结的角色版本或创作调试 snapshot；剧情事实、分支、时间点、用户互动和角色可见记忆由 `NarrativeSave`/`WorldSave` 一类剧情运行 owner 持有，Chara 只消费因果一致的记忆视图。
- 日常陪伴只允许绑定已发布 `CharacterVersion`，新增用户与角色的持续关系聚合，拥有跨会话长期互动记忆、版本绑定历史、保留策略和隐私/删除边界。
- 角色版本升级不得改写旧存档或把互动记忆写入发布版本；剧情运行显式迁移 save revision/branch，日常陪伴显式重绑新版本并选择保留的关系记忆。
- 现实背景知识、媒体/游戏活动状态和工具结果保持外部上下文或 owning-domain 事实，只能产生可审阅的关系记忆候选，不能自动成为角色 canon 或长期记忆。
- 修订既有 Character/World 记忆归属：长期角色 canon、剧情存档记忆、日常关系记忆、运行期短期状态和派生 Memory infrastructure 分别拥有唯一 owner。
- 本变更只更新 OpenSpec 与稳定设计文档，不实现项目格式、runtime、Desktop route、Agent adapter、Memory store、UI 或数据迁移。

## Capabilities

### New Capabilities

- `character-authoring-runtime-modes`: 定义角色创作、发布版本、剧情运行、日常陪伴、关系实例、记忆可见性、活动组合和版本升级边界。

### Modified Capabilities

- `character-world-domain-aggregation`: 将原有 CharacterRun/WorldSave 二层记忆模型细化为 CharacterVersion canon、剧情 save memory、日常 relationship memory、run-scoped state 与派生 Memory infrastructure，并约束剧情运行对 World/Narrative owner 的依赖。

## Impact

- OpenSpec：新增角色创作与运行模式规范，并修订 Character/World 聚合记忆要求。
- 稳定文档：`docs/domains/chara/README.md`、`docs/domains/chara/architecture.md`、`docs/architecture/package-boundaries.md`。
- 后续设计：Character project/version codec、Narrative/World runtime、Companion relationship store、AgentSession binding、活动 capability 和 Desktop UI 必须遵循本变更。
- 当前代码与用户数据：无修改；现有 `@neko/chara` 仍是未接入 Desktop 的第一阶段内核，Character/World 产品路径继续 fail-visible。
