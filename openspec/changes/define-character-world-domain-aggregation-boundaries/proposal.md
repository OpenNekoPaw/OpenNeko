## Why

现有 Desktop Project Profile ADR 已经把角色 IP 和互动世界定义为两类闭合项目，但尚未冻结对应的顶级领域 owner。缺少这一层时，角色对话、记忆、形象、设备感知、Gameplay 和世界运行容易继续堆入 `neko-agent`、`neko-assets`、`neko-preview` 或应用宿主，也可能让角色项目与世界项目分别实现一套 Agent、NPC、记忆和 Gameplay 状态机。

角色和世界都需要组合多个既有或未来能力，但组合能力不等于拥有所有底层实现。本变更需要明确 `neko-chara`、`neko-world` 的聚合根、依赖方向、运行身份和跨域 handoff，使后续实施可以复用唯一 Pi/Agent canonical path，同时保持角色版本、世界存档和表现/设备实现各有唯一 owner。

## What Changes

- 将拟议的 `packages/neko-chara` 与 `packages/neko-world` 定义为平级顶级领域聚合包，而不是 `neko-agent` 子包或 Desktop 应用内部模块。
- `neko-chara` 以 `CharacterProject -> CharacterVersion -> CharacterRun` 为聚合主线，拥有角色 IP 的创作、版本发布、运行策略和角色能力绑定。
- `neko-world` 以 `WorldProject -> WorldVersion -> WorldRun -> WorldSave/Replay` 为聚合主线，拥有世界创作事实、规则/事件、运行、存档和回放。
- 两个领域都复用同一个 `neko-agent`/Pi Agent loop；角色扮演、NPC 决策和 World Agent 不得形成第二套通用 Agent runtime。
- 世界只通过已发布 `CharacterVersion` 和显式 `WorldCharacterBinding` 使用可复用角色；世界局部身份、关系、经历和 Gameplay 状态归 `WorldSave`，不得静默回写全局角色版本。
- 角色只拥有说话、动作、表情、移动、感知、交互 affordance 和个体行为策略；地图、任务、战斗、经济、成长、事件调度和整体胜负规则归世界领域。
- Agent、Entity、Assets、2D/3D、Voice、Device/Perception、Engine 和 Gameplay 的具体实现继续留在各自 owner；`neko-chara`、`neko-world` 通过稳定 ref、port、capability contribution 和宿主注入组合。
- 应用 Host 只负责构造、注入和生命周期，不拥有角色回合、NPC 决策、世界 action、记忆晋升或领域 mutation 编排；这些分别由 Character/World application service 拥有。
- 明确 CharacterRun、WorldActorInstance、Ambient NPC、World Director 与 AgentSession 的唯一映射，禁止同一 actor 被 Character 和 World 各自创建一套智能 session。
- 有效工具集由 Host permission、workspace trust、Character policy、World binding policy 和 run scope 取交集；任何层只能收窄能力，不能扩大上游授权。
- Character 对世界的操作使用带 `worldRunId`、actor identity、action identity 和 expected revision 的事务请求；只有 World runtime 可以提交世界 mutation。
- 明确 CharacterVersion、CharacterRun、WorldSave 和共享 Memory infrastructure 的事实/派生边界，以及持久 ref 与 host-private Device/Renderer/Engine handle 的隔离。
- 明确当前变更只冻结架构边界，不宣称 Character/World package、Device/Live、Puppet/Scene 或持久 2D/3D runtime 已实现。

## Capabilities

### New Capabilities

- `character-world-domain-aggregation`: 定义角色 IP 与互动世界顶级领域聚合包、聚合根、Agent 复用、角色版本到世界绑定、Gameplay/记忆所有权和依赖方向。

### Modified Capabilities

无。稳定 spec 当前没有 Character/World 顶级领域聚合包的基线能力。

## Impact

- 架构文档：Desktop Project Profile ADR、package boundaries 和架构导航。
- 后续包设计：拟议的 `packages/neko-chara`、`packages/neko-world` 及其 host/UI adapter。
- 跨域契约：`CharacterVersionRef`、`WorldCharacterBinding`、run/save/replay identity、角色/世界 capability contribution 和环境交互 port。
- 应用契约：Character/World application service、Agent session port、有效 capability policy、revisioned WorldAction 和显式 memory promotion。
- Agent：继续复用现有 Pi canonical path，不修改 Prompt、Skill、Tool routing 或运行时代码。
- 当前代码与用户数据：本变更不新增 package、不迁移格式、不恢复已删除产品路径，也不修改现有角色对话行为。
