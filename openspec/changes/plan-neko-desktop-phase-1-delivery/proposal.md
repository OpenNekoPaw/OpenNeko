## Why

Electron Desktop Phase 1 已完成 foundation、Shell 与主要 package composition，但 Agent/Home、
Assets/Canvas、Cut/Preview/resource、support domains 和 packaged qualification 仍需按唯一依赖链
闭合。本 program 只协调 current child changes，不重复实现 runtime。

## What Changes

- 以 Electron Desktop 为唯一 product composition root。
- 固定 Home → Content Project → Agent/Media Library/Canvas/Cut/Preview → Generation/Export 的
  Phase 1 vertical workflow。
- 将每个剩余 gate 分配给一个 focused child change；program 只记录依赖和完成条件。
- ContentLocator 是 durable public identity；Main-owned resource gateway 是 renderer media 的
  唯一 materialization path。
- CI deterministic evidence、real-provider Agent Evaluation 和 graphical Electron acceptance 分离。
- 以 `darwin-arm64` 完整图形路径为 Phase 1 reference；`win32-x64` 保留 build/startup evidence。

## Capabilities

### New Capabilities

- `desktop-phase-1-delivery-plan`: current Desktop Phase 1 ownership、依赖、纵向验收与证据边界。

### Modified Capabilities

<!-- None. -->

## Impact

- 所有仍活动的 Desktop child changes 与最终 qualification change。
- 不恢复旧 Host、Engine、private media scheme、demo surface 或并行 product root。
