# OpenNeko

> AIGC 内容创作 IDE + 创作 Agent + 媒体引擎，集成在 VS Code 内。

[English](./README.md)

[![Status](https://img.shields.io/badge/Status-Alpha-orange)]()
[![License](https://img.shields.io/badge/License-AGPL--3.0--or--later-blue)]()
[![VS Code](https://img.shields.io/badge/VS%20Code-1.128+-blue)]()

OpenNeko 是一个面向 AI 原生内容创作工作流的 monorepo。它把创作 Agent、画布、视频时间线、媒体预览、素材管理和媒体分析工具整合到 VS Code，并通过 TUI 提供 Agent 与模型验证入口。

本仓库采用契约优先架构：

- Webview 只负责 UI 与交互。
- Extension Host 负责 VS Code API、工作区集成、权限和生命周期编排。
- Rust Engine 负责媒体编解码、GPU 处理、文件 Range/seek、流传输和导出。
- Protobuf、共享类型和 Engine client 保持跨层契约显式。
- 契约违背、未知能力和缺失依赖默认 fail-visible，不通过 fallback 伪装成功。

## 产品结构

| 层级       | 职责                                                                            |
| ---------- | ------------------------------------------------------------------------------- |
| 创作 IDE   | Canvas、Cut、Preview、Assets、Tools                                             |
| 创作 Agent | 意图理解、Skill 激活、能力发现、规划、工具执行、富媒体投递、感知与记忆          |
| 媒体引擎   | Rust sidecar 驱动的编解码、音视频处理、GPU 合成、时间线播放、流传输、代理与导出 |

## 客户端产物

OpenNeko 当前按两个客户端产物分工：

| 产物                | Canonical root     | 核心目标                                                    |
| ------------------- | ------------------ | ----------------------------------------------------------- |
| OpenNeko TUI        | `apps/neko-tui`    | Agent runtime、模型质量、消融、回归和结构化 Evaluation 证据 |
| OpenNeko for VSCode | `apps/neko-vscode` | 聚合保留的领域扩展，提供创作、编辑、预览与编排入口          |

产品 composition 位于 `apps/*`；共享契约、Agent runtime、领域实现、Extension/Webview 与 Engine client 位于 `packages/*`。

## Workspace 包

| 分组             | 包                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------- |
| 核心契约与宿主   | `neko-types`, `neko-proto`, `neko-client`, `neko-content`, `neko-host`, `neko-ui`       |
| Agent 与项目接地 | `neko-agent`, `neko-entity`, `neko-search`, `neko-skills`                               |
| 创作界面         | `neko-canvas`, `neko-cut`, `neko-preview`, `neko-assets`, `neko-tools`, `neko-markdown` |
| 媒体引擎         | `neko-engine`                                                                           |

## 当前重点

当前重点是让裁剪后的核心创作链路稳定、可验证、可发布：

1. 收敛 PI Agent runtime、Skill 与 capability 路由的唯一执行路径。
2. 保持 Rust Engine 作为媒体编解码、GPU、Range/seek、流传输与导出的权威实现。
3. 打通 Agent、Canvas、Cut、Preview、Assets 与 Tools 的稳定创作链路。
4. 保持 Webview、Extension Host、共享契约与 Engine 的职责边界。
5. 用 Agent Evaluation、包级测试和 VS Code Webview 功能测试验证真实运行路径。

## 快速开始

要求：Node.js 24+、pnpm 10、VS Code 1.128+；修改 Rust Engine 时还需要 Rust toolchain 与本地 FFmpeg 依赖。

```bash
pnpm install
pnpm build
pnpm test
pnpm check
```

Rust Engine：

```bash
cd packages/neko-engine
cargo test --workspace
```

## 仓库结构

| 路径                         | 作用                             |
| ---------------------------- | -------------------------------- |
| `apps/`                      | 当前产品构建、测试、打包与发布根 |
| `packages/`                  | Workspace 包和 VS Code 扩展      |
| `openspec/changes/`          | 活跃 OpenSpec change             |
| `docs/architecture/`         | 系统级约束、ADR 与架构说明       |
| `quality/`                   | 供脚本和 CI 消费的质量门禁输入   |
| `README.md` / `README_CN.md` | 项目入口                         |
| `AGENTS.md`                  | 仓库工作规则                     |

## 文档

| 想了解                       | 入口                                                         |
| ---------------------------- | ------------------------------------------------------------ |
| 项目定位、产品结构、快速开始 | [README_CN.md](./README_CN.md)                               |
| 文档导航                     | [docs/README.md](./docs/README.md)                           |
| 系统级架构与 ADR             | [docs/architecture/README.md](./docs/architecture/README.md) |
| 活跃设计和实现变更           | [openspec/changes/](./openspec/changes/)                     |
| 质量门禁机器输入             | [quality/README.md](./quality/README.md)                     |
| 仓库工作规则                 | [AGENTS.md](./AGENTS.md)                                     |

稳定系统约束进入 `docs/architecture/`，开发中的需求、设计、规格和任务进入 `openspec/changes/`，包私有实现说明进入 `packages/<pkg>/docs/`。

## 贡献

提交改动前请守住架构边界：

1. Webview、Extension Host、Rust Engine、共享契约保持分层。
2. 跨包改动从契约和小接口开始。
3. 新状态机、公共契约和失败路径需要聚焦验证。
4. 文档只描述当前决策和不变量，不保留过时代码样例或完成日志。

## License

GNU Affero General Public License v3.0 or later。详见 [LICENSE](./LICENSE)。
