## Why

现有 Character 运行模式设计已经区分剧情存档记忆与日常关系记忆，但尚未定义工作区聊天、
剧情对话和日常对话如何进入各自的 durable owner，也未定义长期记忆的写入、纠错、删除、
聚合、密度和显著性语义。若直接复用 Agent transcript、项目 Markdown memory 或全局向量召回，
会造成工作区事实污染角色、剧情跨分支泄漏、日常对话无差别持久化，以及动态召回分数被误当成
领域事实。

## What Changes

- 定义互斥的 conversation memory scope：普通工作区聊天归 Workspace Memory，剧情对话归
  NarrativeSave/WorldSave，日常对话的 accepted memory 归 UserCharacterRelationship；
  `workspace` 不是第三种 CharacterRuntimeKind。
- 要求 scope 和 owner identity 在会话创建时固定，所有写入、召回、压缩和删除携带显式
  workspace、save/branch/checkpoint/actor 或 relationship identity，不从 active UI 推断。
- 将剧情对话建模为 revisioned save event；只有提交成功、位于当前因果路径且角色可感知的
  事件可以进入剧情记忆视图，回到旧时间点继续互动必须创建新分支。
- 将日常 transcript 与 relationship memory 分层：对话可以作为跨会话证据和记忆候选来源，
  但只有经过关系策略接受的用户事实、边界、约定、共同经历、里程碑和主题摘要进入长期召回。
- 定义 `proposed -> accepted/quarantined/rejected -> superseded/deleted` 生命周期、来源追踪、
  敏感性、retention、用户置顶、纠错和派生索引失效规则。
- 将时间、空间和叙事密度定义为 owner 授权集合上的可重建统计投影，用于聚合、摘要粒度、
  冗余控制和召回多样性，不用于扩大记忆可见范围或证明事实。
- 将新颖性、重复度、连接性、情感强度、用户明确重视和后果定义为可解释的显著性证据；
  当前任务相关性保持 recall-time 动态信号，不写回 durable salience。
- 规定 scope/visibility/permission/retention 的硬过滤先于关键词、embedding、密度、显著性和
  task relevance 排序；embedding、摘要和图指标保持可删除重建的派生能力。
- 本变更只更新 OpenSpec 与 Chara 稳定设计文档，不实现 runtime、store、schema、Agent adapter、
  Desktop UI、embedding、迁移或真实记忆 evaluation。

## Capabilities

### New Capabilities

- `character-memory-lifecycle-and-retrieval`: 定义工作区、剧情和日常对话的记忆作用域，剧情存档
  与日常关系记忆的写入生命周期，以及记忆密度、显著性、聚合、召回和用户控制边界。

### Modified Capabilities

无。

## Impact

- OpenSpec：新增 Character memory lifecycle/retrieval capability，依赖
  `define-character-authoring-and-runtime-mode-boundaries` 已确定的 owner 和 runtime kind。
- 稳定文档：更新 `docs/domains/chara/README.md`、`docs/domains/chara/architecture.md` 与
  Character/Home Project Profile ADR 的记忆 owner 表；系统级 package boundary 已表达 owner
  隔离，本次领域内部细化不重复修改。
- 后续实现：Conversation scope contract、NarrativeDialogueEvent、RelationshipMemoryRecord、
  memory candidate policy、revisioned store、derived retrieval index 和用户记忆管理界面必须遵循
  本变更。
- 当前代码和数据：无修改；`.neko/memory.md`、Pi compaction、SharedMemoryStore 和旧
  `character-memory.json` 均不自动成为 Chara 长期记忆实现。
