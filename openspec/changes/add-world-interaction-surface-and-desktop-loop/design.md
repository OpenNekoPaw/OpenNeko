## Context

前置条件是 canonical contracts 与 deterministic runtime。Desktop 是唯一 Electron composition root，但 host-neutral workflow 仍由 World application service 决定。

## Decisions

- Library/Studio/Runtime 是当前 scene，不创建通用 Session 或保留隐藏 Roots。
- Webview 只渲染 snapshot/projection 并提交 typed intents；Main 做 sender/path/resource authorization 和 concrete adapter wiring。
- scene 离开时卸载 UI/昂贵资源；durable facts 和受保护后台 runtime 不因 UI 生命周期改变。
- unavailable、stale、denied 和 invalid record 均可见且 fail-local，不回退到 Foundation raw path 或默认 profile。

## Canonical Path

`user control -> Webview intent -> preload typed port -> Main authorization -> World public service -> projection event -> visible surface`。

## User Data

Renderer 不持有 authoritative data。presentation snapshot 只保存可丢弃布局/选择，不复制 World facts。
