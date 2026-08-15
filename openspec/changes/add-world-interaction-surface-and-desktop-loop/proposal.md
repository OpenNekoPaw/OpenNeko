> Gated by [`simplify-resource-entity-character-world-boundaries`](../simplify-resource-entity-character-world-boundaries/):
> Foundation surfaces may consume only existing exact World owners. Experience-ready UI or success paths
> remain unavailable until their runtime producer, persistence and product qualification are complete.
>
> Foundation handoff (2026-08-14):
> [`refine-world-management-authoring-and-runtime`](../refine-world-management-authoring-and-runtime/)
> supersedes this change's Foundation Library, Studio and Runtime surface scope. This change may proceed
> later only for a fully qualified WorldExperience interaction surface and MUST NOT register parallel
> Foundation scenes, IPC, Webview Roots or product availability.

## Why

Headless World 能力只有通过 package-owned Interaction Surface 和薄 Desktop composition 才能形成真实用户闭环。该工作必须独立于业务事实与 provider/Gameplay 实现，并在产品晋级后才能开放默认入口。

## What Changes

- 建立 World Library、Studio、launch setup 和 Runtime Webview projections/typed intents。
- 在 Host/preload/renderer 组合 sender-bound typed IPC、scene lifecycle、resource authorization 和可见 diagnostic。
- 通过真实 Electron UI 验证创建、发布、启动、交互、保存、分支、重开和退出释放。

## Capabilities

### New Capabilities

- `world-interaction-surface-and-desktop-loop`: World package UI 与 Desktop 产品组合的真实用户路径。

## Impact

- Owner：`@neko/world-webview` 拥有 presentation；`@neko/host` 拥有 scene contract；Desktop app 仅 wiring 与 trust boundary。
- User data：UI 只调用 deterministic runtime public ports，不直接读写 workspace facts。
- Promotion：实施不得自行删除当前 production gate；开放入口需要独立晋级证据/change。
