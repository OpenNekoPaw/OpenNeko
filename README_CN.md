# OpenNeko

> 本地优先、Agent 驱动的开源内容创作工作台。

[English](./README.md)

[![Status](https://img.shields.io/badge/Status-Alpha-orange)]()
[![License](https://img.shields.io/badge/License-AGPL--3.0--or--later-blue)](./LICENSE)

OpenNeko 面向希望自主掌控项目文件、模型接入和创作流程的创作者。它不是另一个在线模型聚合平台，而是让 Agent 在本地项目中理解上下文、调用创作能力，并把生成结果继续交给画布、媒体库、时间线和预览工具处理。

## 核心特点

- **本地项目优先**：素材、角色、项目上下文和创作结果围绕本地工作区组织。
- **自主配置 AI 服务**：支持配置外部 API、兼容 API 和本地 API 服务，不绑定单一模型平台。
- **Agent 驱动创作**：Agent 可以理解当前项目、规划任务、调用工具，并协助生成、分析和迭代内容。
- **连续创作流程**：生成内容可以进入画布、媒体库和视频时间线继续编辑、预览与导出。

## 当前能力

| 能力       | 说明                                                           |
| ---------- | -------------------------------------------------------------- |
| 创作 Agent | 项目对话、任务规划、工具调用与多媒体内容生成                   |
| 画布       | 组织灵感、参考、分镜、媒体和生成结果                           |
| 视频时间线 | 编排音视频、效果与转场，完成预览和导出                         |
| 媒体与实体 | 通过媒体库管理文件，通过统一实体管理角色、场景和表现绑定       |
| 预览与工具 | 预览常用媒体、文档与标准 3D 模型，比较素材，并把反馈交回 Agent |

可用的生成与理解能力取决于你配置的 API、模型权限和本地服务。

## 当前状态

OpenNeko 目前处于 **Alpha** 阶段，以源码体验和产品验证为主。核心创作流程已经可以运行，但安装、升级、兼容性、界面和项目格式仍可能变化。Electron Desktop 是唯一产品宿主；Agent、模型、Skill 和工作流验证也以 Desktop 组合边界为准。

## 从源码开始

要求 Node.js 24+ 和 pnpm 10；仓库开发工具链固定为 Node.js 24.18.0 LTS。

支持的平台仅限：

| 系统  | 架构  | 当前 Desktop 资格 |
| ----- | ----- | ----------------- |
| macOS | ARM64 | Forge package     |

Windows、Linux 和 Intel Mac 的 Desktop 发布资格仍暂缓。后续启用前必须在对应真实系统验证 Electron 打包、应用启动、原生依赖以及 Node/FFmpeg 媒体读取和导出路径。

```bash
pnpm install
pnpm build
pnpm dev:desktop
```

常用验证命令：

```bash
pnpm test
pnpm check
pnpm gate:local
```

## 开发与发布

除 `main` 外的非空分支名都属于开发分支，普通开发分支 push 不自动运行 GitHub Actions；提交前使用 `pnpm gate:local`，需要 GitHub runner 证据时从 Actions 手动运行 CI。`main` 是唯一发布分支，只接受开发分支到 `main` 的 Pull Request；`Merge Gate` 必须完成完整源码检查。

当前仓库只保留 Electron Desktop 构建与 Forge 打包入口。新增签名、公证、跨平台产物或正式 Release workflow 前，必须通过独立 OpenSpec 定义目标平台、版本来源、产物闭包和真实安装验收。

## 项目入口

- [OpenNeko Desktop](./apps/neko-desktop/)：图形化创作、编辑、预览与 Agent 协作的唯一应用组合根。

## 文档与参与

- [文档导航](./docs/README.md)
- [Desktop 开发路线图](./ROADMAP_CN.md)
- [进行中的产品与功能变更](./openspec/changes/)
- [仓库开发规则](./AGENTS.md)

欢迎提交真实创作场景、可复现问题、Skill、模型接入、创作能力、测试和文档改进。

## License

OpenNeko 使用 GNU Affero General Public License v3.0 or later，详见 [LICENSE](./LICENSE)。
