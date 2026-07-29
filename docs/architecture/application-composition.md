# 应用组合根

状态：Accepted

更新日期：2026-07-27
对应变更：`retire-neko-engine-before-node-media-rebuild`、
`bootstrap-neko-desktop-foundation`

OpenNeko 将可安装产品与可复用平台、领域包分开。当前发布产品仍是终端客户端和
VS Code 客户端；`apps/neko-desktop` 已进入 Phase 1 foundation 实施，但尚未成为
功能完整或受支持的发布产品。应用目录拥有宿主生命周期、产品清单、打包和发布入口，
不拥有领域实现。

> 本文记录当前已接受实现。VS Code 收敛为一个真实扩展、VS Code-only adapter
> 迁入应用组合根以及 workspace 单层化的目标由
> [`adr-single-extension-single-level-workspace-and-shared-ownership-boundary.md`](adr-single-extension-single-level-workspace-and-shared-ownership-boundary.md)
> 跟踪；该 ADR 仍为 Proposed，在对应阶段完成前不改变下述当前事实。

## 当前组合根

| 层级                        | Canonical root                                                                                                                                                  | 拥有                                                                                                  | 不得拥有                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| OpenNeko TUI                | `apps/neko-tui`                                                                                                                                                 | 终端生命周期、workspace 选择、命令路由、Node/headless 组合、TUI 打包                                  | AgentSession 语义、领域 capability 实现、React/Webview UI、VS Code adapter |
| OpenNeko for VS Code        | `apps/neko-vscode`                                                                                                                                              | Extension Pack 清单、保留扩展组合、VSIX 打包和发布验收                                                | 领域 Extension、Custom Editor、Webview root、领域命令/provider 实现        |
| OpenNeko Desktop foundation | `apps/neko-desktop`                                                                                                                                             | Electron main/preload/renderer、安全 bridge、窗口/AppHost 生命周期、Electron Host ports、Desktop 打包 | 领域事实、跨领域万能 command router、VS Code transport、Phase 2/3 能力     |
| 共享平台                    | `packages/neko-types`、`packages/neko-host`、`packages/neko-media`、`packages/neko-content`、`packages/neko-ui`、`packages/neko-entity`、`packages/neko-search` | host-neutral contract、Node/browser 媒体 runtime、内容语义、共享 UI、实体与搜索服务                   | 产品生命周期、产品清单、领域实现、对 `apps/*` 的依赖                       |
| 保留领域包                  | `packages/neko-agent`、`packages/neko-assets`、`packages/neko-canvas`、`packages/neko-cut`、`packages/neko-preview`、`packages/neko-tools`                      | 领域 core、authoring、validation、capability、包自有 host adapter 和 UI root                          | 产品组合、对 `apps/*` 的依赖、平行应用级领域实现                           |
| Media runtime               | `packages/neko-media`                                                                                                                                           | 媒体 contract、FFmpeg process、loopback Range/PCM、browser HTML video/PCM client                      | 产品导航、项目事实、领域 timeline、UI                                      |

## 依赖方向

```text
apps/*
  -> package public entries
  -> host/platform/domain contracts
  -> media/content/shared contracts

packages/* -X-> apps/*
```

- 应用内可以使用本应用根下的相对导入，但不得进入 `packages/*/src` 或其他应用内部目录。
- 共享包和领域包不得导入应用实现。
- 每个领域 surface 仍由 owning package 提供；TUI、VS Code 和 Desktop 只选择其公共
  adapter/projection，不复制领域逻辑。
- `@neko/host/application` 是通用应用身份和 handoff 契约，不会仅凭一个 identity 创建或授权产品组合根。

## 产品矩阵

| 产品                 | 当前职责                                                                                                 | 真实宿主验证                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| OpenNeko TUI         | Agent-first 终端与 headless authoring 入口                                                               | 聚焦 TUI build/test 和真实 Agent evaluation                                                   |
| OpenNeko for VS Code | Tools、Preview、Assets、Agent、Cut、Canvas 与 Node/FFmpeg 媒体 adapter 的发布组合                        | Extension build/package、Extension Development Host、聚焦 Webview functional scenario         |
| OpenNeko Desktop     | Phase 1 foundation；当前只交付安全宿主、typed bridge 和最小 renderer bootstrap，不代表领域功能或发布支持 | arm64 macOS Forge package、真实 Electron 启动/reload/close/quit smoke、contract/security test |

旧 Home、旧 Desktop/Studio、Market、Auth、Live、Model、Puppet、Sketch、Story/Scene、
Dashboard 和 Device 不是当前发布入口。不得用 alias、兼容包、空命令或成功 no-op 恢复
它们。新的 `apps/neko-desktop` 只按已接受 OpenSpec 分期实施，不继承旧 Desktop 或
`neko-home` 身份。

## 生命周期与错误语义

- TUI、VS Code 和 Desktop 分别拥有自己的可变运行时状态、配置投影、异步任务和资源句柄。
- 领域 operation/event 必须携带其 canonical instance identity；不得回退到“当前 active”实例。
- 缺失 package adapter、未知 product id、未注册 handler 或被移除的入口必须 fail-visible。
- FFmpeg 进程、loopback HTTP 和 stream 的发现、授权、取消与释放由宿主组合层负责；Webview 不拥有这些生命周期。

## 验证约束

- 根构建、发布、质量和 smoke 编排只包含保留产品与扩展。
- Desktop foundation 进入根构建和质量门禁，但不进入当前发布产品声明。
- VS Code Extension Pack 与 release channels 必须恰好包含 Tools、Preview、Assets、Agent、Cut 和 Canvas。
- `workspace:*` 依赖必须唯一解析；应用边界检查必须阻止 package-to-app 和跨应用内部导入。
- 运行态验收必须使用对应真实宿主；普通浏览器不能替代 VS Code Extension Development
  Host 或 Electron Desktop。
