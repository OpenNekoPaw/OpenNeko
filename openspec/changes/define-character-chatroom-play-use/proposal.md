## Why

Chara 当前只定义单角色 Character Dialogue/Embody 内核，尚未为单角色、多角色、对话或游戏建立统一的产品模型，也没有明确 LLM、VLA、角色记忆、上下文和跨游戏快速学习的技术边界。若直接把多个角色或键鼠控制塞入现有 Dialogue session，或为每款游戏开发特化 Agent，会混淆 AgentSession、角色记忆、游戏事实和 Desktop 输入权限，并使能力无法泛化。

## What Changes

- 产品层定义由 `single-character / multi-character` 角色拓扑和 `dialogue / play` 互动类型组合出的四种预设：单角色对话、多角色对话、单角色 Play、多角色 Play；`play-use` 只作为 Play 的技术执行机制。
- 区分 CharacterVersion、CharacterRun、room participant、AgentSession、ActivitySession 和 Desktop Host control session；角色数量不得通过共享 responder 或切换 active identity 模拟。
- 定义每个 Agent-controlled participant 的固定角色版本、运行/对话/参与策略、精确模型绑定、记忆 owner 和不可变 turn snapshot。
- 定义分层 LLM/VLA 架构：LLM 负责角色表达、长期目标、策略、协作和上下文编排，VLA/控制模型负责短时视觉—语言—动作闭环；回合制策略、实时动作和多人游戏按同一抽象选择不同执行路径。
- 分离角色长期记忆、剧情/关系记忆、Agent transcript、游戏状态、游戏经验和当前 turn context；原始帧、控制 handle 和游戏存档不得污染 CharacterVersion。
- 定义跨新游戏的快速适应路径：通过通用 Game Capability Profile、结构化/视觉 observation、标准 action space、规则/教程检索、用户示范、短期 episode experience 和验证反馈进行 in-context adaptation，不要求重新训练或为每款游戏增加专用模型。
- 定义 Play-use 的 `commentator`、`coach`、`co-player`、`delegate` 角色，以及 per-seat exclusive control lease、Pause/Stop/Take over、目标重验、观察范围、step budget 和结果证据。
- 规定多角色房间拥有唯一有序 timeline；公开发言和同席位动作串行提交，角色只接收授权可见的 observation，房间记录不得自动成为长期角色记忆。
- 保留现有 Character Dialogue/Embody 的单角色语义；Play-use 复用唯一 Pi/AgentSession、Tool Call、Activity 和 qualified Computer Use 路径，不扩展为第二套 GUI Agent loop。
- 本变更只建立设计、规格和稳定架构文档，不宣称 Character room、Game/World runtime、Play-use Host port 或 Desktop 产品入口已经可用。

## Capabilities

### New Capabilities

- `character-interaction-sessions`: 定义单/多角色与 dialogue/play 产品组合、participant/controller identity、房间 timeline、角色运行配置、上下文物化、发言调度、观察和记忆边界。
- `character-play-use`: 定义 Play 的 LLM/VLA 分层、通用游戏能力描述、免重训练快速适应、角色代打/陪玩 Activity、游戏席位控制 lease、Computer Use 目标绑定、用户接管、安全与验证语义。

### Modified Capabilities

无。

## Impact

- `@neko/chara` 继续拥有 Character identity/version/run、参与策略和记忆候选；不拥有游戏规则、窗口、设备 handle 或输入注入。
- 未来 `neko-world` / Game Activity owner 拥有 Gameplay、游戏状态、席位、动作校验、存档和 observation；当前缺失时保持 unavailable。
- Game Activity owner 还拥有可重建的 Game Capability Profile、规则/动作 schema、episode experience 和 adaptation artifact；这些不是 Character memory，也不包含重新训练后的私有模型权重。
- `@neko/agent-runtime` 继续拥有唯一 Pi/AgentSession、conversation/turn、Tool Call、模型和不可变配置快照，不增加 Character-specific Agent loop。
- Desktop Main 未来只实现 sender-bound Activity/Computer Use Host adapter、精确 target binding、OS 权限、输入原语和 lifecycle；Renderer 只消费房间与 live activity 投影。
- 稳定文档更新 `docs/domains/chara/README.md`、`docs/domains/chara/architecture.md` 和 `docs/architecture/package-boundaries.md`；详细未实施设计保留在本 OpenSpec。
