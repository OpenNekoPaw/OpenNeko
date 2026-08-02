## Why

OpenNeko 已退役 TUI Agent Host，但当前 Agent Evaluation 只有 schema/dry-run 能力，真实
`runV2Case()` 因缺少 Desktop complete-session driver 始终 `infrastructure-blocked`。这使 Prompt、
Skill、Tool、模型、配置和工作流变更无法获得批量、可重复且命中唯一产品路径的真实行为证据，
现有消融计划也仍混有 TUI/legacy `AgentSession` 语义。

## What Changes

- 增加 Desktop-owned complete-session evaluation driver，以隔离 Electron fixture 驱动真实
  Renderer/preload、sender-bound Agent controller、Pi Session、Tool/Skill、permission、Timeline、
  persistence、reload/resume 和 disposal 路径。
- 增加批量 Evaluation matrix 调度：展开 suite/case/config/model/build/repetition，使用有界并发、
  独立 `userData`/Workspace/Conversation/端口、预算、分片和 fail-visible outcome。
- 将真实实验分为隐藏窗口的 Desktop Session Matrix 与少量可见 Desktop Acceptance；两者共享同一
  Desktop runtime、driver 和事实契约，不能形成第二套 Agent Host。
- 增加产品拥有、session-scoped 的有效 Agent 配置投影，覆盖支持的模型和运行时设置，并输出稳定
  identity、来源与 digest；Evaluation 不得注入产品不存在的业务开关。
- 收敛配置消融与实现消融：配置变体复用同一 Desktop 构建，Prompt/Skill/router/runtime 实现变体
  使用隔离 revision/build；所有变体复用场景拥有的 canonical-path 断言。
- 迁移现有 TUI 风格消融描述，归档历史 TUI 结果为不可与 Desktop baseline 比较的证据；删除
  `AgentSession`、TUI AppPort、自由文本路径替换等成功验收路径。
- 保持 key-free 校验、artifact validator、Judge、comparison 和报告在外部 Evaluation 平台，Desktop
  只执行真实产品会话并暴露有界、中立 facts。

## Capabilities

### New Capabilities

- `desktop-agent-evaluation-driver`: 隔离启动和控制唯一 Desktop Agent 产品路径，执行完整会话并提供
  中立、可断言的运行时与生命周期证据。
- `agent-evaluation-matrix`: 批量选择、展开、调度、分片和汇总真实 Agent Evaluation 样本，并实施
  并发、成本、超时、隔离与失败分类策略。
- `agent-ablation-experiments`: 对产品支持的动态配置和隔离实现构建执行可比消融，管理 baseline、
  fingerprints、重复采样、硬门禁、领域 validator、盲化 Judge 与历史 TUI 结果边界。

### Modified Capabilities

<!-- None. The change depends on the active desktop-agent-home-integration contract without changing it. -->

## Impact

- `apps/neko-desktop`: evaluation-neutral launch control、隐藏窗口运行、complete-session control/facts、
  Agent 有效配置投影、隔离生命周期与安全退出。
- `scripts/desktop-functional`: 复用进程、fixture、`userData`、CDP/控制端口和脱敏观测基础，但不拥有
  Agent suite、评分或实验语义。
- `scripts/agent-eval`: 恢复真实 `runV2Case()`、Worker Pool、matrix/shard/budget、Desktop driver adapter、
  配置/实现消融、comparability、报告和 TUI baseline 迁移。
- `packages/agent/runtime` 与 package-owned contracts：仅在现有产品契约缺少通用有效配置或中立
  facts 时扩展最小 host-neutral contract；不得加入 Evaluation suite、score、variant 或 pass/fail 概念。
- 依赖 `integrate-desktop-agent-home` 的唯一 Agent controller、Pi/session、permission、Tool/Skill 和
  projection 组合；该依赖未完成时真实 case 必须保持 `infrastructure-blocked`。
- 不恢复 `apps/neko-tui`，不增加直接 runtime/`AgentSession` runner，不把 provider-backed Evaluation
  或可见 Electron UI 验收加入通用 CI。
