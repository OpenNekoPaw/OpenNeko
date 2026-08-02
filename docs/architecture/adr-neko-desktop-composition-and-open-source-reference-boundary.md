# ADR: OpenNeko Desktop 组合与复用边界

状态：Accepted

更新日期：2026-08-01

范围：`apps/neko-desktop`、`packages/*` 与 `packages/*/*` canonical workspace、Electron Main/preload/renderer、领域 runtime、Agent、媒体与外部专业工具。

## 决策

`apps/neko-desktop` 是唯一产品组合根。它组合既有 owning package 的公共入口，拥有 Electron
生命周期、typed IPC、安全策略、文件与凭据授权、窗口、资源 registry 和产品打包；领域事实、
领域 operation、媒体算法与 UI primitive 继续由 owning package 持有。

```text
Electron renderer
  -> preload typed Desktop ports
  -> Desktop Main controllers
  -> package application/runtime ports
  -> domain core / Node-FFmpeg adapters / external providers
```

## 五层边界

| 层   | 决策                                                                                 |
| ---- | ------------------------------------------------------------------------------------ |
| 职责 | App 只组合和管理宿主生命周期；领域 package 拥有业务事实与操作。                      |
| 依赖 | `apps/neko-desktop -> package public entry -> L0 contract`；package 不反向依赖 app。 |
| 接口 | Main/preload/renderer 只通过 package-owned typed contract 和最小 Desktop port 通信。 |
| 扩展 | 新领域先建立 owning package contract/application port，再由 Desktop 显式注入。       |
| 测试 | package 测 contract/domain；Desktop 测 IPC、安全、组合、资源释放和真实用户路径。     |

## Package 复用

| 能力                         | Owner                                                  | Desktop 组合方式                                                    |
| ---------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| Agent                        | `packages/agent/{contracts,runtime,webview}`           | Main 拥有 session registry 与 Host adapter；renderer 只消费对话投影 |
| Canvas                       | `packages/canvas/{domain,node,webview}`                | package-owned authoring/host port 与 browser-safe UI                |
| Cut                          | `packages/cut/{domain,node,webview}`                   | OTIO/application port、Node/FFmpeg adapter 与 renderer UI           |
| Preview                      | `packages/preview/{domain,webview}`                    | 授权只读 session、资源 descriptor 与 browser renderer               |
| Assets/Entity                | owning domain packages                                 | ContentLocator、domain facade、Desktop 文件授权和 React surface     |
| Generation/Quality/Character | owning domain packages                                 | 只有建立真实 Desktop入口、adapter 和路径级验收后才成为产品能力      |
| Shared UI/infra              | `@neko/ui`、`@neko/shared`、package-owned L0 contracts | 复用公共入口，不在应用根复制 design system、日志、错误或 DTO        |

## 运行时所有权

每个 Window、Project、Conversation、Agent Run、Tool Call、Canvas/Cut document、media session
和领域 Job 都有显式 identity 与独立生命周期。active tab 或当前 project 只选择展示投影，
不得成为共享状态 owner。跨窗口共享对象由 Main 中单一 registry owner 通过消息传递协调。

Renderer 只保存输入草稿、滚动、选择、布局和可恢复 view state。项目事实、后台任务、文件 IO、
权限、provider credential、媒体进程与 watcher 由 Main 或 owning Node/domain service 管理。
preload 不暴露通用文件系统、shell、`ipcRenderer` 或任意 channel。

## 资源与安全

本地内容先由 owning service 解析并授权，再注册为短生命周期 opaque resource。resource URL
与 `ContentLocator`、项目 identity、磁盘路径保持分离。registration 绑定 sender、Window/View、
session、renderer epoch 和 generation；reload、replace、detach、cancel 与 quit 必须撤销资源并
终止子进程、stream 和 watcher。

Renderer 保持 sandbox、context isolation、`webSecurity` 与最小 CSP。未知 IPC、schema、sender、
instance identity 或资源请求必须 fail-visible。

## 外部参考的使用原则

外部 Desktop Agent、编辑器和专业工具只用于验证产品分层、会话/窗口生命周期、授权、插件安全、
MCP/Computer Use 和 UX 假设，不成为代码基座或运行时依赖。采用任何外部实现前必须重新核验
license、维护状态、安全边界和真实复用成本。

## 验证

- `pnpm check:application-boundaries` 验证 package-to-app、renderer-to-Node/Electron 和 Main-to-React 边界；
- `pnpm build`、`pnpm test`、`pnpm check` 验证 package 生产者/消费者与 workspace 依赖图；
- `pnpm package:desktop` 验证发行闭包；
- IPC、CSP、窗口、焦点、媒体和资源生命周期使用隔离 fixture 的真实 Electron 场景。

相关入口见 [`application-composition.md`](application-composition.md)、
[`client-targets.md`](client-targets.md)、[`package-boundaries.md`](package-boundaries.md)、
[`media-runtime.md`](media-runtime.md) 和
[`adr-neko-desktop-professional-tool-handoff-and-mcp-boundary.md`](adr-neko-desktop-professional-tool-handoff-and-mcp-boundary.md)。
