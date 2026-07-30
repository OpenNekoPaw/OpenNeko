# 客户端目标与职责边界

状态：Accepted

更新日期：2026-07-31
对应变更：`flatten-desktop-only-monorepo`

OpenNeko 当前只有一个客户端目标：Electron Desktop。它由 `apps/neko-desktop` 组合所有
保留的 Agent、Assets、Canvas、Cut、Preview、Tools、共享和媒体能力。

## OpenNeko Desktop

Desktop 拥有：

- Electron Main/preload/renderer 生命周期和安全策略；
- sender-bound typed IPC、窗口与项目状态、文件/凭据/外部 provider 授权；
- Node/FFmpeg 媒体 adapter、loopback Range/PCM session 和资源释放；
- package-owned browser UI 的组合、Desktop 构建与 Forge 打包。

Desktop 不拥有：

- Agent、Canvas、Cut、Entity、Generation 或其他领域事实的应用级副本；
- 通用文件系统、shell 或 `ipcRenderer` 暴露；
- package internal imports、跨实例共享 mutable runtime 或 removed-host compatibility。

## Package 复用

- `@neko/shared`、`@neko/host`、`@neko/media`、`@neko/content`、`@neko/entity`、
  `@neko/search` 提供 host-neutral 能力。
- `@neko/ui` 和一级 Webview package 只提供 browser-safe React UI。
- Agent、Canvas、Cut、Preview、Tools 等领域由各自一级 package 拥有 contract、
  runtime/node adapter 和 UI；Desktop 通过 public entry 显式注入。
- 未来新增另一应用宿主必须先建立独立 OpenSpec 和真实 adapter 需求；当前不保留
  speculative multi-host registry。

## 已移除目标

VS Code Extension 和 TUI 已从 workspace、依赖、脚本、CI 和发布配置移除。它们的未发布
本地 state 不迁移到 Desktop，也不构成兼容要求；项目文件与 Desktop settings 保持不变。
旧宿主 message、command、manifest、VSIX 或 adapter 被重新引入时必须由拓扑/边界检查
fail-visible。

## 验证重点

| 层级             | 最低验证                                                                      |
| ---------------- | ----------------------------------------------------------------------------- |
| Contract/domain  | owning package tests、typecheck/build、生产者/消费者路径断言                  |
| Main/preload/IPC | Desktop contract/security tests、unknown message 与 stale identity rejection  |
| Renderer/UI      | package build/test，加真实 Electron visual/interaction/CSP/message 场景       |
| Media            | Node/FFmpeg focused tests、Range/PCM/取消/释放和 production bundle inspection |
| Product          | `pnpm package:desktop`、隔离 fixture project-open 与受影响 creative surface   |

相关边界见 [`application-composition.md`](application-composition.md)、
[`package-boundaries.md`](package-boundaries.md) 和 [`media-runtime.md`](media-runtime.md)。
