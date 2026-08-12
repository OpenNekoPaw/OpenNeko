> Gated by [`simplify-resource-entity-character-world-boundaries`](../simplify-resource-entity-character-world-boundaries/):
> the ownership design remains valid, but Gameplay/Agent Play must not register a production repository,
> handler or ready state before a real consumer and persistence path are qualified.

## Why

作品内 Gameplay 需要独立规则、席位、动作与结果 authority；Agent Play 只负责理解、规划和经授权控制。若两者与 World facts 或外部 Game 混合，会产生第二状态源和越权提交。

## What Changes

- 定义 WorldGameplayDefinition、WorldGameSession、seat、observation/action space、rule、state、outcome 和 result verification。
- 定义 Agent Play 对 World Gameplay 与外部 Game 的共同窄 consumer boundary。
- 在 World Experience 中只组合 exact Gameplay/session refs，不复制 gameplay state 到 WorldSave。

## Capabilities

### New Capabilities

- `world-gameplay-and-agent-play-composition`: 作品内 Gameplay authority 与 Agent Play consumer 协作。

## Impact

- Owner：World Gameplay 拥有作品内规则/session/result；Agent 拥有 Play policy/control；外部 Game 保持自己的 facts。
- Runtime：World/Chara/Renderer 不解释或提交 Gameplay state。
- Data：Gameplay persistence 独立于 WorldSave 与 Agent transcript。
