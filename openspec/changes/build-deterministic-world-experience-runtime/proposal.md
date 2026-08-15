> Gated by [`simplify-resource-entity-character-world-boundaries`](../simplify-resource-entity-character-world-boundaries/):
> this change must not add a production Experience repository, handler or ready state until the
> optional-capability audit proves a real producer, consumer, persistence path and user surface.
>
> Foundation handoff (2026-08-14):
> [`refine-world-management-authoring-and-runtime`](../refine-world-management-authoring-and-runtime/)
> owns deterministic Foundation authoring/runtime and persistence. This change remains gated to the
> future Story/Experience composition that is not implemented by that first closure and MUST consume,
> rather than duplicate, the canonical WorldVersion/Run/Save path.

## Why

Foundation 能验证单一 World 事实链，但尚未提供完整的 headless authoring/publication、World Story progress、Experience binding 和可靠 Save/branch/replay 闭环。该闭环应先在无 Electron、Renderer 和 AI provider 的条件下成立。

## What Changes

- 实现 World/Story/Experience authoring、不可变 publication 和 exact dependency validation。
- 实现 owner-qualified intent/event/state、Story progress candidate、participant WorldView 与 deterministic ExperienceRun composition。
- 实现 atomic persistence、checkpoint、branch、restore 和 model-free replay。

## Capabilities

### New Capabilities

- `deterministic-world-experience-runtime`: 可脱离 UI/AI 运行的 World/Story/Experience application 与 persistence 闭环。

## Impact

- Owner：`@neko/world` application 与 `@neko/world-node` concrete repository adapter。
- Runtime boundary：Node 文件/SQLite adapter 只做持久化，不拥有业务路由。
- Data：新增用户管理的 immutable publications、Runs、Saves 和 branches；不迁移或覆盖现有 Foundation data。
