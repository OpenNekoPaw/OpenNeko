# 客户端目标与职责边界

状态：Accepted

更新日期：2026-07-31
当前宿主：Electron Desktop

OpenNeko 当前只有一个客户端目标：Electron Desktop。`apps/neko-desktop` 当前组合
Agent、Assets/Entity、Canvas、Cut、Preview、Generation、共享与媒体能力。保留在 workspace
但没有 Desktop consumer 的 Chara、Search、Quality 和媒体比较 Tools 不属于当前产品能力。

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

### 构建平台闭集

Desktop 原生构建目标精确为：

| Target         | 原生构建 Host       | 当前证据                                             |
| -------------- | ------------------- | ---------------------------------------------------- |
| `darwin-arm64` | Apple Silicon macOS | 本地 Forge package 已验证                            |
| `win32-x64`    | x64 Windows         | GitHub Actions 原生 package 门禁；完整运行态资格待补 |

Linux 只运行 lint、测试、OpenSpec、依赖分析和 browser-safe build 等 host-neutral
检查，不调用 Forge，不生成 Linux Desktop artifact。Intel macOS、Windows ARM/IA32
和其他目标在 Forge 前 fail-visible。原生 package 成功只证明构建闭包，不能替代安装、
启动、凭据、媒体/GPU、文件和完整创作路径资格。

## Package 复用

- `@neko/shared`、`@neko/host`、`@neko/media`、`@neko/content` 和 `@neko/entity-domain`
  提供当前 Desktop 路径使用的 host-neutral 能力。
- `@neko/ui` 和一级 Webview package 只提供 browser-safe React UI。
- Agent、Assets、Canvas、Cut、Preview 和 Generation 由各自 owning package 拥有 contract、
  runtime/node adapter 或 UI；Desktop 通过 public entry 显式注入。
- `@neko/chara`、`@neko/search-domain` 和 `@neko/quality` 仍是保留 package；
  接入前必须建立真实 Desktop composition、产品入口和路径级验收，不能因 package 存在而
  宣称能力可用。
- 未来新增另一应用宿主必须先建立独立 OpenSpec 和真实 adapter 需求；当前不保留
  speculative multi-host registry。
- 未形成 Desktop producer 的 Tools media-diff 原型已经退役，不作为客户端能力目录项。

## 验证重点

| 层级             | 最低验证                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| Contract/domain  | owning package tests、typecheck/build、生产者/消费者路径断言                                   |
| Main/preload/IPC | Desktop contract/security tests、unknown message 与 stale identity rejection                   |
| Renderer/UI      | package build/test，加真实 Electron visual/interaction/CSP/message 场景                        |
| Media            | Node/FFmpeg focused tests、Range/PCM/取消/释放和 production bundle inspection                  |
| Product          | macOS/Windows 原生 `pnpm package:desktop`、隔离 fixture project-open 与受影响 creative surface |

相关边界见 [`application-composition.md`](application-composition.md)、
[`package-boundaries.md`](package-boundaries.md) 和 [`media-runtime.md`](media-runtime.md)。
