## Context

前置条件是 deterministic runtime 和至少一个真实 Interaction Surface。Agent Evaluation 由 `scripts/agent-eval` 拥有，不进入产品 package、Skill 或 CI 通用入口。

## Decisions

- 每个 AI role 使用现有 canonical AgentSession path，不创建 World-specific loop。
- required capability 缺失只使相关 Experience/profile unavailable；optional 缺失产生 diagnostic，不能自动替换。
- stream/chunk/proposal 绑定 exact Run/branch/participant/turn/source revision；取消或新 intent 后迟到结果不能提交或渲染。
- 资格以真实目标环境测量；mock、dry-run 或 key-free harness 只证明编排 readiness。

## Security And Data

模型只消费 participant-scoped WorldView 和显式授权资料。模型输出是不可信 proposal，只有 owning service 可以接受事实。凭据不得进入 prompt、WorldSave、artifact 或报告。
