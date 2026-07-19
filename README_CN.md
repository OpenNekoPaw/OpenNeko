# OpenNeko

> 本地优先、Agent 驱动的开源内容创作工作台。

[English](./README.md)

[![Status](https://img.shields.io/badge/Status-Alpha-orange)]()
[![License](https://img.shields.io/badge/License-AGPL--3.0--or--later-blue)](./LICENSE)

OpenNeko 面向希望自主掌控项目文件、模型接入和创作流程的创作者。它不是另一个在线模型聚合平台，而是让 Agent 在本地项目中理解上下文、调用创作能力，并把生成结果继续交给画布、素材库、时间线和预览工具处理。

## 核心特点

- **本地项目优先**：素材、角色、项目上下文和创作结果围绕本地工作区组织。
- **自主配置 AI 服务**：支持配置外部 API、兼容 API 和本地 API 服务，不绑定单一模型平台。
- **Agent 驱动创作**：Agent 可以理解当前项目、规划任务、调用工具，并协助生成、分析和迭代内容。
- **连续创作流程**：生成内容可以进入画布、素材库和视频时间线继续编辑、预览与导出。

## 当前能力

| 能力       | 说明                                             |
| ---------- | ------------------------------------------------ |
| 创作 Agent | 项目对话、任务规划、工具调用与多媒体内容生成     |
| 画布       | 组织灵感、参考、分镜、媒体和生成结果             |
| 视频时间线 | 编排音视频、效果与转场，完成预览和导出           |
| 素材与角色 | 管理媒体、角色、变体、引用关系和可复用角色包     |
| 预览与工具 | 预览常用媒体、文档与标准 3D 模型，比较素材，并把反馈交回 Agent |

可用的生成与理解能力取决于你配置的 API、模型权限和本地服务。

## 当前状态

OpenNeko 目前处于 **Alpha** 阶段，以源码体验和产品验证为主。核心创作流程已经可以运行，但安装、升级、兼容性、界面和项目格式仍可能变化。OpenNeko TUI 同时用于验证 Agent、模型、Skill 和工作流。

## 从源码开始

要求 Node.js 24+、pnpm 10 和 VS Code 1.128+；仓库开发工具链固定为 Node.js 24.18.0 LTS。

```bash
pnpm install
pnpm build
```

常用验证命令：

```bash
pnpm test
pnpm check
```

## 项目入口

- [OpenNeko 创作工作台](./apps/neko-vscode/)：图形化创作、编辑、预览与 Agent 协作。
- [OpenNeko TUI](./apps/neko-tui/)：Agent、模型、Skill 和工作流的终端实验入口。

## 文档与参与

- [文档导航](./docs/README.md)
- [进行中的产品与功能变更](./openspec/changes/)
- [仓库开发规则](./AGENTS.md)

欢迎提交真实创作场景、可复现问题、Skill、模型接入、创作能力、测试和文档改进。

## License

OpenNeko 使用 GNU Affero General Public License v3.0 or later，详见 [LICENSE](./LICENSE)。
