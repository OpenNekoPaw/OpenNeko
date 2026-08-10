## Context

本 change 只在出现真实作品内玩法需求后实施。它依赖 canonical World/Experience contracts，但不修改 World fact authority、外部 Game authority 或 Agent loop。

## Decisions

- WorldGameplayDefinition 与 WorldGameSession 是独立 aggregate/runtime owner。
- Agent Play 消费 owner-scoped observation 并提交 proposal/control request；对应 Gameplay/Game owner 校验动作和结果。
- user-controlled seat 不创建隐藏 Agent；agent-controlled seat 必须绑定 exact AgentSession/lease identity。
- Gameplay failure 只影响对应 session，不修改 World/Character facts，也不自动改走外部 Game 或 deterministic shortcut。

## Canonical Path

`Gameplay observation -> Agent Play plan/proposal -> owning Gameplay/Game validation -> committed gameplay result -> typed cross-owner candidate`。

## User Data

Gameplay state/result 由 Gameplay repository 保存；WorldSave 只保留 exact composition/persistence ref，不嵌入其状态。
