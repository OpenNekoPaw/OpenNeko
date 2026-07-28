# 客户端目标与职责边界

状态：Accepted

更新日期：2026-07-27
对应变更：`retire-neko-engine-before-node-media-rebuild`、
`bootstrap-neko-desktop-foundation`

OpenNeko 当前发布支持仍只覆盖 TUI 和 VS Code。Desktop 已开始 Phase 1 foundation
实施，但在领域子包完成接入和资格验收前不构成受支持客户端。三个组合根复用
host-neutral contract 与领域服务，并分别拥有宿主生命周期与验收路径。

## OpenNeko TUI

TUI 是 Agent-first 的终端与 headless authoring 入口。

拥有：

- 终端生命周期、workspace 选择、命令路由和输出投影；
- Node/headless host adapter 与应用级依赖注入；
- TUI 可执行物、打包和验收。

不拥有：

- AgentSession、Skill、provider 或领域 capability 的核心语义；
- VS Code API、React/Webview 或扩展清单；
- 被移除 Market 命令、registry 安装或兼容入口。

## OpenNeko for VS Code

VS Code 客户端是保留图形功能的产品组合根，发布面固定为 Tools、
Preview、Assets、Agent、Cut 和 Canvas。

拥有：

- Extension Pack manifest、release channels、VSIX 打包和产品级验收；
- 保留扩展的组合与发布元数据。

各功能 Extension/Webview、命令、provider、Custom Editor 和领域状态继续由 owning package 维护。`apps/neko-vscode` 不复制这些实现。

VS Code Webview 只消费 Extension Host 授权的 loopback URL、媒体
descriptor 和短生命周期 token。工作区文件访问、FFmpeg/ffprobe 进程、
Range、PCM、代理与导出由 Extension Host 中的 `@neko/media/node`
adapter 拥有；Webview 只使用浏览器 `<video>`、MSE 和 PCM client，不直接
访问 Node、文件路径或启动 FFmpeg。

## OpenNeko Desktop foundation

`apps/neko-desktop` 当前拥有 Electron main/preload/renderer、typed bridge、窗口/AppHost
生命周期、Electron Host ports、安全策略和 arm64 macOS 打包基线。当前 renderer 只显示
真实 bootstrap projection，不包含 mock 项目、Agent 或编辑器功能。

Desktop 尚不拥有 Phase 1 后续 Shell/领域接入、Phase 2 跨平台发布或 Phase 3
MCP/插件/专业工具能力，因此不得从应用可启动推断这些功能已经支持。

## 已移除与后续目标

旧 Home、旧 Electron Desktop/Studio 不再是当前客户端根。Market、Auth、Live、Model、
Puppet、Sketch、Story/Scene、Dashboard 和 Device 也不在发布组合中。旧文档若保留这些
设计，必须标为 Historical/Superseded，不能作为新 Desktop 的实现、构建或测试入口。

新的 Electron Desktop 已开始第一阶段，不改变上述当前发布事实。其前端/子包接入、
跨平台资格和 MCP/插件/专业工具集成按
[`../../ROADMAP_CN.md`](../../ROADMAP_CN.md) 分三阶段推进；每一阶段必须先有独立
OpenSpec 和真实运行证据，不能从 foundation 或路线图文字推断完整支持。

## 共享与组合边界

- `@neko/shared`、`@neko/host`、`@neko/media`、`@neko/proto`、`@neko/content`、`@neko/entity`、`@neko/search` 提供 host-neutral 能力。
- `@neko/ui` 只提供浏览器/React 公共原语，不拥有 contribution registry、产品生命周期或宿主权限。
- 不存在 Workbench Core 或 Market Core 组合层；保留功能包直接暴露 package-owned adapter，应用根只做显式组合。
- 跨客户端共享可变单例、active-state 切换或应用间内部导入都不是允许的复用方式。

## 验证重点

| 客户端 | 最低验证 |
| --- | --- |
| TUI | 聚焦 build/test；涉及 Agent 行为时运行真实脚本 evaluation |
| VS Code | 保留扩展 build/package、manifest/release 校验；涉及 Webview 时运行 Extension Development Host functional scenario |
| Desktop | Forge package、contract/security test、隔离 Electron 启动/reload/close/quit smoke；领域功能按 owning package 增加场景 |

相关边界见 [`application-composition.md`](application-composition.md)、[`package-boundaries.md`](package-boundaries.md) 和 [`media-runtime.md`](media-runtime.md)。
