# OpenNeko Desktop

`apps/neko-desktop` 是 OpenNeko 唯一的 Electron 应用组合根。

## 边界

- 拥有 app、window、view、webContents、CSP、protocol、preload 与 sender-bound IPC。
- 组合各 package 的公共入口、Host adapter 和当前可见产品场景。
- 不拥有领域实体、业务状态机、项目事实、Agent runtime 或媒体业务编排。
- Renderer/Webview 只能通过 preload 暴露的最小 typed port 使用宿主能力。

领域能力与实现分别位于对应的 `packages/*` 或 `packages/<family>/<role>` workspace。完整约束见
[`docs/architecture/application-composition.md`](../../docs/architecture/application-composition.md) 和
[`docs/architecture/package-boundaries.md`](../../docs/architecture/package-boundaries.md)。

## 常用命令

```bash
pnpm --filter @neko/app-desktop typecheck
pnpm --filter @neko/app-desktop test
pnpm --filter @neko/app-desktop lint
pnpm --filter @neko/app-desktop dev
pnpm --filter @neko/app-desktop package
pnpm test:local:media-openneko
```
