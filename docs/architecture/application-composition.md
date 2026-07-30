# 应用组合根

状态：Accepted

更新日期：2026-07-31
对应变更：`flatten-desktop-only-monorepo`

OpenNeko 只有一个可执行产品组合根：`apps/neko-desktop`。一级 `packages/*` workspace
提供 host-neutral contract、领域 runtime、Node adapter 和 browser-safe UI；应用根负责把它们
组合为 Electron Main、preload 和 renderer 运行时，不拥有第二份领域实现。

## 当前组合

| 层级                | Canonical root                                                           | 拥有                                                                                    | 不得拥有                                                  |
| ------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Desktop application | `apps/neko-desktop`                                                      | Electron 生命周期、Main/preload/renderer、typed IPC、文件与凭据授权、窗口状态、产品打包 | 领域事实副本、跨领域万能 router、package internal imports |
| Host/runtime        | `packages/neko-host`、`packages/neko-media`、各领域 runtime/node package | host-neutral ports、Node/FFmpeg 执行、资源生命周期                                      | React UI、应用生命周期、对 `apps/*` 的依赖                |
| Browser UI          | `packages/neko-ui`、一级 `*-webview` package、`packages/neko-assets`     | React UI、交互、browser media client、package-owned Desktop host port                   | Node/Electron API、文件路径、持久事实、后台任务 owner     |
| L0/domain           | `packages/neko-types` 与各领域 contract/core package                     | 类型契约、领域规则、authoring、validation                                               | Electron、React、应用内部实现                             |

## 依赖方向

```text
apps/neko-desktop
  -> package public entries
  -> host/runtime/domain contracts
  -> shared or package-owned L0 contracts

packages/* -X-> apps/*
renderer/webview packages -X-> electron or node:*
```

- 所有保留 workspace package 的 `package.json` 必须直接位于 `packages/<name>`。
- Desktop 只能通过 package public entry 组合能力，不得导入 `packages/*/src`。
- Main 拥有文件、凭据、进程、窗口和后台资源；preload 只投影最小 typed port；renderer
  只拥有浏览器 UI 和可恢复展示状态。
- 每个 runtime/session/task/editor 实例独立拥有可变状态和资源，active selection 只选择
  展示投影，不是状态 owner。
- 缺失 Desktop adapter、未知 IPC message、过期 instance identity 或被移除宿主入口必须
  fail-visible。

## 已移除宿主

VS Code Extension、TUI、VSIX、Extension Development Host、`host-vscode` adapter 和
`acquireVsCodeApi` bridge 不再是产品、开发、测试或发布入口。不得通过 alias、动态 optional
import、兼容 package、fallback transport、空命令或成功 no-op 恢复这些路径。

历史归档文档可以保留旧宿主事实；active architecture、当前 OpenSpec 和 executable
configuration 必须以 Desktop 为唯一 canonical path。

## 数据与资源

- 项目文件和 Desktop settings 是受保护用户数据；宿主清理不得删除、覆盖或静默迁移它们。
- 已移除的未发布 VS Code/TUI state 不导入 Desktop，也不作为 fallback。
- FFmpeg/ffprobe、loopback Range/PCM、watcher、临时 URL 和 token 由 Main 或 owning Node
  adapter 创建、授权、取消和释放。
- renderer 只消费 opaque descriptor、URL 或短生命周期 handle，不接收 raw local path、
  credential、SQLite path 或 process handle。

## 验证

- `node scripts/check-desktop-only-topology.mjs` 证明只有一个应用根、一级 package 和无
  removed-host production path。
- `pnpm check:application-boundaries` 验证 package-to-app、renderer-to-Node/Electron 和
  Main-to-React 依赖违规。
- `pnpm test`、`pnpm build`、`pnpm check` 验证生产者/消费者、workspace resolution 和依赖图。
- `pnpm package:desktop` 检查 Electron 生产包；涉及用户路径时还需真实 Desktop
  project-open/creative-surface 场景。
