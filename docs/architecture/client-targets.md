# 客户端目标与职责边界

状态：Accepted

更新日期：2026-07-17
对应变更：`align-pruned-workspace-build`

OpenNeko 当前只维护 TUI 和 VS Code 两个客户端目标。二者复用 host-neutral contract、领域服务和同一套 Media Engine 契约，但分别拥有宿主生命周期与验收路径。

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

VS Code 客户端是保留图形功能的产品组合根，发布面固定为 Engine、Tools、Preview、Assets、Agent、Cut 和 Canvas。

拥有：

- Extension Pack manifest、release channels、VSIX 打包和产品级验收；
- 保留扩展的组合与发布元数据。

各功能 Extension/Webview、命令、provider、Custom Editor 和领域状态继续由 owning package 维护。`apps/neko-vscode` 不复制这些实现。

VS Code Webview 只消费 Extension Host 授权的资源、Engine descriptor 和短生命周期 token。媒体探测、Range、seek、转码、timeline、stream、effect、color 与导出真值属于 Rust Media Engine；Webview 不直接发现或启动 Engine。

## 已移除目标

Home/Electron Desktop/Studio 不再是当前客户端根。Market、Auth、Live、Model、Puppet、Sketch、Story/Scene、Dashboard 和 Device 也不在发布组合中。旧文档若保留这些设计，必须标为 Historical/Superseded，不能作为实现、构建或测试入口。

## 共享与组合边界

- `@neko/shared`、`@neko/host`、`@neko/neko-client`、`@neko/proto`、`@neko/content`、`@neko/entity`、`@neko/search` 提供 host-neutral 能力。
- `@neko/ui` 只提供浏览器/React 公共原语，不拥有 contribution registry、产品生命周期或宿主权限。
- 不存在 Workbench Core 或 Market Core 组合层；保留功能包直接暴露 package-owned adapter，应用根只做显式组合。
- 跨客户端共享可变单例、active-state 切换或应用间内部导入都不是允许的复用方式。

## 验证重点

| 客户端 | 最低验证 |
| --- | --- |
| TUI | 聚焦 build/test；涉及 Agent 行为时运行真实脚本 evaluation |
| VS Code | 保留扩展 build/package、manifest/release 校验；涉及 Webview 时运行 Extension Development Host functional scenario |

相关边界见 [`application-composition.md`](application-composition.md)、[`package-boundaries.md`](package-boundaries.md) 和 [`engine-runtime.md`](engine-runtime.md)。
