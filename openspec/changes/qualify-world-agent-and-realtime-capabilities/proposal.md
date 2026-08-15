## Why

> Foundation dependency clarification (2026-08-14): this capability consumes the exact Foundation
> Run/View path established by `refine-world-management-authoring-and-runtime`; it is not required for
> deterministic basic World runtime and MUST NOT replace its owner, facts or success semantics.

World 的 Agent roles 与实时表现只有在精确 capability binding、延迟/取消资格和安全评估成立时才能进入消费路径。缺少资格时必须拒绝相关 capability，不能切换 provider、profile 或事实来源。

## What Changes

- 通过现有 Pi/AgentSession 组合 Intent Interpreter、Character Agent、Director、Narrator 等独立 scope。
- 实现作品级 required/optional capability resolution、qualification receipt、stream continuity、interrupt/cancel 和 stale-result rejection。
- 建立真实 provider Evaluation 与可见/隐藏 Desktop 证据，不新增产品 Skill 或第二 Agent controller。

## Capabilities

### New Capabilities

- `world-agent-and-realtime-qualification`: World Agent role composition 与实时能力资格/失效语义。

## Impact

- Owner：Agent runtime 继续拥有 session/turn/tool/approval；World owner 只提供授权 view 和接收 typed proposal。
- External boundary：provider/model/credential 只在 provider adapter 与现有配置 owner 中解析。
- Data：receipts 不保存 secrets 或隐藏模型状态，也不成为 World facts。
