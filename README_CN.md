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

## 当前 Desktop 能力

| 已接入表面 | 当前边界                                                 |
| ---------- | -------------------------------------------------------- |
| 创作 Agent | Desktop 项目对话、上下文、工具调用和受控内容生成         |
| 画布       | 组织 Markdown、媒体、文件、分组、生成 Job 和 Canvas 引用 |
| 视频时间线 | 轻量音视频编排、预览和 Node/FFmpeg 导出                  |
| 媒体与实体 | 浏览工作区/全局媒体库，恢复项目连接并投影实体表现绑定    |
| 只读预览   | 预览常用文档、图片、音视频和受支持的标准 3D 模型         |

可用的生成与理解能力取决于你配置的 API、模型权限和本地服务。

项目文件只保存可移植的媒体引用，不保存本机媒体库目标。同步或克隆到另一台机器后，Desktop
会显示缺失的项目媒体库并要求显式恢复连接；普通同步不会复制外部媒体字节。需要完整移交时，可
创建只收集项目实际引用媒体的独立便携快照。全局资源中心与项目资源管理器保持独立状态。

仓库还保留 Chara、Search、Quality 和媒体比较 Tools 等领域包，但它们尚未全部形成 Desktop
产品路径。角色项目、Interactive World、专业工具接入和独立素材比较界面当前必须视为 unavailable
或规划中能力，不能仅因子包存在而视为已经可用。

## 当前状态

OpenNeko 目前处于 **Alpha** 阶段，以源码体验和产品验证为主。Desktop 基础、Agent、媒体库、Canvas、Cut 和 Preview 已建立真实组合路径，但 Phase 1 完整创作闭环尚未完成，当前不是受支持的发布产品。安装、升级、兼容性、界面和项目格式仍可能变化。Electron Desktop 是唯一产品宿主；Agent、模型、Skill 和工作流验证也以 Desktop 组合边界为准。

## 从源码开始

要求 Node.js 24+ 和 pnpm 10；仓库开发工具链固定为 Node.js 24.18.0 LTS。

Desktop 原生打包/发布目标仅限：

| 系统  | 架构  | 当前 Desktop 资格                                      |
| ----- | ----- | ------------------------------------------------------ |
| macOS | ARM64 | Forge package 已验证；Developer ID/公证 Release 已建门禁 |

Windows x64 与 Linux 只运行 typecheck、orchestration、SQLite 和 host-neutral CI，不调用
Forge、不生成 Desktop artifact。Intel Mac 与其他架构不支持。

```bash
pnpm install
pnpm build
pnpm dev:desktop
```

`pnpm build`、`pnpm dev:desktop`、`pnpm package:desktop` 和 `pnpm make:desktop` 只允许在
Apple Silicon macOS 运行；Windows/Linux 使用 CI platform-test 或
`pnpm check:static-build` 做确定性验证。

常用验证命令：

```bash
pnpm test
pnpm check
pnpm gate:local
```

## 开发与发布

除 `main` 外的非空分支名都属于开发分支，普通开发分支 push 不自动运行 GitHub Actions；提交前使用 `pnpm gate:local`，需要 GitHub runner 证据时从 Actions 手动运行 CI。`main` 是唯一发布分支，只接受开发分支到 `main` 的 Pull Request；`Merge Gate` 必须完成完整源码检查。

正式 Release workflow 只接受 `main` 历史上的精确 `v<Desktop version>` tag，在 Apple
Silicon runner 上完成 Developer ID、hardened runtime、公证、staple、Gatekeeper、ZIP 与
SHA-256 后才创建 GitHub Release。缺失 Apple 凭据时 fail-visible；本地 package/make 保持
ad-hoc 签名且不构成公开发布证据。

## 项目入口

- [OpenNeko Desktop](./apps/neko-desktop/)：图形化创作、编辑、预览与 Agent 协作的唯一应用组合根。

## 仓库结构

- `apps/neko-desktop`：唯一 Electron 应用组合根，只拥有宿主生命周期、typed IPC、安全边界和产品 shell。
- `packages/<family>/<role>`：具有独立依赖闭包的领域家族，例如 `packages/agent/runtime`、`packages/assets/webview`。
- `packages/<name>`：单一依赖闭包的 package，例如 `packages/media`、`packages/shared`、`packages/ui`。
- `quality/`：package role、测试 ownership 和债务台账等机器可读治理输入，不是运行时 package。
- `openspec/changes/`：仍在设计或实施中的变更。

所有内部 package 统一使用 `@neko/*` scope。分组 package 使用
`@neko/<family>-<role>`，单体 package 使用 `@neko/<name>`；不得通过旧 scope、目录 alias
或直接导入 `packages/**/src` 绕过 public exports。完整规则见
[Package 角色与命名](./docs/architecture/package-taxonomy.md)和
[Package 边界](./docs/architecture/package-boundaries.md)。

## 文档与参与

- [文档导航](./docs/README.md)
- [Desktop 开发路线图](./ROADMAP_CN.md)
- [参与开发](./CONTRIBUTING_CN.md)
- [进行中的产品与功能变更](./openspec/changes/)
- [仓库开发规则](./AGENTS.md)

欢迎提交真实创作场景、可复现问题、Skill、模型接入、创作能力、测试和文档改进。

## License

OpenNeko 使用 GNU Affero General Public License v3.0 or later，详见 [LICENSE](./LICENSE)。
